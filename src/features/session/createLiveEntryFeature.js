const DEFAULT_LOGIN_TIMEOUT_MS = 6000;
const DEFAULT_NICKNAME_STORAGE_KEY = "boggle_nick";

function safeInvoke(callback, ...args) {
  try {
    return callback?.(...args);
  } catch (_) {
    return undefined;
  }
}

export function createLiveEntryFeature(
  { getKernel, scope },
  {
    clearTimeoutFn = clearTimeout,
    loginTimeoutMs = DEFAULT_LOGIN_TIMEOUT_MS,
    nicknameStorageKey = DEFAULT_NICKNAME_STORAGE_KEY,
    setTimeoutFn = setTimeout,
    storage = globalThis.localStorage,
  } = {}
) {
  const refs = Object.freeze({
    loginInFlight: { current: false },
  });
  let activeAttempt = null;
  let config = {};

  function getKernelCommands() {
    try {
      return getKernel?.()?.commands || null;
    } catch (_) {
      return null;
    }
  }

  function getSessionState() {
    try {
      return getKernel?.()?.getState?.()?.session || null;
    } catch (_) {
      return null;
    }
  }

  function detachConnectError(attempt) {
    if (!attempt?.connectErrorHandler) return;
    attempt.socket?.off?.("connect_error", attempt.connectErrorHandler);
    attempt.connectErrorHandler = null;
  }

  function clearLoginTimeout(attempt) {
    if (attempt?.timeoutId == null) return;
    clearTimeoutFn(attempt.timeoutId);
    attempt.timeoutId = null;
  }

  function settleAttempt(attempt) {
    if (!attempt || activeAttempt !== attempt) return false;
    activeAttempt = null;
    refs.loginInFlight.current = false;
    clearLoginTimeout(attempt);
    detachConnectError(attempt);
    return true;
  }

  function cancelLoginAttempt() {
    const attempt = activeAttempt;
    if (!attempt) {
      refs.loginInFlight.current = false;
      return;
    }
    settleAttempt(attempt);
  }

  function setLoginFailure(message, { connectionMessage = null } = {}) {
    const commands = getKernelCommands();
    const patch = {
      isConnecting: false,
      loginError: message,
    };
    if (connectionMessage != null) {
      patch.connectionError = connectionMessage;
    }
    commands?.session?.patch?.(patch);
  }

  function applyRejectedLogin(response, socket) {
    const error = response?.error;
    if (error === "pseudo_taken") {
      setLoginFailure("Pseudo deja utilise");
      return;
    }
    if (error === "nick_too_long") {
      setLoginFailure("25 caracteres max");
      return;
    }
    if (error === "auth_required") {
      setLoginFailure("Connecte-toi à ton compte.");
      if (socket?.connected) safeInvoke(() => socket.disconnect());
      safeInvoke(config.openLoginDialog);
      return;
    }
    if (error === "moderation_banned") {
      const message = response?.message || "Accès live temporairement suspendu.";
      safeInvoke(config.clearSavedSession);
      setLoginFailure(message, { connectionMessage: message });
      return;
    }
    if (error === "playtime_limit_exhausted") {
      if (response?.playtimeLimit) {
        safeInvoke(config.applyPlaytimeLimitStatus, response.playtimeLimit);
      }
      safeInvoke(config.clearSavedSession);
      const message =
        response?.message || "Ton temps de jeu live est écoulé pour aujourd'hui.";
      setLoginFailure(message, { connectionMessage: message });
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
    if (error === "invalid_room") {
      setLoginFailure("Salle indisponible");
      return;
    }
    if (error === "invalid_install_id") {
      setLoginFailure("Identifiant appareil invalide");
      return;
    }
    setLoginFailure("Connexion refusee");
  }

  function commitSuccessfulLogin({ installId, nick, response, roomId }) {
    const joinedRoom = response?.roomId || roomId;
    if (response?.playtimeLimit) {
      safeInvoke(config.applyPlaytimeLimitStatus, response.playtimeLimit);
    }
    if (config.lastLoginPayloadRef) {
      config.lastLoginPayloadRef.current = { nick, roomId: joinedRoom };
    }
    safeInvoke(config.persistSession, {
      nick,
      roomId: joinedRoom,
      installId,
    });
    safeInvoke(config.setAutoResumeEnabled, true);

    const nextSize = safeInvoke(config.getGridSizeForRoom, joinedRoom) || 4;
    if (config.appViewRef) config.appViewRef.current = "live";
    if (config.isLoggedInRef) config.isLoggedInRef.current = true;
    getKernelCommands()?.transition?.apply?.({
      game: {
        board: Array(nextSize * nextSize).fill({ letter: "?", bonus: null }),
        currentRoomId: joinedRoom,
        gridSize: nextSize,
        roomId: joinedRoom,
      },
      navigation: { view: "live" },
      session: {
        connectionError: "",
        isConnecting: false,
        isLoggedIn: true,
        loginError: "",
        resumeSnapshot: null,
        serverStatus: "waiting",
      },
    });
    safeInvoke(config.clearMobileChatReactionToasts);
    safeInvoke(config.setScore, 0);
    safeInvoke(config.requestTrophyStatus);

    const hydrated = config.phaseLoopTestEnabledRef?.current
      ? true
      : !!safeInvoke(
          config.hydrateLiveSnapshot,
          response?.snapshot,
          response?.entryKind || "join"
        );
    if (config.liveSessionReadyRef) {
      config.liveSessionReadyRef.current = hydrated;
    }
    if (!hydrated) {
      getKernelCommands()?.session?.setConnectionError?.(
        "État de partie indisponible, reconnexion en cours."
      );
      safeInvoke(config.onSnapshotMissing, "login_snapshot_missing");
    }
    try {
      storage?.setItem?.(nicknameStorageKey, nick);
    } catch (_) {}
  }

  function login() {
    const sessionState = getSessionState();
    if (refs.loginInFlight.current || sessionState?.isConnecting) return false;
    if (!safeInvoke(config.ensureAuthenticated, { source: "live" })) return false;

    const nick = String(sessionState?.nickname || "").trim();
    if (!nick) {
      getKernelCommands()?.session?.setLoginError?.("Choisis un pseudo");
      return false;
    }
    if (nick.length > 25) {
      getKernelCommands()?.session?.setLoginError?.("25 caracteres max");
      return false;
    }

    const socket = config.socket;
    const roomId = getKernel?.()?.getState?.()?.game?.roomId;
    const installId = config.getInstallId?.() || "";
    const attempt = {
      connectErrorHandler: null,
      socket,
      timeoutId: null,
    };
    activeAttempt = attempt;
    refs.loginInFlight.current = true;
    if (config.liveSessionReadyRef) config.liveSessionReadyRef.current = false;
    getKernelCommands()?.session?.patch?.({
      connectionError: "",
      isConnecting: true,
      loginError: "",
    });
    if (config.lastLoginPayloadRef) {
      config.lastLoginPayloadRef.current = { nick, roomId };
    }
    safeInvoke(config.cancelDisconnectGrace);
    if (config.reconnectAttemptRef) config.reconnectAttemptRef.current = false;

    const attemptLogin = () => {
      if (activeAttempt !== attempt) return;
      attempt.timeoutId = setTimeoutFn(() => {
        if (!settleAttempt(attempt)) return;
        setLoginFailure("Connexion timeout");
      }, Math.max(0, Number(loginTimeoutMs) || DEFAULT_LOGIN_TIMEOUT_MS));
      socket?.emit?.("login", { nick, roomId, installId }, (response) => {
        if (!settleAttempt(attempt)) return;
        if (!response?.ok) {
          applyRejectedLogin(response, socket);
          return;
        }
        commitSuccessfulLogin({ installId, nick, response, roomId });
      });
    };

    const onConnectError = () => {
      if (!settleAttempt(attempt)) return;
      setLoginFailure("Impossible de joindre le serveur");
    };
    attempt.connectErrorHandler = onConnectError;
    socket?.once?.("connect_error", onConnectError);

    if (socket?.connected) {
      safeInvoke(config.syncServerTime, attemptLogin);
      return true;
    }
    Promise.resolve(safeInvoke(config.connectSocketWithAuth))
      .then((connected) => {
        if (activeAttempt !== attempt) return;
        if (!connected) {
          onConnectError();
          return;
        }
        detachConnectError(attempt);
        safeInvoke(config.syncServerTime, attemptLogin);
      })
      .catch(onConnectError);
    return true;
  }

  function configure(nextConfig = {}) {
    config = nextConfig;
  }

  function start() {
    scope.add(() => {
      cancelLoginAttempt();
      config = {};
    });
  }

  return Object.freeze({
    cancelLoginAttempt,
    configure,
    login,
    refs,
    start,
  });
}
