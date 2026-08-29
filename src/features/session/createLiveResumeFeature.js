import { LIVE_CONNECTION_INTERRUPTED_MESSAGE } from "../../network/liveSubmissionRecovery.js";

const DEFAULT_RESUME_LOCK_MS = 6000;
const DEFAULT_RESUME_TIMEOUT_MS = 8000;
const DEFAULT_RECONNECT_RESET_MS = 3000;
const DEFAULT_PROBE_DEDUP_MS = 2500;

function safeInvoke(callback, ...args) {
  try {
    return callback?.(...args);
  } catch (_) {
    return undefined;
  }
}

export function createLiveResumeFeature(
  { getKernel, scope },
  {
    clearTimeoutFn = clearTimeout,
    now = Date.now,
    probeDedupMs = DEFAULT_PROBE_DEDUP_MS,
    reconnectResetMs = DEFAULT_RECONNECT_RESET_MS,
    resumeLockMs = DEFAULT_RESUME_LOCK_MS,
    resumeTimeoutMs = DEFAULT_RESUME_TIMEOUT_MS,
    setTimeoutFn = setTimeout,
  } = {}
) {
  const refs = Object.freeze({
    resumeLock: { current: false },
    resumeLockAt: { current: 0 },
    resumeProbe: { current: { inFlight: false, lastAt: 0 } },
  });
  let activeProbe = null;
  let activeReconnectId = 0;
  let activeResume = null;
  let config = {};
  let nextReconnectId = 1;
  let reconnectResetTimerId = null;

  function getKernelCommands() {
    try {
      return getKernel?.()?.commands || null;
    } catch (_) {
      return null;
    }
  }

  function getApplicationState() {
    try {
      return getKernel?.()?.getState?.() || null;
    } catch (_) {
      return null;
    }
  }

  function isAccountAuthenticated() {
    return !!safeInvoke(config.isAccountAuthenticated);
  }

  function hasSavedSession() {
    return !!safeInvoke(config.hasSavedSession);
  }

  function getResumeIdentity() {
    const session = config.sessionRef?.current;
    const state = getApplicationState();
    const nick = String(session?.nick || "").trim();
    const roomId = session?.roomId || state?.game?.roomId || "";
    const installId = session?.installId || safeInvoke(config.getInstallId) || "";
    if (!nick || !roomId || !installId) return null;
    return { installId, nick, roomId };
  }

  function isSameSavedSession(identity) {
    const session = config.sessionRef?.current;
    return !!(
      session &&
      String(session.nick || "").trim() === identity.nick &&
      session.roomId === identity.roomId &&
      session.installId === identity.installId
    );
  }

  function detachProbeListeners(probe) {
    if (!probe) return;
    probe.socket?.off?.("connect", probe.onConnect);
    probe.socket?.off?.("connect_error", probe.onConnectError);
  }

  function finishProbe(probe, { updateUi = true } = {}) {
    if (!probe || activeProbe !== probe) return false;
    activeProbe = null;
    detachProbeListeners(probe);
    refs.resumeProbe.current = {
      ...refs.resumeProbe.current,
      inFlight: false,
    };
    if (updateUi) getKernelCommands()?.session?.setResumePending?.(false);
    return true;
  }

  function cancelResumeProbe({ resetDedup = false, updateUi = true } = {}) {
    const probe = activeProbe;
    if (probe) finishProbe(probe, { updateUi });
    refs.resumeProbe.current = {
      inFlight: false,
      lastAt: resetDedup ? 0 : refs.resumeProbe.current.lastAt,
    };
  }

  function applyProbeResponse(identity, response) {
    const commands = getKernelCommands();
    if (!isSameSavedSession(identity) || config.isLoggedInRef?.current) {
      commands?.session?.setResumeSnapshot?.(null);
      return;
    }
    if (response?.error === "auth_required") {
      safeInvoke(config.clearSavedSession);
      commands?.session?.setResumeSnapshot?.(null);
      return;
    }
    if (response?.error === "moderation_banned") {
      safeInvoke(config.clearSavedSession);
      commands?.session?.patch?.({
        connectionError:
          response?.message || "Accès live temporairement suspendu.",
        resumeSnapshot: null,
      });
      return;
    }
    if (response?.error === "playtime_limit_exhausted") {
      if (response?.playtimeLimit) {
        safeInvoke(config.applyPlaytimeLimitStatus, response.playtimeLimit);
      }
      safeInvoke(config.clearSavedSession);
      commands?.session?.patch?.({
        canResumeSession: false,
        connectionError:
          response?.message ||
          "Ton temps de jeu live est écoulé pour aujourd'hui.",
        resumeSnapshot: null,
      });
      return;
    }
    if (response?.ok && response?.available && response?.snapshot) {
      commands?.session?.patch?.({
        canResumeSession: true,
        resumeSnapshot: response.snapshot,
      });
      return;
    }
    commands?.session?.setResumeSnapshot?.(null);
  }

  function probeResume(reason = "probe") {
    if (!isAccountAuthenticated() || !hasSavedSession()) return false;
    const identity = getResumeIdentity();
    if (!identity) return false;
    const timestamp = now();
    const probeState = refs.resumeProbe.current;
    if (
      probeState.inFlight &&
      timestamp - probeState.lastAt < Math.max(0, Number(probeDedupMs) || 0)
    ) {
      return false;
    }
    cancelResumeProbe({ updateUi: false });
    refs.resumeProbe.current = { inFlight: true, lastAt: timestamp };
    getKernelCommands()?.session?.setResumePending?.(true);

    const socket = config.socket;
    const probe = {
      identity,
      onConnect: null,
      onConnectError: null,
      reason,
      sent: false,
      socket,
    };
    activeProbe = probe;

    const sendProbe = () => {
      if (activeProbe !== probe || probe.sent) return;
      probe.sent = true;
      detachProbeListeners(probe);
      socket?.emit?.(
        "session:resume",
        {
          roomId: identity.roomId,
          installId: identity.installId,
          nick: identity.nick,
          takeover: false,
        },
        (response) => {
          if (!finishProbe(probe)) return;
          applyProbeResponse(identity, response);
        }
      );
    };
    const failProbe = () => {
      finishProbe(probe);
    };
    probe.onConnect = sendProbe;
    probe.onConnectError = failProbe;

    if (socket?.connected) {
      sendProbe();
      return true;
    }
    socket?.once?.("connect", sendProbe);
    socket?.once?.("connect_error", failProbe);
    Promise.resolve(safeInvoke(config.connectSocketWithAuth))
      .then((connected) => {
        if (activeProbe !== probe) return;
        if (!connected) {
          failProbe();
          return;
        }
        if (socket?.connected) sendProbe();
      })
      .catch(failProbe);
    return true;
  }

  function detachResumeListeners(attempt) {
    if (!attempt) return;
    attempt.socket?.off?.("connect", attempt.onConnect);
    attempt.socket?.off?.("connect_error", attempt.onConnectError);
  }

  function clearResumeTimeout(attempt) {
    if (attempt?.timeoutId == null) return;
    clearTimeoutFn(attempt.timeoutId);
    attempt.timeoutId = null;
  }

  function releaseResumeTransport(attempt, { keepActive = false } = {}) {
    if (!attempt || activeResume !== attempt) return false;
    clearResumeTimeout(attempt);
    detachResumeListeners(attempt);
    refs.resumeLock.current = false;
    refs.resumeLockAt.current = 0;
    if (!keepActive) activeResume = null;
    return true;
  }

  function cancelResumeAttempt({ updateUi = false } = {}) {
    const attempt = activeResume;
    if (attempt) releaseResumeTransport(attempt);
    refs.resumeLock.current = false;
    refs.resumeLockAt.current = 0;
    if (updateUi) getKernelCommands()?.session?.setIsConnecting?.(false);
  }

  function setLoggedOutFailure(connectionError, { loginError = null } = {}) {
    if (config.isLoggedInRef) config.isLoggedInRef.current = false;
    if (config.liveSessionReadyRef) config.liveSessionReadyRef.current = false;
    const patch = {
      connectionError,
      isConnecting: false,
      isLoggedIn: false,
    };
    if (loginError != null) patch.loginError = loginError;
    getKernelCommands()?.session?.patch?.(patch);
  }

  function commitRestoredSession(
    identity,
    response,
    { clearChat = false, updateRoom = false } = {}
  ) {
    const joinedRoom = updateRoom
      ? response?.roomId || identity.roomId
      : identity.roomId;
    safeInvoke(config.persistSession, {
      nick: identity.nick,
      roomId: joinedRoom,
      installId: identity.installId,
    });
    if (config.lastLoginPayloadRef) {
      config.lastLoginPayloadRef.current = {
        nick: identity.nick,
        roomId: joinedRoom,
      };
    }
    if (clearChat) safeInvoke(config.clearMobileChatReactionToasts);
    if (config.appViewRef) config.appViewRef.current = "live";
    if (config.isLoggedInRef) config.isLoggedInRef.current = true;
    const transition = {
      navigation: { view: "live" },
      session: {
        connectionError: "",
        isConnecting: false,
        isLoggedIn: true,
        loginError: "",
        resumeSnapshot: null,
      },
    };
    if (updateRoom) {
      transition.game = {
        currentRoomId: joinedRoom,
        roomId: joinedRoom,
      };
    }
    getKernelCommands()?.transition?.apply?.(transition);
    if (response?.playtimeLimit) {
      safeInvoke(config.applyPlaytimeLimitStatus, response.playtimeLimit);
    }
    const hydrated = !!safeInvoke(
      config.hydrateLiveSnapshot,
      response?.snapshot,
      response?.entryKind || "resume"
    );
    if (config.liveSessionReadyRef) {
      config.liveSessionReadyRef.current = hydrated;
    }
    if (!hydrated) {
      getKernelCommands()?.session?.setConnectionError?.(
        "État de partie indisponible, reconnexion en cours."
      );
      return false;
    }
    safeInvoke(config.scheduleBatchFlush, { immediate: true });
    safeInvoke(config.requestTrophyStatus);
    return true;
  }

  function rejoinCurrentRoom(attempt) {
    if (activeResume !== attempt) return;
    const { identity, socket } = attempt;
    socket?.emit?.(
      "login",
      {
        nick: identity.nick,
        roomId: identity.roomId,
        installId: identity.installId,
      },
      (response) => {
        if (activeResume !== attempt) return;
        activeResume = null;
        if (!response?.ok) {
          getKernelCommands()?.session?.patch?.({
            connectionError: LIVE_CONNECTION_INTERRUPTED_MESSAGE,
            isConnecting: false,
          });
          if (config.liveSessionReadyRef) {
            config.liveSessionReadyRef.current = false;
          }
          return;
        }
        commitRestoredSession(identity, response, { updateRoom: true });
      }
    );
  }

  function applyResumeResponse(attempt, response) {
    if (activeResume !== attempt) return;
    const { identity } = attempt;
    if (!isSameSavedSession(identity)) {
      releaseResumeTransport(attempt);
      return;
    }
    if (response?.error === "auth_required") {
      releaseResumeTransport(attempt);
      safeInvoke(config.clearSavedSession);
      setLoggedOutFailure("Session live invalide. Recharge la page.");
      return;
    }
    if (response?.error === "moderation_banned") {
      releaseResumeTransport(attempt);
      safeInvoke(config.clearSavedSession);
      setLoggedOutFailure(
        response?.message || "Accès live temporairement suspendu."
      );
      return;
    }
    if (response?.error === "playtime_limit_exhausted") {
      releaseResumeTransport(attempt);
      if (response?.playtimeLimit) {
        safeInvoke(config.applyPlaytimeLimitStatus, response.playtimeLimit);
      }
      safeInvoke(config.clearSavedSession);
      const message =
        response?.message || "Ton temps de jeu live est écoulé pour aujourd'hui.";
      setLoggedOutFailure(message, { loginError: message });
      safeInvoke(
        config.showGlobalRedAnnouncement,
        {
          title: "Contrôle de temps pour joueurs compulsifs",
          body: message,
        },
        6500
      );
      return;
    }
    if (response?.ok && !response?.available) {
      getKernelCommands()?.session?.setConnectionError?.(
        LIVE_CONNECTION_INTERRUPTED_MESSAGE
      );
      releaseResumeTransport(attempt, { keepActive: true });
      rejoinCurrentRoom(attempt);
      return;
    }
    if (!response?.ok || !response?.snapshot) {
      releaseResumeTransport(attempt);
      safeInvoke(config.clearSavedSession);
      setLoggedOutFailure("Session expiree");
      return;
    }
    releaseResumeTransport(attempt);
    commitRestoredSession(identity, response, { clearChat: true });
  }

  function resume(reason = "resume") {
    if (!isAccountAuthenticated() || !hasSavedSession()) return false;
    const identity = getResumeIdentity();
    if (!identity) return false;
    const force = reason === "resume_button";
    const timestamp = now();
    if (refs.resumeLock.current) {
      const elapsed = timestamp - (refs.resumeLockAt.current || 0);
      if (!force && elapsed < Math.max(0, Number(resumeLockMs) || 0)) {
        return false;
      }
      cancelResumeAttempt();
    } else if (activeResume) {
      cancelResumeAttempt();
    }
    refs.resumeLock.current = true;
    refs.resumeLockAt.current = timestamp;
    if (config.liveSessionReadyRef) config.liveSessionReadyRef.current = false;
    getKernelCommands()?.session?.patch?.({
      connectionError: LIVE_CONNECTION_INTERRUPTED_MESSAGE,
      isConnecting: true,
      loginError: "",
    });

    const socket = config.socket;
    const attempt = {
      identity,
      onConnect: null,
      onConnectError: null,
      sent: false,
      socket,
      timeoutId: null,
    };
    activeResume = attempt;

    const failResume = () => {
      if (!releaseResumeTransport(attempt)) return;
      getKernelCommands()?.session?.patch?.({
        connectionError: LIVE_CONNECTION_INTERRUPTED_MESSAGE,
        isConnecting: false,
      });
    };
    const sendResume = () => {
      if (activeResume !== attempt || attempt.sent) return;
      attempt.sent = true;
      detachResumeListeners(attempt);
      socket?.emit?.(
        "session:resume",
        {
          roomId: identity.roomId,
          installId: identity.installId,
          nick: identity.nick,
          takeover: true,
        },
        (response) => applyResumeResponse(attempt, response)
      );
    };
    attempt.onConnect = sendResume;
    attempt.onConnectError = failResume;
    attempt.timeoutId = setTimeoutFn(
      failResume,
      Math.max(0, Number(resumeTimeoutMs) || DEFAULT_RESUME_TIMEOUT_MS)
    );

    if (socket?.connected) {
      sendResume();
      return true;
    }
    socket?.once?.("connect", sendResume);
    socket?.once?.("connect_error", failResume);
    Promise.resolve(safeInvoke(config.connectSocketWithAuth))
      .then((connected) => {
        if (activeResume !== attempt) return;
        if (!connected) {
          failResume();
          return;
        }
        if (socket?.connected) sendResume();
      })
      .catch(failResume);
    return true;
  }

  function clearReconnectResetTimer() {
    if (reconnectResetTimerId == null) return;
    clearTimeoutFn(reconnectResetTimerId);
    reconnectResetTimerId = null;
  }

  function scheduleReconnectReset(reconnectId) {
    clearReconnectResetTimer();
    reconnectResetTimerId = setTimeoutFn(() => {
      reconnectResetTimerId = null;
      if (activeReconnectId !== reconnectId) return;
      activeReconnectId = 0;
      if (config.reconnectAttemptRef) {
        config.reconnectAttemptRef.current = false;
      }
    }, Math.max(0, Number(reconnectResetMs) || DEFAULT_RECONNECT_RESET_MS));
  }

  function cancelReconnectAttempt() {
    activeReconnectId = 0;
    clearReconnectResetTimer();
    if (config.reconnectAttemptRef) config.reconnectAttemptRef.current = false;
  }

  function reconnect(reason = "reconnect") {
    if (config.reconnectAttemptRef?.current) return false;
    const reconnectId = nextReconnectId++;
    activeReconnectId = reconnectId;
    if (config.reconnectAttemptRef) config.reconnectAttemptRef.current = true;
    getKernelCommands()?.session?.setConnectionError?.(
      LIVE_CONNECTION_INTERRUPTED_MESSAGE
    );

    const restoreSession = (connected) => {
      if (activeReconnectId !== reconnectId) return;
      if (!connected) {
        getKernelCommands()?.session?.setConnectionError?.(
          LIVE_CONNECTION_INTERRUPTED_MESSAGE
        );
        return;
      }
      const shouldRestoreLive =
        config.appViewRef?.current === "live" &&
        (config.isLoggedInRef?.current ||
          config.autoResumeEnabledRef?.current ||
          hasSavedSession());
      if (shouldRestoreLive) {
        resume(reason);
        return;
      }
      if (hasSavedSession() || config.autoResumeEnabledRef?.current) {
        probeResume(reason);
      }
    };
    const finishReconnect = () => {
      if (activeReconnectId === reconnectId) scheduleReconnectReset(reconnectId);
    };
    if (config.socket?.connected) {
      restoreSession(true);
      finishReconnect();
      return true;
    }
    Promise.resolve(safeInvoke(config.connectSocketWithAuth))
      .then(restoreSession)
      .catch(() => {
        if (activeReconnectId !== reconnectId) return;
        getKernelCommands()?.session?.setConnectionError?.(
          LIVE_CONNECTION_INTERRUPTED_MESSAGE
        );
      })
      .finally(finishReconnect);
    return true;
  }

  function cancelAll() {
    cancelResumeProbe({ resetDedup: true });
    cancelResumeAttempt();
    cancelReconnectAttempt();
  }

  function configure(nextConfig = {}) {
    config = nextConfig;
  }

  function start() {
    scope.add(() => {
      cancelAll();
      config = {};
    });
  }

  return Object.freeze({
    cancelAll,
    cancelReconnectAttempt,
    cancelResumeAttempt,
    cancelResumeProbe,
    configure,
    probeResume,
    reconnect,
    refs,
    resume,
    start,
  });
}
