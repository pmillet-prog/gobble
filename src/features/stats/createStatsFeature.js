import { createStateFeature } from "../../app/core/createStateFeature.js";
import { shouldProcessAttachedLiveRoomEvent } from "../../utils/liveEventScope.js";

export function createInitialStatsState() {
  return {
    activeIndex: 0,
    error: "",
    loading: false,
    open: false,
    seasonActiveIndex: 0,
    stats: null,
    tab: "weekly",
    trophyHistory: [],
    trophyLoading: false,
    trophyStatus: null,
    vocabCount: null,
    vocabLoading: false,
    vocabOverlayOpen: false,
    vocabOverlayRequest: null,
    vocabResultsReadyKey: null,
    vocabRoundDelta: null,
    vocabUpdatedAt: null,
    vocabWeeklyCount: null,
    vocabWeeklyRoundDelta: null,
    vocabWeeklyUpdatedAt: null,
    weeklyArrowBlink: false,
    weeklyArrowBump: false,
    weeklyArrowVisible: false,
  };
}

export function createStatsFeature(context, { now = Date.now } = {}) {
  let active = false;
  let feature = null;
  let realtimeConfig = {};
  let realtimeSocket = null;
  let realtimeUnsubscribe = null;

  function shouldHandleRealtimeEvent(incomingRoomId = null) {
    if (realtimeConfig.phaseLoopTestEnabledRef?.current) return false;
    if (realtimeConfig.standaloneTrainingSessionRef?.current) return false;
    return shouldProcessAttachedLiveRoomEvent({
      appView: realtimeConfig.appViewRef?.current,
      gameplaySession: realtimeConfig.gameplaySession,
      isLoggedIn: realtimeConfig.isLoggedInRef?.current,
      activeRoomId: realtimeConfig.currentRoomIdRef?.current,
      incomingRoomId,
      liveSessionReadyRef: realtimeConfig.liveSessionReadyRef,
    });
  }

  function onTrophiesUpdated(payload) {
    if (!shouldHandleRealtimeEvent(payload?.roomId)) return;
    const updates = Array.isArray(payload?.updates) ? payload.updates : [];
    if (!updates.length) return;
    const selfId = String(
      realtimeConfig.installIdRef?.current || realtimeConfig.installId || ""
    ).trim();
    if (!selfId) return;
    const entry = updates.find((update) => update?.installId === selfId);
    if (!entry) return;
    feature.set("trophyStatus", (previous) => ({
      ...(previous || {}),
      trophies: entry.newTrophies,
      league: entry.league,
      progress: entry.progress || previous?.progress,
      shieldCount: entry.shieldCount ?? previous?.shieldCount ?? 0,
      shieldFloor: entry.shieldFloor ?? previous?.shieldFloor ?? 0,
      updatedAt: entry.updatedAt || now(),
      lastDelta: entry.delta,
      lastTournamentId: payload?.tournamentId || null,
    }));
    feature.set("trophyHistory", (previous) => [
      {
        ts: entry.updatedAt || now(),
        delta: entry.delta,
        trophies: entry.newTrophies,
        league: entry.league,
        tournamentId: payload?.tournamentId || null,
      },
      ...(previous || []),
    ].slice(0, 10));
  }

  function bindRealtime() {
    const nextSocket = realtimeConfig.socket || context.ports?.realtime || null;
    if (realtimeSocket === nextSocket && realtimeUnsubscribe) return;
    realtimeUnsubscribe?.();
    realtimeUnsubscribe = null;
    realtimeSocket = nextSocket;
    if (!active || typeof realtimeSocket?.bind !== "function") return;
    realtimeUnsubscribe = realtimeSocket.bind({
      trophiesUpdated: onTrophiesUpdated,
    });
  }

  function configureRealtime(nextConfig = {}) {
    realtimeConfig = nextConfig;
    bindRealtime();
  }

  feature = createStateFeature(context, createInitialStatsState, {
    start: ({ scope, store }) => {
      active = true;
      bindRealtime();
      scope.add(() => {
        active = false;
        realtimeUnsubscribe?.();
        realtimeUnsubscribe = null;
        realtimeSocket = null;
        realtimeConfig = {};
        store.patch(createInitialStatsState());
      });
    },
  });

  return Object.freeze({
    ...feature,
    configureRealtime,
  });
}
