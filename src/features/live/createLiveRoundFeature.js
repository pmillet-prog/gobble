import { shouldProcessLiveRoomEvent } from "../../utils/liveEventScope.js";

function safeInvoke(callback, ...args) {
  try {
    return callback?.(...args);
  } catch (error) {
    queueMicrotask(() => {
      throw error;
    });
    return undefined;
  }
}

function normalizeId(value) {
  if (value == null || value === "") return null;
  return String(value);
}

function getHintProgress(payload) {
  if (Array.isArray(payload?.revealWordIndices)) return payload.revealWordIndices.length;
  if (Array.isArray(payload?.wordIndices)) return payload.wordIndices.length;
  const pattern = String(payload?.pattern || "");
  return pattern.replace(/[_\s]/g, "").length;
}

export function createLiveRoundFeature({ scope }) {
  let active = false;
  let config = {};
  let configuredSocket = null;
  let realtimeUnsubscribe = null;
  let hintProgress = 0;
  let solvedKeys = new Set();

  function getHandlers() {
    return config.handlersRef?.current || config.handlers || {};
  }

  function canUseLiveDriver(incomingRoomId = null, { requireReady = true } = {}) {
    if (config.phaseLoopTestEnabledRef?.current) return false;
    if (config.standaloneTrainingSessionRef?.current) return false;
    if (
      requireReady &&
      config.liveSessionReadyRef &&
      config.liveSessionReadyRef.current !== true
    ) {
      return false;
    }
    return shouldProcessLiveRoomEvent({
      appView: config.appViewRef?.current,
      isLoggedIn: config.isLoggedInRef?.current,
      activeRoomId: config.currentRoomIdRef?.current,
      incomingRoomId,
    });
  }

  function resetRoundGuards() {
    hintProgress = 0;
    solvedKeys = new Set();
  }

  function onRoundPreparing(payload = {}) {
    if (!canUseLiveDriver(payload?.roomId)) return;
    if (
      !config.gameplaySession?.acceptsEvent?.({
        origin: "live",
        roomId: payload?.roomId,
      })
    ) {
      return;
    }
    safeInvoke(getHandlers().onRoundPreparing, payload);
  }

  function onRoundStarted(payload = {}) {
    if (!canUseLiveDriver(payload?.roomId)) return;
    if (!Array.isArray(payload?.grid)) return;
    const result = config.gameplaySession?.startRound?.(payload, {
      entryKind: "event",
      origin: "live",
    });
    if (!result?.accepted) return;
    resetRoundGuards();
    safeInvoke(getHandlers().onRoundStarted, payload);
  }

  function onRoundEnded(payload = {}) {
    if (!canUseLiveDriver(payload?.roomId)) return;
    if (
      !config.gameplaySession?.acceptsEvent?.({
        origin: "live",
        roomId: payload?.roomId,
        roundId: payload?.roundId,
      })
    ) {
      return;
    }
    const transition = config.gameplaySession?.transitionPhase?.("resolving", payload);
    if (!transition?.accepted) return;
    safeInvoke(getHandlers().onRoundEnded, payload);
  }

  function onBreakStarted(payload = {}) {
    if (!canUseLiveDriver(payload?.roomId)) return;
    const state = config.gameplaySession?.store?.getState?.();
    if (!state?.sessionId || state?.origin !== "live") return;
    const transition = config.gameplaySession?.transitionPhase?.("intermission", payload);
    if (!transition?.accepted) return;
    safeInvoke(getHandlers().onBreakStarted, payload);
  }

  function onSpecialHint(payload = {}) {
    if (!canUseLiveDriver(payload?.roomId)) return;
    if (
      !config.gameplaySession?.acceptsEvent?.({
        origin: "live",
        roomId: payload?.roomId,
        roundId: payload?.roundId,
      })
    ) {
      return;
    }
    const nextProgress = getHintProgress(payload);
    if (nextProgress < hintProgress) return;
    hintProgress = nextProgress;
    safeInvoke(getHandlers().onSpecialHint, payload);
  }

  function onSpecialSolved(payload = {}) {
    if (!canUseLiveDriver(payload?.roomId)) return;
    if (
      !config.gameplaySession?.acceptsEvent?.({
        origin: "live",
        roomId: payload?.roomId,
        roundId: payload?.roundId,
      })
    ) {
      return;
    }
    const key = [payload?.roundId, payload?.kind, payload?.nick, payload?.found].join(":");
    if (solvedKeys.has(key)) return;
    solvedKeys.add(key);
    safeInvoke(getHandlers().onSpecialSolved, payload);
  }

  function onCultureThemeChallenge(payload = {}) {
    if (!canUseLiveDriver(payload?.roomId)) return;
    if (
      payload?.roundId &&
      !config.gameplaySession?.acceptsEvent?.({
        origin: "live",
        roomId: payload?.roomId,
        roundId: payload?.roundId,
      })
    ) {
      return;
    }
    safeInvoke(getHandlers().onCultureThemeChallenge, payload);
  }

  function onTournamentLobbyUpdate(payload = {}) {
    if (!canUseLiveDriver(payload?.roomId)) return;
    if (
      !config.gameplaySession?.acceptsEvent?.({
        origin: "live",
        roomId: payload?.roomId,
      })
    ) {
      return;
    }
    safeInvoke(getHandlers().onTournamentLobbyUpdate, payload);
  }

  function bindRealtime() {
    const nextSocket = config.socket || null;
    if (configuredSocket === nextSocket && realtimeUnsubscribe) return;
    realtimeUnsubscribe?.();
    realtimeUnsubscribe = null;
    configuredSocket = nextSocket;
    if (!active || typeof configuredSocket?.bind !== "function") return;
    realtimeUnsubscribe = configuredSocket.bind({
      breakStarted: onBreakStarted,
      cultureThemeChallenge: onCultureThemeChallenge,
      roundEnded: onRoundEnded,
      roundPreparing: onRoundPreparing,
      roundStarted: onRoundStarted,
      specialHint: onSpecialHint,
      specialSolved: onSpecialSolved,
      tournamentLobbyUpdate: onTournamentLobbyUpdate,
    });
  }

  function configureRealtime(nextConfig = {}) {
    config = { ...config, ...nextConfig };
    bindRealtime();
  }

  function hydrateSnapshot(snapshot, { entryKind = "resume" } = {}) {
    if (!snapshot || typeof snapshot !== "object") return false;
    if (!canUseLiveDriver(snapshot.roomId, { requireReady: false })) return false;
    const result = config.gameplaySession?.hydrateSnapshot?.(snapshot, { entryKind });
    if (!result?.accepted) return false;
    resetRoundGuards();
    hintProgress = getHintProgress(snapshot.specialHint);
    safeInvoke(config.onHydrateSnapshot, snapshot, {
      entryKind,
      sessionId: result.state.sessionId,
    });
    return true;
  }

  function start() {
    active = true;
    bindRealtime();
    scope.add(() => {
      active = false;
      realtimeUnsubscribe?.();
      realtimeUnsubscribe = null;
      configuredSocket = null;
      config = {};
      resetRoundGuards();
    });
  }

  return Object.freeze({
    configureRealtime,
    hydrateSnapshot,
    start,
  });
}
