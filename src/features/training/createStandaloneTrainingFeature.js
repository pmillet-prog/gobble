import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import {
  buildTrainingTargetHint,
  buildTrainingTargetHintSchedule,
} from "../../training/standaloneTraining.js";

function createInitialState() {
  return {
    busy: false,
    joinDialog: null,
    session: null,
  };
}

export function createStandaloneTrainingFeature(
  { scope },
  {
    clearTimeoutFn = clearTimeout,
    now = Date.now,
    setTimeoutFn = setTimeout,
  } = {}
) {
  const store = createFeatureStore(createInitialState());
  const refs = Object.freeze({
    session: { current: null },
  });
  let active = false;
  let config = {};
  let configuredSocket = null;
  let socketListenerAttached = false;
  let hintPhase = "";
  let hintSession = null;
  const hintTimers = new Set();
  const presenceTimers = new Set();

  function clearTimerSet(timers) {
    for (const timerId of timers) clearTimeoutFn(timerId);
    timers.clear();
  }

  function scheduleTimer(timers, callback, delayMs) {
    const timerId = setTimeoutFn(() => {
      timers.delete(timerId);
      if (active) callback();
    }, delayMs);
    timers.add(timerId);
    return timerId;
  }

  function commitSession(session) {
    refs.session.current = session;
    store.set("session", session);
    bindSocket();
    reconcileHints();
  }

  async function connectIfNeeded() {
    const socket = config.socket;
    if (socket?.connected) return true;
    if (typeof config.ensureConnection !== "function") return false;
    try {
      return !!(await config.ensureConnection());
    } catch (_) {
      return false;
    }
  }

  function getIdentityPayload() {
    const identity = config.getIdentityPayload?.() || {};
    return {
      ...identity,
      roomId: identity.roomId || config.roomIdRef?.current,
    };
  }

  function restorePresence() {
    const session = refs.session.current;
    const socket = config.socket;
    if (!session || !socket) return;
    socket.emit("training:standalone:presence", {
      ...getIdentityPayload(),
      sessionId: session.sessionId,
      gridId: session.gridId,
      type: session.mode,
      startedAt: session.startedAt,
      durationMs: session.durationMs,
    });
  }

  function onSocketConnect() {
    clearTimerSet(presenceTimers);
    scheduleTimer(presenceTimers, restorePresence, 900);
    scheduleTimer(presenceTimers, restorePresence, 2400);
  }

  function bindSocket() {
    const nextSocket = config.socket || null;
    if (configuredSocket !== nextSocket) {
      clearTimerSet(presenceTimers);
      if (socketListenerAttached) {
        configuredSocket?.off?.("connect", onSocketConnect);
      }
      configuredSocket = nextSocket;
      socketListenerAttached = false;
    }
    const shouldListen = active && !!refs.session.current && !!configuredSocket;
    if (!shouldListen && socketListenerAttached) {
      configuredSocket.off?.("connect", onSocketConnect);
      socketListenerAttached = false;
      clearTimerSet(presenceTimers);
      return;
    }
    if (shouldListen && !socketListenerAttached) {
      configuredSocket.on?.("connect", onSocketConnect);
      socketListenerAttached = true;
    }
  }

  function clearHintTimers() {
    clearTimerSet(hintTimers);
  }

  function reconcileHints() {
    const session = refs.session.current;
    const phase = config.phase;
    if (hintSession === session && hintPhase === phase) return;
    hintSession = session;
    hintPhase = phase;
    clearHintTimers();
    const isTarget = session?.mode === "target_long" || session?.mode === "target_score";
    if (!active || !session || !isTarget || phase !== "playing") return;
    const schedule = buildTrainingTargetHintSchedule(
      session.durationMs,
      session.targetLength
    );
    const reveal = (count) => {
      config.onHint?.(
        buildTrainingTargetHint({
          word: session.targetWord,
          path: session.targetPath,
          grid: session.grid,
          revealCount: count,
          kind: session.mode,
          seed: session.gridId,
        })
      );
    };
    const nowServerMs = config.getNowServerMs?.() ?? now();
    const elapsed = Math.max(0, nowServerMs - Number(session.startedAt || 0));
    let alreadyRevealed = 0;
    schedule.forEach((atMs, index) => {
      if (atMs <= elapsed) {
        alreadyRevealed = index + 1;
        return;
      }
      scheduleTimer(hintTimers, () => reveal(index + 1), atMs - elapsed);
    });
    if (alreadyRevealed > 0) reveal(alreadyRevealed);
  }

  function configure(nextConfig = {}) {
    const previousPhase = config.phase;
    config = { ...config, ...nextConfig };
    bindSocket();
    if (previousPhase !== config.phase) reconcileHints();
  }

  async function startTraining(type, label, durationMs) {
    if (store.getState().busy) return false;
    store.set("busy", true);
    const connected = await connectIfNeeded();
    if (!active) return false;
    if (!connected) {
      store.set("busy", false);
      config.showToast?.(
        "Connexion nécessaire pour récupérer une nouvelle grille.",
        3200
      );
      return false;
    }
    config.socket.emit(
      "training:standalone:start",
      {
        ...getIdentityPayload(),
        type,
        durationMs,
      },
      (response) => {
        if (!active) return;
        store.set("busy", false);
        if (!response?.ok || !response?.training) {
          const message =
            response?.error === "maintenance_mode"
              ? "Maintenance en cours."
              : response?.error === "auth_required"
                ? "Connecte-toi à ton compte pour apparaître dans le live."
                : response?.error === "training_pool_unavailable"
                  ? "Le stock de grilles est momentanément indisponible."
                  : "Impossible de lancer cet entraînement.";
          config.showToast?.(message, 3400);
          return;
        }
        const session = {
          ...response.training,
          serverPreparedAt: response.training.startedAt || null,
          startedAt: now(),
          requestedLabel: label || response.training.label,
        };
        commitSession(session);
        store.set("joinDialog", null);
        config.onLaunch?.(session, response.liveStatus || null);
      }
    );
    return true;
  }

  async function requestJoinLive() {
    const session = refs.session.current;
    if (!session || store.getState().busy) return false;
    store.set("busy", true);
    const connected = await connectIfNeeded();
    if (!active) return false;
    if (!connected) {
      store.set("busy", false);
      config.showToast?.("Le live est actuellement inaccessible.", 2600);
      return false;
    }
    config.socket.emit(
      "training:standalone:status",
      {
        ...getIdentityPayload(),
        sessionId: session.sessionId,
        type: session.mode,
      },
      (response) => {
        if (!active) return;
        store.set("busy", false);
        if (!response?.ok) {
          config.showToast?.("Impossible de consulter le live.", 2600);
          return;
        }
        store.set("joinDialog", response.liveStatus || {});
      }
    );
    return true;
  }

  async function confirmJoinLive() {
    if (!refs.session.current || store.getState().busy) return false;
    store.set("busy", true);
    const connected = await connectIfNeeded();
    if (!active) return false;
    if (!connected) {
      store.set("busy", false);
      config.showToast?.("Impossible de rejoindre le live.", 3000);
      return false;
    }
    config.socket.emit(
      "training:standalone:stop",
      { ...getIdentityPayload(), joinLive: true },
      (response) => {
        if (!active) return;
        store.set("busy", false);
        if (!response?.ok || !response?.snapshot) {
          config.showToast?.("Impossible de rejoindre le live.", 3000);
          return;
        }
        commitSession(null);
        store.set("joinDialog", null);
        config.onJoinLive?.(response.snapshot);
      }
    );
    return true;
  }

  function returnToLobby() {
    if (store.getState().busy) return false;
    const finish = () => {
      commitSession(null);
      store.set("joinDialog", null);
      config.onReturnLobby?.();
    };
    if (!config.socket?.connected || !refs.session.current) {
      finish();
      return true;
    }
    store.set("busy", true);
    config.socket.emit(
      "training:standalone:stop",
      { ...getIdentityPayload(), joinLive: false },
      () => {
        if (!active) return;
        store.set("busy", false);
        finish();
      }
    );
    return true;
  }

  function clearSession() {
    commitSession(null);
  }

  function cancelJoinDialog() {
    store.set("joinDialog", null);
  }

  function start() {
    active = true;
    bindSocket();
    reconcileHints();
    scope.add(() => {
      active = false;
      if (socketListenerAttached) {
        configuredSocket?.off?.("connect", onSocketConnect);
      }
      configuredSocket = null;
      socketListenerAttached = false;
      clearTimerSet(presenceTimers);
      clearHintTimers();
      config = {};
      hintPhase = "";
      hintSession = null;
      refs.session.current = null;
      store.replace(createInitialState());
    });
  }

  return Object.freeze({
    cancelJoinDialog,
    clearSession,
    configure,
    confirmJoinLive,
    refs,
    requestJoinLive,
    returnToLobby,
    start,
    startTraining,
    store,
  });
}
