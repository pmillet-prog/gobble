import { shouldProcessLiveRoomEvent } from "../../utils/liveEventScope.js";
import { isTournamentCelebrationActive } from "../../../shared/presenterCelebrationPolicy.js";

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
  let latestLepersIntervention = null;
  const lepersInterventionListeners = new Set();

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
    latestLepersIntervention = null;
  }

  function restorePresenterInterventions(roundPayload) {
    const interventions = Array.isArray(roundPayload?.presenterInterventions)
      ? roundPayload.presenterInterventions
      : [];
    if (interventions.length) {
      safeInvoke(config.onPresenterInterventions, interventions);
    }
  }

  function restoreTournamentCelebrationInterventions(payload) {
    const summary = payload?.tournamentSummary || payload?.breakState?.tournamentSummary;
    restorePresenterInterventions(summary);
  }

  function onRoundPreparing(payload = {}) {
    if (!canUseLiveDriver(payload?.roomId)) return;
    const current = config.gameplaySession?.store?.getState?.();
    if (
      current?.phase === "intro" ||
      current?.phase === "playing" ||
      current?.phase === "resolving"
    ) {
      return;
    }
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
    restorePresenterInterventions(payload);
    const lepersChallenge = payload?.lepersChallenge;
    if (lepersChallenge?.text) {
      publishLepersIntervention({
        roomId: payload.roomId,
        roundId: payload.roundId,
        id: lepersChallenge.id,
        kind: "challenge",
        text: lepersChallenge.text,
        highlights: lepersChallenge.highlights,
      });
    }
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
    restorePresenterInterventions(payload);
    restoreTournamentCelebrationInterventions(payload);
    safeInvoke(getHandlers().onRoundEnded, payload);
  }

  function onBreakStarted(payload = {}) {
    if (!canUseLiveDriver(payload?.roomId)) return;
    const state = config.gameplaySession?.store?.getState?.();
    if (!state?.sessionId || state?.origin !== "live") return;
    const transition = config.gameplaySession?.transitionPhase?.("intermission", payload);
    if (!transition?.accepted) return;
    restoreTournamentCelebrationInterventions(payload);
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

  function publishLepersIntervention(payload) {
    const nextId = normalizeId(payload?.id);
    const previousId = normalizeId(latestLepersIntervention?.id);
    if (nextId && previousId === nextId) return;
    latestLepersIntervention = payload;
    for (const listener of lepersInterventionListeners) {
      safeInvoke(listener, payload);
    }
  }

  function onLepersIntervention(payload = {}) {
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
    publishLepersIntervention(payload);
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
      lepersIntervention: onLepersIntervention,
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

  function subscribeLepersInterventions(listener) {
    if (typeof listener !== "function") return () => {};
    lepersInterventionListeners.add(listener);
    if (latestLepersIntervention) safeInvoke(listener, latestLepersIntervention);
    return () => lepersInterventionListeners.delete(listener);
  }

  function hydrateSnapshot(snapshot, { entryKind = "resume" } = {}) {
    if (!snapshot || typeof snapshot !== "object") return false;
    if (!canUseLiveDriver(snapshot.roomId, { requireReady: false })) return false;
    const result = config.gameplaySession?.hydrateSnapshot?.(snapshot, { entryKind });
    if (!result?.accepted) return false;
    const snapshotPhase = String(snapshot?.phase || "").trim().toLowerCase();
    const tournamentCelebrationActive =
      snapshotPhase === "break" || snapshotPhase === "results"
        ? isTournamentCelebrationActive({
            breakKind:
              snapshot?.breakState?.breakKind ||
              snapshot?.lastRoundResults?.payload?.tournament?.breakKind,
            celebrationAt:
              snapshot?.breakState?.tournamentSummaryAt ||
              snapshot?.lastRoundResults?.payload?.tournamentSummaryAt,
            nowMs: snapshot?.capturedAt || Date.now(),
          })
        : false;
    const retainedLepersIntervention = tournamentCelebrationActive
      ? null
      : latestLepersIntervention;
    resetRoundGuards();
    const snapshotRoundId = normalizeId(
      snapshot?.currentRound?.roundId ||
        snapshot?.currentRound?.id ||
        snapshot?.lastRoundResults?.payload?.roundId ||
        snapshot?.lastRoundResults?.round?.id
    );
    if (
      retainedLepersIntervention &&
      normalizeId(retainedLepersIntervention.roundId) === snapshotRoundId
    ) {
      latestLepersIntervention = retainedLepersIntervention;
    }
    hintProgress = getHintProgress(snapshot.specialHint);
    safeInvoke(config.onHydrateSnapshot, snapshot, {
      entryKind,
      sessionId: result.state.sessionId,
    });
    if (!tournamentCelebrationActive) {
      restorePresenterInterventions(snapshot.currentRound);
      restorePresenterInterventions(snapshot.lastRoundResults?.payload);
    }
    restoreTournamentCelebrationInterventions(
      snapshot?.breakState?.tournamentSummary
        ? snapshot.breakState
        : snapshot.lastRoundResults?.payload
    );
    const lepersResult = snapshot?.lastRoundResults?.payload?.lepersResult;
    if (
      !tournamentCelebrationActive &&
      (snapshotPhase === "break" || snapshotPhase === "results") &&
      lepersResult?.text
    ) {
      publishLepersIntervention({
        roomId: snapshot.roomId,
        roundId:
          snapshot?.lastRoundResults?.payload?.roundId ||
          snapshot?.lastRoundResults?.round?.id,
        id: lepersResult.id,
        kind: "answer",
        text: lepersResult.text,
        chatCopyText: lepersResult.chatCopyText,
        highlights: lepersResult.highlights,
      });
      return true;
    }
    const lepersChallenge = snapshot?.currentRound?.lepersChallenge;
    if (
      !tournamentCelebrationActive &&
      lepersChallenge?.text &&
      !snapshot?.player?.lepersChallengeFound
    ) {
      publishLepersIntervention({
        roomId: snapshot.roomId,
        roundId: snapshot.currentRound?.roundId,
        id: lepersChallenge.id,
        kind: "challenge",
        text: lepersChallenge.text,
        highlights: lepersChallenge.highlights,
      });
    }
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
      lepersInterventionListeners.clear();
    });
  }

  return Object.freeze({
    configureRealtime,
    hydrateSnapshot,
    start,
    subscribeLepersInterventions,
  });
}
