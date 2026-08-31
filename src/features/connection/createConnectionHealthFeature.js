import { LIVE_CONNECTION_INTERRUPTED_MESSAGE } from "../../network/liveSubmissionRecovery.js";

const DEFAULT_FOREGROUND_THROTTLE_MS = 800;
const DEFAULT_BACKGROUND_RECONNECT_MS = 5000;
const DEFAULT_PING_TIMEOUT_MS = 3200;
const DEFAULT_SYNC_TIMEOUT_MS = 5000;
const DEFAULT_WATCHDOG_FAILURE_THRESHOLD = 3;

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
  let activePing = null;
  let activeSync = null;
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

  function getConnection() {
    return config.connection || realtimeSocket || realtimeConfig.socket || null;
  }

  function readSavedSession() {
    try {
      return config.sessionRef?.current || config.loadSessionFromStorage?.() || null;
    } catch (_) {
      return config.sessionRef?.current || null;
    }
  }

  function cancelPing(reason = "cancelled") {
    const attempt = activePing;
    if (!attempt) return;
    activePing = null;
    if (attempt.timeoutId != null) clearTimeoutFn(attempt.timeoutId);
    attempt.timeoutId = null;
    attempt.reject(new Error(reason));
  }

  function pingServer(reason = "ping") {
    const connection = getConnection();
    if (!connection?.connected) {
      return Promise.reject(new Error("disconnected"));
    }
    if (activePing) return activePing.promise;

    const monotonicNow =
      typeof config.getMonotonicNowMs === "function"
        ? config.getMonotonicNowMs
        : now;
    const startedAt = monotonicNow();
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    promise.catch(() => {});
    const attempt = {
      promise,
      reason,
      reject: rejectPromise,
      resolve: resolvePromise,
      timeoutId: null,
    };
    activePing = attempt;

    const settle = (error, response = null) => {
      if (activePing !== attempt) return;
      activePing = null;
      if (attempt.timeoutId != null) clearTimeoutFn(attempt.timeoutId);
      attempt.timeoutId = null;
      if (error) {
        attempt.reject(error);
      } else {
        attempt.resolve(response);
      }
    };
    attempt.timeoutId = setTimeoutFn(
      () => settle(new Error("timeout")),
      Math.max(0, Number(config.pingTimeoutMs) || DEFAULT_PING_TIMEOUT_MS)
    );
    try {
      connection.emit?.("timeSync", null, (response) => {
        if (activePing !== attempt) return;
        if (response?.ok && typeof response.serverNow === "number") {
          const completedAt = monotonicNow();
          safeInvoke(config.onServerTimeSample, {
            completedAt,
            reason,
            sampledServerNowMs:
              response.serverNow + Math.max(0, completedAt - startedAt) / 2,
            startedAt,
          });
          settle(null, response);
          return;
        }
        settle(new Error("bad_response"));
      });
    } catch (error) {
      settle(error instanceof Error ? error : new Error("ping_emit_failed"));
    }
    return promise;
  }

  function cancelLiveStateSync(reason = "cancelled") {
    const attempt = activeSync;
    if (!attempt) return;
    activeSync = null;
    if (attempt.timeoutId != null) clearTimeoutFn(attempt.timeoutId);
    attempt.timeoutId = null;
    attempt.reject(new Error(reason));
  }

  function syncLiveState(reason = "foreground") {
    const connection = getConnection();
    if (
      !config.isAccountAuthenticatedRef?.current ||
      !connection?.connected ||
      !realtimeConfig.isLoggedInRef?.current ||
      realtimeConfig.appViewRef?.current !== "live" ||
      realtimeConfig.standaloneTrainingSessionRef?.current
    ) {
      return Promise.resolve(false);
    }
    if (activeSync) return activeSync.promise;

    const session = readSavedSession();
    const nick = String(config.nicknameRef?.current || session?.nick || "").trim();
    const roomId =
      config.currentRoomIdRef?.current ||
      session?.roomId ||
      config.roomIdRef?.current;
    const installId = config.installIdRef?.current || session?.installId;
    if (!nick || !roomId || !installId) {
      return Promise.reject(new Error("missing_live_session"));
    }

    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    promise.catch(() => {});
    const attempt = {
      promise,
      reject: rejectPromise,
      resolve: resolvePromise,
      timeoutId: null,
    };
    activeSync = attempt;

    const settle = (error, value = null) => {
      if (activeSync !== attempt) return;
      activeSync = null;
      if (attempt.timeoutId != null) clearTimeoutFn(attempt.timeoutId);
      attempt.timeoutId = null;
      if (error) {
        attempt.reject(error);
      } else {
        attempt.resolve(value);
      }
    };
    attempt.timeoutId = setTimeoutFn(
      () => settle(new Error("timeout")),
      Math.max(0, Number(config.syncTimeoutMs) || DEFAULT_SYNC_TIMEOUT_MS)
    );
    try {
      connection.emit?.(
        "session:resume",
        { roomId, installId, nick, takeover: false },
        (response) => {
          if (activeSync !== attempt) return;
          if (!response || typeof response !== "object") {
            settle(new Error("bad_payload"));
            return;
          }
          if (response.ok === false) {
            const error = new Error(String(response.error || "error"));
            error.payload = response;
            settle(error);
            return;
          }
          if (
            !response.available ||
            response.attached === false ||
            !response.snapshot
          ) {
            settle(new Error(response.error || "live_state_unavailable"));
            return;
          }
          try {
            if (response.playtimeLimit) {
              safeInvoke(config.applyPlaytimeLimitStatus, response.playtimeLimit);
            }
            getApplicationCommands()?.session?.setResumeSnapshot?.(null);
            const hydrated = !!config.hydrateLiveSnapshot?.(
              response.snapshot,
              response.entryKind || "resume"
            );
            if (realtimeConfig.liveSessionReadyRef) {
              realtimeConfig.liveSessionReadyRef.current = hydrated;
            }
            if (!hydrated) {
              settle(new Error("live_snapshot_rejected"));
              return;
            }
            getApplicationCommands()?.session?.setConnectionError?.("");
            refs.watchdogFailures.current = 0;
            safeInvoke(config.scheduleBatchFlush, { immediate: true });
            console.debug(`[foreground] live state synchronized (${reason})`);
            settle(null, true);
          } catch (error) {
            settle(
              error instanceof Error ? error : new Error("live_sync_failed")
            );
          }
        }
      );
    } catch (error) {
      settle(error instanceof Error ? error : new Error("live_sync_emit_failed"));
    }
    return promise;
  }

  function isDailyView(view) {
    return view === "daily" || view === "daily_play" || view === "daily_results";
  }

  function runHealthCheck(reason = "watchdog") {
    const connection = getConnection();
    if (!connection?.connected) return Promise.resolve(false);
    return pingServer(reason)
      .then(() => {
        if (!active) return false;
        refs.watchdogFailures.current = 0;
        console.debug(`[watchdog] pong (${reason})`);
        return true;
      })
      .catch(() => {
        if (!active) return false;
        const failures = (refs.watchdogFailures.current || 0) + 1;
        refs.watchdogFailures.current = failures;
        const threshold = Math.max(
          1,
          Number(config.watchdogFailureThreshold) ||
            DEFAULT_WATCHDOG_FAILURE_THRESHOLD
        );
        if (failures < threshold) {
          console.warn(`[watchdog] soft failure (${reason}) #${failures}`);
          return false;
        }
        refs.watchdogFailures.current = 0;
        console.warn(`[watchdog] reconnect (${reason})`);
        refs.intentionalDisconnect.current = true;
        connection.disconnect?.();
        const currentView = realtimeConfig.appViewRef?.current;
        if (realtimeConfig.isLoggedInRef?.current && !isDailyView(currentView)) {
          safeInvoke(config.resumeSession, "watchdog");
        } else {
          safeInvoke(config.probeSession, "watchdog");
        }
        return false;
      });
  }

  function handleForeground(reason = "foreground") {
    const timestamp = now();
    const throttleMs = Math.max(
      0,
      Number(config.foregroundThrottleMs) || DEFAULT_FOREGROUND_THROTTLE_MS
    );
    if (timestamp - refs.foregroundAttemptAt.current < throttleMs) return false;
    refs.foregroundAttemptAt.current = timestamp;
    if (!config.isAccountAuthenticatedRef?.current) {
      refs.lastBackgroundAt.current = 0;
      return false;
    }
    if (!hasSavedSession() && !realtimeConfig.isLoggedInRef?.current) {
      refs.lastBackgroundAt.current = 0;
      return false;
    }
    const connection = getConnection();
    const currentView = realtimeConfig.appViewRef?.current;
    const canAutoResume =
      realtimeConfig.isLoggedInRef?.current &&
      !isDailyView(currentView) &&
      !realtimeConfig.standaloneTrainingSessionRef?.current;
    const shouldRestoreSession =
      canAutoResume || (hasSavedSession() && currentView === "live");
    const synchronizeOrRecoverLive = (syncReason) => {
      if (!canAutoResume || !connection?.connected) {
        void runHealthCheck(syncReason);
        return;
      }
      syncLiveState(syncReason).catch((error) => {
        if (!active) return;
        console.warn(
          `[foreground] live state sync failed (${syncReason})`,
          error
        );
        refs.intentionalDisconnect.current = true;
        connection.disconnect?.();
        safeInvoke(config.resumeSession, `${syncReason}_reconnect`);
      });
    };
    const lastBackgroundAt = refs.lastBackgroundAt.current;
    const backgroundDuration =
      lastBackgroundAt > 0 ? timestamp - lastBackgroundAt : 0;
    const forceReconnectAfterMs = Math.max(
      0,
      Number(config.backgroundReconnectMs) || DEFAULT_BACKGROUND_RECONNECT_MS
    );
    if (backgroundDuration > forceReconnectAfterMs) {
      refs.lastBackgroundAt.current = 0;
      if (!connection?.connected) {
        if (shouldRestoreSession) {
          safeInvoke(config.reconnectSession, `${reason}_post_bg`);
        } else {
          safeInvoke(config.connectSocketWithAuth);
        }
        return true;
      }
      synchronizeOrRecoverLive(`${reason}_post_bg`);
      return true;
    }
    if (lastBackgroundAt) refs.lastBackgroundAt.current = 0;
    if (!connection?.connected) {
      if (shouldRestoreSession) {
        safeInvoke(config.reconnectSession, reason);
      } else {
        safeInvoke(config.connectSocketWithAuth);
      }
      return true;
    }
    synchronizeOrRecoverLive(reason);
    return true;
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

  function dispatchForeground(reason) {
    if (typeof config.onForeground === "function") {
      safeInvoke(config.onForeground, reason);
      return;
    }
    handleForeground(reason);
  }

  function dispatchHealthCheck(reason) {
    if (typeof config.onHealthCheck === "function") {
      safeInvoke(config.onHealthCheck, reason);
      return;
    }
    runHealthCheck(reason);
  }

  function scheduleForegroundRetry(reason = "foreground_retry", delayMs = 1200) {
    cancelForegroundRetry();
    foregroundRetryTimerId = setTimeoutFn(() => {
      foregroundRetryTimerId = null;
      dispatchForeground(reason);
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
        dispatchForeground("retry_timer");
      }, retryIntervalMs);
    } else if (!isLoggedIn) {
      clearRetryInterval();
    }

    const watchdogEnabled = isPlaying && !config.standaloneTrainingActive;
    if (watchdogEnabled && watchdogIntervalId == null) {
      watchdogIntervalId = setIntervalFn(
        () => dispatchHealthCheck("watchdog_playing"),
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
      dispatchForeground("pageshow");
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
        dispatchForeground("visibility");
        scheduleForegroundRetry("visibility_retry", 1400);
      }
    };
    const onFocus = () => dispatchForeground("focus");
    const onOnline = () => dispatchForeground("online");
    const onInteraction = () => {
      if (!getApplicationState()?.session?.isLoggedIn || isConnected()) return;
      dispatchForeground("interaction");
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
      cancelLiveStateSync();
      cancelPing();
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
    handleForeground,
    pingServer,
    refs,
    runHealthCheck,
    scheduleForegroundRetry,
    start,
    syncLiveState,
  });
}
