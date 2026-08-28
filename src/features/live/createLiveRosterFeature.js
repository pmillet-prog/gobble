import { createStateFeature } from "../../app/core/createStateFeature.js";
import {
  buildPlayersSignature,
  buildRankingSignature,
} from "../../game/liveSnapshotSignature.js";
import { shouldProcessAttachedLiveRoomEvent } from "../../utils/liveEventScope.js";

const EMPTY_LIST = Object.freeze([]);
const DEFAULT_QUEUE_TIMING = Object.freeze({
  playersMinMs: 120,
  rankingMinMs: 180,
  rankingTraceHoldMaxMs: 600,
  samsungPlayersMinMs: 320,
  samsungRankingMinMs: 260,
});

const ROSTER_FIELDS = Object.freeze([
  "afk",
  "crowned",
  "inTraining",
  "installId",
  "isBot",
  "isDailyChampion",
  "isWeeklyChampion",
  "isWeeklyVocabChampion",
  "nick",
  "playerKey",
  "readyForTournament",
  "team",
  "trainingMode",
  "userId",
  "weeklyVocabPodiumRank",
]);

function normalizeRosterEntry(entry) {
  const normalized = {};
  for (const field of ROSTER_FIELDS) {
    normalized[field] = entry?.[field] ?? null;
  }
  return Object.freeze(normalized);
}

function buildMetadataSnapshot(list) {
  if (!Array.isArray(list) || list.length === 0) return EMPTY_LIST;
  return Object.freeze(list.map(normalizeRosterEntry));
}

function buildMetadataFingerprint(list) {
  const fingerprint = new Map();
  if (!Array.isArray(list)) return fingerprint;
  for (const entry of list) {
    const signature = ROSTER_FIELDS.map((field) => String(entry?.[field] ?? "")).join(":");
    fingerprint.set(signature, (fingerprint.get(signature) || 0) + 1);
  }
  return fingerprint;
}

function fingerprintsMatch(left, right) {
  if (left === right) return true;
  if (!left || !right || left.size !== right.size) return false;
  for (const [signature, count] of left) {
    if (right.get(signature) !== count) return false;
  }
  return true;
}

export function createInitialLiveRosterState() {
  return {
    livePlayers: EMPTY_LIST,
    liveProvisionalRanking: EMPTY_LIST,
    players: EMPTY_LIST,
    provisionalRanking: EMPTY_LIST,
  };
}

export function createLiveRosterFeature(
  context,
  {
    clearTimeoutFn = clearTimeout,
    now = Date.now,
    setTimeoutFn = setTimeout,
    timing = DEFAULT_QUEUE_TIMING,
  } = {}
) {
  const { scope } = context;
  let active = false;
  let playersFingerprint = null;
  let provisionalRankingFingerprint = null;
  let playersLastApplyAt = 0;
  let playersLastSignature = "";
  let playersQueueContext = null;
  let playersQueueTimerId = null;
  let playersQueued = null;
  let rankingLastApplyAt = 0;
  let rankingLastSignature = "";
  let rankingQueueContext = null;
  let rankingQueueTimerId = null;
  let rankingQueued = null;
  let rankingTraceHoldTimerId = null;
  let realtimeConfig = {};
  let realtimeSocket = null;
  let realtimeUnsubscribe = null;
  let stopped = false;
  let feature = null;

  const queueTiming = Object.freeze({
    ...DEFAULT_QUEUE_TIMING,
    ...(timing && typeof timing === "object" ? timing : {}),
  });

  function emitQueueEvent(context, label, payload) {
    try {
      context?.onEvent?.(label, payload);
    } catch (_) {}
  }

  function emitRealtimeEvent(label, payload) {
    emitQueueEvent(realtimeConfig, label, payload);
  }

  function shouldHandleRealtimeEvent(incomingRoomId = null, incomingRoundId = null) {
    if (realtimeConfig.phaseLoopTestEnabledRef?.current) return false;
    if (realtimeConfig.standaloneTrainingSessionRef?.current) return false;
    return shouldProcessAttachedLiveRoomEvent({
      appView: realtimeConfig.appViewRef?.current,
      gameplaySession: realtimeConfig.gameplaySession,
      isLoggedIn: realtimeConfig.isLoggedInRef?.current,
      activeRoomId: realtimeConfig.currentRoomIdRef?.current,
      incomingRoomId,
      incomingRoundId,
      liveSessionReadyRef: realtimeConfig.liveSessionReadyRef,
    });
  }

  function createRealtimeQueueOptions() {
    return {
      isSamsungBrowser: !!realtimeConfig.isSamsungBrowserRef?.current,
      isTraceActive: realtimeConfig.isTraceActive,
      onEvent: realtimeConfig.onEvent,
      startTransition: realtimeConfig.startTransition,
    };
  }

  function onPlayersUpdate(list = EMPTY_LIST) {
    if (!shouldHandleRealtimeEvent()) return;
    const players = Array.isArray(list) ? list : EMPTY_LIST;
    try {
      realtimeConfig.onDiagnosticCounter?.("socketPlayersUpdate");
    } catch (_) {}
    emitRealtimeEvent("players-received", { count: players.length });
    queuePlayers(players, createRealtimeQueueOptions());
  }

  function onRankingUpdate({ roomId, roundId, ranking = EMPTY_LIST } = {}) {
    if (!shouldHandleRealtimeEvent(roomId, roundId)) return;
    const activeRoundId = realtimeConfig.roundIdRef?.current;
    if (activeRoundId && roundId && roundId !== activeRoundId) return;
    const safeRanking = Array.isArray(ranking) ? ranking : EMPTY_LIST;
    try {
      realtimeConfig.onDiagnosticCounter?.("socketRankingUpdate");
    } catch (_) {}
    emitRealtimeEvent("ranking-received", { count: safeRanking.length });
    queueRanking(safeRanking, createRealtimeQueueOptions());
  }

  function bindRealtime() {
    const nextSocket = realtimeConfig.socket || context.ports?.realtime || null;
    if (realtimeSocket === nextSocket && realtimeUnsubscribe) return;
    realtimeUnsubscribe?.();
    realtimeUnsubscribe = null;
    realtimeSocket = nextSocket;
    if (!active || typeof realtimeSocket?.bind !== "function") return;
    realtimeUnsubscribe = realtimeSocket.bind({
      playersUpdate: onPlayersUpdate,
      rankingUpdate: onRankingUpdate,
    });
  }

  function configureRealtime(nextConfig = {}) {
    realtimeConfig = nextConfig;
    bindRealtime();
  }

  function isTraceActive(context) {
    try {
      return !!context?.isTraceActive?.();
    } catch (_) {
      return false;
    }
  }

  function clearPlayersTimer() {
    if (playersQueueTimerId != null) clearTimeoutFn(playersQueueTimerId);
    playersQueueTimerId = null;
  }

  function clearRankingTimers() {
    if (rankingQueueTimerId != null) clearTimeoutFn(rankingQueueTimerId);
    if (rankingTraceHoldTimerId != null) clearTimeoutFn(rankingTraceHoldTimerId);
    rankingQueueTimerId = null;
    rankingTraceHoldTimerId = null;
  }

  function clearQueuedUpdates() {
    clearPlayersTimer();
    clearRankingTimers();
    playersQueued = null;
    rankingQueued = null;
    playersQueueContext = null;
    rankingQueueContext = null;
  }

  function setPlayers(nextOrUpdater) {
    if (stopped) return;
    const current = feature.store.getState().livePlayers;
    const resolved =
      typeof nextOrUpdater === "function"
        ? nextOrUpdater(current)
        : nextOrUpdater;
    const livePlayers = Array.isArray(resolved) ? resolved : EMPTY_LIST;
    if (livePlayers === current) return;
    playersLastSignature = buildPlayersSignature(livePlayers);
    const patch = { livePlayers };
    const nextFingerprint = buildMetadataFingerprint(livePlayers);
    if (!fingerprintsMatch(nextFingerprint, playersFingerprint)) {
      playersFingerprint = nextFingerprint;
      patch.players = buildMetadataSnapshot(livePlayers);
    }
    feature.patch(patch);
  }

  function setProvisionalRanking(nextOrUpdater) {
    if (stopped) return;
    const current = feature.store.getState().liveProvisionalRanking;
    const resolved =
      typeof nextOrUpdater === "function"
        ? nextOrUpdater(current)
        : nextOrUpdater;
    const liveProvisionalRanking = Array.isArray(resolved)
      ? resolved
      : EMPTY_LIST;
    if (liveProvisionalRanking === current) return;
    rankingLastSignature = buildRankingSignature(liveProvisionalRanking);
    const patch = { liveProvisionalRanking };
    const nextFingerprint = buildMetadataFingerprint(liveProvisionalRanking);
    if (!fingerprintsMatch(nextFingerprint, provisionalRankingFingerprint)) {
      provisionalRankingFingerprint = nextFingerprint;
      patch.provisionalRanking = buildMetadataSnapshot(liveProvisionalRanking);
    }
    feature.patch(patch);
  }

  function applyPlayersNow(nextPlayers, context) {
    const safePlayers = Array.isArray(nextPlayers) ? nextPlayers : EMPTY_LIST;
    const nextSignature = buildPlayersSignature(safePlayers);
    if (nextSignature && nextSignature === playersLastSignature) return false;
    playersLastSignature = nextSignature;
    playersLastApplyAt = now();
    emitQueueEvent(context, "players-applied", { count: safePlayers.length });
    setPlayers(safePlayers);
    return true;
  }

  function applyRankingNow(nextRanking, context) {
    const safeRanking = Array.isArray(nextRanking) ? nextRanking : EMPTY_LIST;
    const nextSignature = buildRankingSignature(safeRanking);
    if (nextSignature && nextSignature === rankingLastSignature) return false;
    rankingLastSignature = nextSignature;
    rankingLastApplyAt = now();
    emitQueueEvent(context, "ranking-applied", { count: safeRanking.length });
    setProvisionalRanking(safeRanking);
    return true;
  }

  function scheduleRankingFreshnessFlush(context) {
    if (rankingTraceHoldTimerId != null) return;
    rankingTraceHoldTimerId = setTimeoutFn(() => {
      rankingTraceHoldTimerId = null;
      const pendingRanking = rankingQueued;
      rankingQueued = null;
      if (!pendingRanking) return;
      emitQueueEvent(context, "ranking-freshness-flush", {
        count: pendingRanking.length,
      });
      const apply = () => applyRankingNow(pendingRanking, context);
      if (typeof context?.startTransition === "function") {
        context.startTransition(apply);
      } else {
        apply();
      }
    }, Math.max(0, Number(queueTiming.rankingTraceHoldMaxMs) || 0));
  }

  function queuePlayers(nextPlayers = EMPTY_LIST, options = {}) {
    if (stopped) return false;
    const safePlayers = Array.isArray(nextPlayers) ? nextPlayers : EMPTY_LIST;
    const nextSignature = buildPlayersSignature(safePlayers);
    if (!options.force && nextSignature && nextSignature === playersLastSignature) {
      return false;
    }
    const context = {
      isTraceActive: options.isTraceActive,
      onEvent: options.onEvent,
    };
    playersQueueContext = context;
    if (options.force) {
      clearPlayersTimer();
      playersQueued = null;
      applyPlayersNow(safePlayers, context);
      return true;
    }
    playersQueued = safePlayers;
    if (isTraceActive(context)) {
      emitQueueEvent(context, "players-held", { count: safePlayers.length });
      clearPlayersTimer();
      return true;
    }
    const minIntervalMs = options.isSamsungBrowser
      ? queueTiming.samsungPlayersMinMs
      : queueTiming.playersMinMs;
    const elapsed = now() - playersLastApplyAt;
    if (playersQueueTimerId == null && elapsed >= minIntervalMs) {
      const immediate = playersQueued;
      playersQueued = null;
      applyPlayersNow(immediate || EMPTY_LIST, context);
      return true;
    }
    if (playersQueueTimerId != null) return true;
    playersQueueTimerId = setTimeoutFn(() => {
      playersQueueTimerId = null;
      const pending = playersQueued;
      if (isTraceActive(playersQueueContext)) return;
      playersQueued = null;
      if (pending) applyPlayersNow(pending, playersQueueContext);
    }, Math.max(0, minIntervalMs - elapsed));
    return true;
  }

  function queueRanking(nextRanking = EMPTY_LIST, options = {}) {
    if (stopped) return false;
    const safeRanking = Array.isArray(nextRanking) ? nextRanking : EMPTY_LIST;
    const nextSignature = buildRankingSignature(safeRanking);
    if (!options.force && nextSignature && nextSignature === rankingLastSignature) {
      return false;
    }
    const context = {
      isTraceActive: options.isTraceActive,
      onEvent: options.onEvent,
      startTransition: options.startTransition,
    };
    rankingQueueContext = context;
    if (options.force) {
      clearQueuedUpdates();
      applyRankingNow(safeRanking, context);
      return true;
    }
    rankingQueued = safeRanking;
    if (isTraceActive(context)) {
      emitQueueEvent(context, "ranking-held", { count: safeRanking.length });
      if (rankingQueueTimerId != null) {
        clearTimeoutFn(rankingQueueTimerId);
        rankingQueueTimerId = null;
      }
      scheduleRankingFreshnessFlush(context);
      return true;
    }
    const minIntervalMs = options.isSamsungBrowser
      ? queueTiming.samsungRankingMinMs
      : queueTiming.rankingMinMs;
    const elapsed = now() - rankingLastApplyAt;
    if (rankingQueueTimerId == null && elapsed >= minIntervalMs) {
      const immediate = rankingQueued;
      rankingQueued = null;
      applyRankingNow(immediate || EMPTY_LIST, context);
      return true;
    }
    if (rankingQueueTimerId != null) return true;
    rankingQueueTimerId = setTimeoutFn(() => {
      rankingQueueTimerId = null;
      const pending = rankingQueued;
      if (isTraceActive(rankingQueueContext)) {
        scheduleRankingFreshnessFlush(rankingQueueContext);
        return;
      }
      rankingQueued = null;
      if (pending) applyRankingNow(pending, rankingQueueContext);
    }, Math.max(0, minIntervalMs - elapsed));
    return true;
  }

  function flushQueuedUpdates() {
    if (stopped) return { players: 0, ranking: 0 };
    clearPlayersTimer();
    clearRankingTimers();
    const pendingPlayers = playersQueued;
    const pendingRanking = rankingQueued;
    playersQueued = null;
    rankingQueued = null;
    const counts = {
      players: pendingPlayers ? pendingPlayers.length : 0,
      ranking: pendingRanking ? pendingRanking.length : 0,
    };
    if (pendingPlayers) applyPlayersNow(pendingPlayers, playersQueueContext);
    if (pendingRanking) applyRankingNow(pendingRanking, rankingQueueContext);
    return counts;
  }

  feature = createStateFeature({ scope }, createInitialLiveRosterState, {
    start: () => {
      active = true;
      stopped = false;
      bindRealtime();
      scope.add(() => {
        active = false;
        stopped = true;
        realtimeUnsubscribe?.();
        realtimeUnsubscribe = null;
        realtimeSocket = null;
        realtimeConfig = {};
        clearQueuedUpdates();
        playersFingerprint = null;
        provisionalRankingFingerprint = null;
        playersLastApplyAt = 0;
        playersLastSignature = "";
        rankingLastApplyAt = 0;
        rankingLastSignature = "";
        feature.patch(createInitialLiveRosterState());
      });
    },
  });

  return Object.freeze({
    ...feature,
    clearQueuedUpdates,
    configureRealtime,
    flushQueuedUpdates,
    queuePlayers,
    queueRanking,
    setPlayers,
    setProvisionalRanking,
  });
}
