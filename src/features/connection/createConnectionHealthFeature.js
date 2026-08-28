import { LIVE_CONNECTION_INTERRUPTED_MESSAGE } from "../../network/liveSubmissionRecovery.js";

function safeInvoke(callback, ...args) {
  try {
    const result = callback?.(...args);
    result?.catch?.(() => {});
  } catch (_) {}
}

export function createConnectionHealthFeature(
  { getKernel, scope },
  {
    clearIntervalFn = clearInterval,
    clearTimeoutFn = clearTimeout,
    documentTarget = globalThis.document,
    now = Date.now,
    setIntervalFn = setInterval,
    setTimeoutFn = setTimeout,
    windowTarget = globalThis.window,
  } = {}
) {
  const refs = Object.freeze({
    backgrounded: { current: false },
    foregroundAttemptAt: { current: 0 },
    intentionalDisconnect: { current: false },
    lastBackgroundAt: { current: 0 },
    reconnectAttempt: { current: false },
    watchdogFailures: { current: 0 },
  });
  let active = false;
  let config = {};
  let disconnectGraceTimerId = null;
  let foregroundRetryTimerId = null;
  let pageShowUnsubscribe = null;
  let realtimeConfig = {};
  let realtimeSocket = null;
  let realtimeUnsubscribe = null;
  let reconnectToastPending = false;
  let resumeOnConnectTimerId = null;
  let retryIntervalId = null;
  let watchdogIntervalId = null;

  function isConnected() {
    try {
      if (typeof config.isConnected === "function") return !!config.isConnected();
      return !!config.connection?.connected;
    } catch (_) {
      return false;
    }
  }

  function getApplicationState() {
    try {
      return getKernel?.()?.getState?.() || null;
    } catch (_) {
      return null;
    }
  }

  function getApplicationCommands() {
    try {
      return getKernel?.()?.commands || null;
    } catch (_) {
      return null;
    }
  }

  function cancelForegroundRetry() {
    if (foregroundRetryTimerId != null) clearTimeoutFn(foregroundRetryTimerId);
    foregroundRetryTimerId = null;
  }

  function cancelDisconnectGrace() {
    if (disconnectGraceTimerId != null) clearTimeoutFn(disconnectGraceTimerId);
    disconnectGraceTimerId = null;
  }

  function cancelResumeOnConnect() {
    if (resumeOnConnectTimerId != null) clearTimeoutFn(resumeOnConnectTimerId);
    resumeOnConnectTimerId = null;
  }

  function scheduleForegroundRetry(reason = "foreground_retry", delayMs = 1200) {
    cancelForegroundRetry();
    foregroundRetryTimerId = setTimeoutFn(() => {
      foregroundRetryTimerId = null;
      safeInvoke(config.onForeground, reason);
    }, Math.max(200, Number(delayMs) || 1200));
  }

  function clearRetryInterval() {
    if (retryIntervalId != null) clearIntervalFn(retryIntervalId);
    retryIntervalId = null;
  }

  function clearWatchdogInterval() {
    if (watchdogIntervalId != null) clearIntervalFn(watchdogIntervalId);
    watchdogIntervalId = null;
  }

  function reconcileIntervals() {
    if (!active) return;
    const state = getApplicationState();
    const isLoggedIn = !!state?.session?.isLoggedIn;
    const isPlaying = state?.game?.phase === "playing";
    const retryIntervalMs = Math.max(0, Number(config.retryIntervalMs) || 5500);
    const watchdogIntervalMs = Math.max(0, Number(config.watchdogIntervalMs) || 15000);

    if (isLoggedIn && retryIntervalId == null) {
      retryIntervalId = setIntervalFn(() => {
        if (documentTarget?.visibilityState !== "visible") return;
        if (isConnected()) return;
        safeInvoke(config.onForeground, "retry_timer");
      }, retryIntervalMs);
    } else if (!isLoggedIn) {
      clearRetryInterval();
    }

    const watchdogEnabled = isPlaying && !config.standaloneTrainingActive;
    if (watchdogEnabled && watchdogIntervalId == null) {
      watchdogIntervalId = setIntervalFn(
        () => safeInvoke(config.onHealthCheck, "watchdog_playing"),
        watchdogIntervalMs
      );
    } else if (!watchdogEnabled) {
      clearWatchdogInterval();
    }
  }

  function bindPageShow() {
    pageShowUnsubscribe?.();
    pageShowUnsubscribe = null;
    if (!active || typeof config.subscribePageShow !== "function") return;
    pageShowUnsubscribe = config.subscribePageShow(() => {
      refs.backgrounded.current = false;
      safeInvoke(config.onForeground, "pageshow");
      scheduleForegroundRetry("pageshow_retry", 1200);
    });
  }

  function hasSavedSession() {
    try {
      return !!realtimeConfig.hasSavedSession?.();
    } catch (_) {
      return false;
    }
  }

  function hardResetRealtimeSession() {
    safeInvoke(realtimeConfig.clearQueuedRankingUpdate);
    if (realtimeConfig.isLoggedInRef) {
      realtimeConfig.isLoggedInRef.current = false;
    }
    safeInvoke(getApplicationCommands()?.transition?.apply, {
      realtime: {
        breakKind: null,
        finalResults: [],
        medals: {},
        roundId: null,
        serverEndsAt: null,
        targetSummary: null,
        tournament: null,
        tournamentFinaleHoldUntil: null,
        tournamentRanking: [],
        tournamentRoundPoints: {},
        tournamentSummary: null,
        tournamentTotals: {},
      },
      session: {
        connectionError: LIVE_CONNECTION_INTERRUPTED_MESSAGE,
        isLoggedIn: false,
        serverStatus: "waiting",
      },
    });
    safeInvoke(realtimeConfig.setProvisionalRanking, []);
    safeInvoke(realtimeConfig.setPlayers, []);
    if (realtimeConfig.tournamentDuelDeltaRef) {
      realtimeConfig.tournamentDuelDeltaRef.current = {
        tournamentId: null,
        red: 0,
        blue: 0,
      };
    }
    safeInvoke(realtimeConfig.setSpecialHint, null);
    safeInvoke(realtimeConfig.setSpecialSolvedOverlay, null);
    safeInvoke(realtimeConfig.setFoundTargetThisRound, false);
    safeInvoke(realtimeConfig.setFoundTargetWord, "");
    if (realtimeConfig.resumeLockRef) {
      realtimeConfig.resumeLockRef.current = false;
    }
    if (realtimeConfig.resumeLockAtRef) {
      realtimeConfig.resumeLockAtRef.current = 0;
    }
    refs.reconnectAttempt.current = false;
    reconnectToastPending = false;
  }

  function onRealtimeConnectError() {
    if (realtimeConfig.liveSessionReadyRef) {
      realtimeConfig.liveSessionReadyRef.current = false;
    }
    safeInvoke(getApplicationCommands()?.session?.setIsConnecting, false);
    if (realtimeConfig.standaloneTrainingSessionRef?.current) {
      safeInvoke(getApplicationCommands()?.session?.setConnectionError, "");
      refs.reconnectAttempt.current = false;
      return;
    }
    const hasSession = hasSavedSession() || realtimeConfig.autoResumeEnabledRef?.current;
    if (!hasSession && !realtimeConfig.isLoggedInRef?.current) {
      if (realtimeConfig.isLoggedInRef) {
        realtimeConfig.isLoggedInRef.current = false;
      }
      safeInvoke(getApplicationCommands()?.session?.setIsLoggedIn, false);
      safeInvoke(realtimeConfig.clearQueuedRankingUpdate);
      safeInvoke(
        getApplicationCommands()?.session?.setConnectionError,
        "Connexion au serveur impossible"
      );
      safeInvoke(realtimeConfig.setPlayers, []);
      safeInvoke(realtimeConfig.setProvisionalRanking, []);
    } else {
      safeInvoke(
        getApplicationCommands()?.session?.setConnectionError,
        LIVE_CONNECTION_INTERRUPTED_MESSAGE
      );
    }
    if (realtimeConfig.resumeLockRef) {
      realtimeConfig.resumeLockRef.current = false;
    }
    if (realtimeConfig.resumeLockAtRef) {
      realtimeConfig.resumeLockAtRef.current = 0;
    }
    refs.reconnectAttempt.current = false;
  }

  function onRealtimeConnect() {
    if (realtimeConfig.liveSessionReadyRef) {
      realtimeConfig.liveSessionReadyRef.current = false;
    }
    cancelDisconnectGrace();
    cancelResumeOnConnect();
    refs.watchdogFailures.current = 0;
    if (realtimeConfig.batchUnsupportedRef) {
      realtimeConfig.batchUnsupportedRef.current = false;
    }
    safeInvoke(getApplicationCommands()?.session?.setConnectionError, "");
    safeInvoke(getApplicationCommands()?.session?.setLoginError, (previous) =>
      realtimeConfig.transientHomeConnectionErrors?.has?.(previous)
        ? ""
        : previous
    );
    if (reconnectToastPending) {
      reconnectToastPending = false;
      if (realtimeConfig.isLoggedInRef?.current) {
        safeInvoke(realtimeConfig.showToast, "Connexion rétablie", 2200);
      }
    }
    const shouldRestoreLiveSession =
      (realtimeConfig.isLoggedInRef?.current ||
        realtimeConfig.autoResumeEnabledRef?.current ||
        hasSavedSession()) &&
      realtimeConfig.appViewRef?.current === "live";
    if (shouldRestoreLiveSession && !realtimeConfig.resumeLockRef?.current) {
      resumeOnConnectTimerId = setTimeoutFn(() => {
        resumeOnConnectTimerId = null;
        if (!realtimeSocket?.connected) return;
        realtimeConfig.resumeLoginFromSessionRef?.current?.("socket_connect");
      }, 0);
    }
    if (!realtimeConfig.isLoggedInRef?.current) {
      const chatState = realtimeConfig.lobbyChatSubscriptionRef?.current;
      if (
        chatState?.subscribed ||
        realtimeConfig.isHomeChatOpenRef?.current ||
        realtimeConfig.isChatOpenMobileRef?.current
      ) {
        safeInvoke(realtimeConfig.subscribeLobbyChat, { force: true });
      }
    }
  }

  function onRealtimeDisconnect() {
    if (realtimeConfig.liveSessionReadyRef) {
      realtimeConfig.liveSessionReadyRef.current = false;
    }
    safeInvoke(realtimeConfig.requeueInFlightSubmissions);
    const wasIntentional = refs.intentionalDisconnect.current;
    refs.intentionalDisconnect.current = false;
    const lobbySubscription = realtimeConfig.lobbyChatSubscriptionRef?.current;
    if (lobbySubscription) {
      lobbySubscription.subscribed = false;
      lobbySubscription.inFlight = false;
      lobbySubscription.connectPending = false;
    }
    cancelDisconnectGrace();
    cancelResumeOnConnect();
    if (realtimeConfig.standaloneTrainingSessionRef?.current) {
      safeInvoke(getApplicationCommands()?.session?.setConnectionError, "");
      return;
    }
    if (refs.backgrounded.current) return;
    if (
      !wasIntentional &&
      !hasSavedSession() &&
      !realtimeConfig.isLoggedInRef?.current
    ) {
      hardResetRealtimeSession();
    }
    if (realtimeConfig.manualDisconnectRef?.current) {
      realtimeConfig.manualDisconnectRef.current = false;
      safeInvoke(getApplicationCommands()?.session?.setConnectionError, "");
      reconnectToastPending = false;
      return;
    }
    if (wasIntentional) return;
    disconnectGraceTimerId = setTimeoutFn(() => {
      disconnectGraceTimerId = null;
      if (realtimeSocket?.connected || refs.backgrounded.current) return;
      if (
        hasSavedSession() ||
        realtimeConfig.isLoggedInRef?.current ||
        realtimeConfig.autoResumeEnabledRef?.current
      ) {
        safeInvoke(
          getApplicationCommands()?.session?.setConnectionError,
          LIVE_CONNECTION_INTERRUPTED_MESSAGE
        );
        reconnectToastPending = true;
        realtimeConfig.attemptSilentReconnectRef?.current?.("disconnect_grace");
        return;
      }
      hardResetRealtimeSession();
    }, Math.max(0, Number(realtimeConfig.disconnectGraceMs) || 0));
    safeInvoke(
      getApplicationCommands()?.session?.setConnectionError,
      LIVE_CONNECTION_INTERRUPTED_MESSAGE
    );
    if (realtimeConfig.isLoggedInRef?.current && !reconnectToastPending) {
      reconnectToastPending = true;
      safeInvoke(
        realtimeConfig.showToast,
        "Connexion interrompue, jeu local actif",
        3600
      );
    }
    realtimeConfig.attemptSilentReconnectRef?.current?.("disconnect");
  }

  function bindRealtime() {
    const nextSocket = realtimeConfig.socket || null;
    if (realtimeSocket === nextSocket && realtimeUnsubscribe) return;
    realtimeUnsubscribe?.();
    realtimeUnsubscribe = null;
    realtimeSocket = nextSocket;
    if (!active || typeof realtimeSocket?.bind !== "function") return;
    realtimeUnsubscribe = realtimeSocket.bind({
      connect: onRealtimeConnect,
      connect_error: onRealtimeConnectError,
      disconnect: onRealtimeDisconnect,
    });
  }

  function configureRealtime(nextConfig = {}) {
    realtimeConfig = nextConfig;
    bindRealtime();
  }

  function configure(nextConfig = {}) {
    const previousSubscribePageShow = config.subscribePageShow;
    config = { ...config, ...nextConfig };
    if (previousSubscribePageShow !== config.subscribePageShow) bindPageShow();
    reconcileIntervals();
  }

  function start() {
    active = true;
    const kernel = getKernel?.();
    const onVisibility = () => {
      if (documentTarget?.visibilityState === "hidden") {
        refs.backgrounded.current = true;
        refs.lastBackgroundAt.current = now();
        return;
      }
      if (documentTarget?.visibilityState === "visible") {
        refs.backgrounded.current = false;
        safeInvoke(config.onForeground, "visibility");
        scheduleForegroundRetry("visibility_retry", 1400);
      }
    };
    const onFocus = () => safeInvoke(config.onForeground, "focus");
    const onOnline = () => safeInvoke(config.onForeground, "online");
    const onInteraction = () => {
      if (!getApplicationState()?.session?.isLoggedIn || isConnected()) return;
      safeInvoke(config.onForeground, "interaction");
    };
    const listen = (target, event, listener, options) => {
      target?.addEventListener?.(event, listener, options);
      scope.add(() => target?.removeEventListener?.(event, listener, options));
    };

    listen(windowTarget, "focus", onFocus);
    listen(windowTarget, "online", onOnline);
    listen(windowTarget, "pointerdown", onInteraction, { passive: true });
    listen(windowTarget, "touchstart", onInteraction, { passive: true });
    listen(documentTarget, "visibilitychange", onVisibility);
    if (kernel?.subscribe) scope.add(kernel.subscribe(reconcileIntervals));
    bindPageShow();
    bindRealtime();
    reconcileIntervals();
    scope.add(() => {
      active = false;
      cancelDisconnectGrace();
      cancelForegroundRetry();
      cancelResumeOnConnect();
      clearRetryInterval();
      clearWatchdogInterval();
      pageShowUnsubscribe?.();
      pageShowUnsubscribe = null;
      realtimeUnsubscribe?.();
      realtimeUnsubscribe = null;
      realtimeSocket = null;
      realtimeConfig = {};
      reconnectToastPending = false;
      config = {};
      refs.backgrounded.current = false;
      refs.foregroundAttemptAt.current = 0;
      refs.intentionalDisconnect.current = false;
      refs.lastBackgroundAt.current = 0;
      refs.reconnectAttempt.current = false;
      refs.watchdogFailures.current = 0;
    });
  }

  return Object.freeze({
    cancelDisconnectGrace,
    cancelForegroundRetry,
    configure,
    configureRealtime,
    refs,
    scheduleForegroundRetry,
    start,
  });
}
