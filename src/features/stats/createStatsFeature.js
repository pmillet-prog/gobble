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

export function createStatsFeature(
  context,
  {
    abortControllerFactory = () => new AbortController(),
    clearTimeoutFn = clearTimeout,
    fetchImpl = (...args) => globalThis.fetch(...args),
    now = Date.now,
    setTimeoutFn = setTimeout,
    warn = (...args) => console.warn(...args),
  } = {}
) {
  let active = false;
  let feature = null;
  let realtimeConfig = {};
  let realtimeSocket = null;
  let realtimeUnsubscribe = null;
  let lastWeeklyFetchAt = 0;
  let lastWeeklyFetchTopN = null;
  let weeklyFetchRetryAfter = 0;
  let weeklyLoadingTimerId = null;
  let weeklyRequest = null;
  let weeklySnapshotController = null;
  let weeklySnapshotGeneration = 0;

  function normalizeTopN(topN, fallback = null) {
    return Number.isFinite(topN)
      ? Math.min(200, Math.max(1, Math.round(topN)))
      : fallback;
  }

  function getWeeklyUrl(topN) {
    return `/api/stats/weekly${topN ? `?topN=${topN}` : ""}`;
  }

  async function readWeeklyResponse(response) {
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`http_${response.status || "error"}`);
    }
    try {
      return text ? JSON.parse(text) : null;
    } catch (_) {
      throw new Error("bad_json");
    }
  }

  function clearWeeklyLoadingTimer() {
    if (weeklyLoadingTimerId == null) return;
    clearTimeoutFn(weeklyLoadingTimerId);
    weeklyLoadingTimerId = null;
  }

  function detachWeeklyRequest(request, { abort = false } = {}) {
    if (!request) return;
    if (weeklyRequest === request) weeklyRequest = null;
    if (request.timeoutId != null) {
      clearTimeoutFn(request.timeoutId);
      request.timeoutId = null;
    }
    if (abort) {
      try {
        request.controller?.abort?.();
      } catch (_) {}
    }
  }

  function cancelWeeklyFetch() {
    detachWeeklyRequest(weeklyRequest, { abort: true });
    clearWeeklyLoadingTimer();
    if (active) feature.set("loading", false);
  }

  async function fetchWeeklySnapshot(topN = 200) {
    if (!active) return null;
    const requestedTopN = normalizeTopN(topN, 200);
    const generation = ++weeklySnapshotGeneration;
    try {
      weeklySnapshotController?.abort?.();
    } catch (_) {}
    const controller = abortControllerFactory();
    weeklySnapshotController = controller;
    try {
      const response = await fetchImpl(getWeeklyUrl(requestedTopN), {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller?.signal,
      });
      const data = await readWeeklyResponse(response);
      if (!active || generation !== weeklySnapshotGeneration) return null;
      if (data && typeof data === "object") {
        feature.patch({ error: "", stats: data });
        return data;
      }
      return null;
    } catch (error) {
      if (
        active &&
        generation === weeklySnapshotGeneration &&
        error?.name !== "AbortError"
      ) {
        warn("weekly stats snapshot failed", error);
      }
      return null;
    } finally {
      if (generation === weeklySnapshotGeneration) {
        weeklySnapshotController = null;
      }
    }
  }

  function fetchWeekly(force = false, topN = null) {
    if (!active) return null;
    const requestedAt = now();
    const requestedTopN = normalizeTopN(topN);
    const inFlight = weeklyRequest;
    if (inFlight?.topN === requestedTopN) return inFlight.promise;
    if (inFlight) {
      if (!force) return inFlight.promise;
      detachWeeklyRequest(inFlight, { abort: true });
    }
    const sameAsLastTopN = lastWeeklyFetchTopN === requestedTopN;
    if (sameAsLastTopN && requestedAt < weeklyFetchRetryAfter) return null;
    if (!force && feature.store.getState().loading) return null;
    if (
      !force &&
      lastWeeklyFetchAt &&
      requestedAt - lastWeeklyFetchAt < 4000 &&
      sameAsLastTopN
    ) {
      return null;
    }

    lastWeeklyFetchAt = requestedAt;
    lastWeeklyFetchTopN = requestedTopN;
    clearWeeklyLoadingTimer();
    feature.patch({ error: "", loading: true });

    const controller = abortControllerFactory();
    const request = {
      controller,
      promise: null,
      startedAt: requestedAt,
      timeoutId: null,
      topN: requestedTopN,
    };
    weeklyRequest = request;
    request.timeoutId = setTimeoutFn(() => controller?.abort?.(), 6500);
    request.promise = (async () => {
      try {
        const response = await fetchImpl(getWeeklyUrl(requestedTopN), {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller?.signal,
        });
        const data = await readWeeklyResponse(response);
        if (!active || weeklyRequest !== request) return null;
        weeklyFetchRetryAfter = 0;
        feature.set("stats", data || null);
        return data || null;
      } catch (error) {
        if (!active || weeklyRequest !== request) return null;
        if (error?.name === "AbortError") {
          feature.set("error", "timeout");
        } else if (error?.message === "bad_json") {
          feature.set("error", "format");
        } else {
          feature.set("error", "erreur");
        }
        weeklyFetchRetryAfter = now() + 2500;
        return null;
      } finally {
        if (request.timeoutId != null) {
          clearTimeoutFn(request.timeoutId);
          request.timeoutId = null;
        }
        if (!active || weeklyRequest !== request) return;
        weeklyRequest = null;
        const elapsed = Math.max(0, now() - request.startedAt);
        weeklyLoadingTimerId = setTimeoutFn(() => {
          weeklyLoadingTimerId = null;
          if (!active || weeklyRequest) return;
          feature.set("loading", false);
        }, Math.max(0, 220 - elapsed));
      }
    })();
    return request.promise;
  }

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
        detachWeeklyRequest(weeklyRequest, { abort: true });
        clearWeeklyLoadingTimer();
        weeklySnapshotGeneration += 1;
        try {
          weeklySnapshotController?.abort?.();
        } catch (_) {}
        weeklySnapshotController = null;
        lastWeeklyFetchAt = 0;
        lastWeeklyFetchTopN = null;
        weeklyFetchRetryAfter = 0;
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
    cancelWeeklyFetch,
    configureRealtime,
    fetchWeekly,
    fetchWeeklySnapshot,
  });
}
