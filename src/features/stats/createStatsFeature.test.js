import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import {
  createInitialStatsState,
  createStatsFeature,
} from "./createStatsFeature.js";

function createDeferred() {
  let reject;
  let resolve;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function createJsonResponse(data) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  };
}

function createTimerHarness() {
  let nextId = 1;
  const timers = new Map();
  return {
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    runDelay(delayMs) {
      const entry = [...timers.entries()].find(([, timer]) => timer.delayMs === delayMs);
      assert.ok(entry, `missing timer with delay ${delayMs}`);
      const [id, timer] = entry;
      timers.delete(id);
      timer.callback();
    },
    setTimeoutFn(callback, delayMs) {
      const id = nextId++;
      timers.set(id, { callback, delayMs });
      return id;
    },
    timers,
  };
}

function createStatsSocket({ connected = false } = {}) {
  const connectionHandlers = new Map();
  const emissions = [];
  return {
    bind() {
      return () => {};
    },
    connected,
    connectionHandlers,
    emissions,
    emit(eventName, payload, acknowledge) {
      emissions.push({ acknowledge, eventName, payload });
    },
    fire(eventName, payload) {
      connectionHandlers.get(eventName)?.(payload);
    },
    off(eventName, handler) {
      if (connectionHandlers.get(eventName) === handler) {
        connectionHandlers.delete(eventName);
      }
    },
    once(eventName, handler) {
      connectionHandlers.set(eventName, handler);
    },
  };
}

test("stats satellite owns vocab and trophy status requests", async () => {
  let clock = 5000;
  let connectionAttempts = 0;
  const socket = createStatsSocket();
  const scope = createResourceScope("stats-status-requests-test");
  const feature = createStatsFeature(
    { ports: { realtime: socket }, scope },
    { now: () => clock }
  );
  feature.configureRealtime({
    ensureConnection() {
      connectionAttempts += 1;
    },
    installIdRef: { current: "user:4" },
    socket,
  });
  feature.start();

  const vocabRequest = feature.requestVocabCount();
  assert.strictEqual(feature.requestVocabCount(), vocabRequest);
  assert.equal(connectionAttempts, 1);
  assert.equal(feature.store.getState().vocabLoading, true);
  assert.deepEqual([...socket.connectionHandlers.keys()].sort(), [
    "connect",
    "connect_error",
  ]);

  socket.connected = true;
  socket.fire("connect");
  assert.equal(socket.connectionHandlers.size, 0);
  assert.deepEqual(socket.emissions[0], {
    acknowledge: socket.emissions[0].acknowledge,
    eventName: "getVocabCount",
    payload: { installId: "user:4" },
  });
  socket.emissions[0].acknowledge({ count: 18, weeklyCount: 7 });
  assert.deepEqual(await vocabRequest, { count: 18, weeklyCount: 7 });
  assert.deepEqual(
    {
      count: feature.store.getState().vocabCount,
      loading: feature.store.getState().vocabLoading,
      updatedAt: feature.store.getState().vocabUpdatedAt,
      weeklyCount: feature.store.getState().vocabWeeklyCount,
      weeklyUpdatedAt: feature.store.getState().vocabWeeklyUpdatedAt,
    },
    {
      count: 18,
      loading: false,
      updatedAt: 5000,
      weeklyCount: 7,
      weeklyUpdatedAt: 5000,
    }
  );

  clock = 6000;
  const throttledRequest = feature.fetchVocabStats();
  assert.strictEqual(feature.fetchVocabStats(), throttledRequest);
  assert.equal(socket.emissions.length, 2);
  socket.emissions[1].acknowledge({ count: 19, weeklyCount: 8 });
  await throttledRequest;
  clock = 7000;
  assert.equal(feature.fetchVocabStats(), null);
  assert.equal(socket.emissions.length, 2);

  const trophyRequest = feature.requestTrophyStatus();
  assert.strictEqual(feature.requestTrophyStatus(), trophyRequest);
  assert.equal(socket.emissions[2].eventName, "getTrophyStatus");
  const history = Array.from({ length: 12 }, (_, index) => ({ delta: index }));
  socket.emissions[2].acknowledge({
    status: { history, league: "or", trophies: 42 },
  });
  assert.deepEqual(await trophyRequest, {
    history,
    league: "or",
    trophies: 42,
  });
  assert.equal(feature.store.getState().trophyHistory.length, 10);
  assert.equal(feature.store.getState().trophyLoading, false);

  const lateRequest = feature.requestTrophyStatus();
  const lateAcknowledge = socket.emissions[3].acknowledge;
  scope.dispose();
  assert.equal(await lateRequest, null);
  lateAcknowledge({ status: { trophies: 999 } });
  assert.deepEqual(feature.store.getState(), createInitialStatsState());
});

test("stats satellite clears status listeners when connection fails", async () => {
  const socket = createStatsSocket();
  const scope = createResourceScope("stats-status-connection-error-test");
  const feature = createStatsFeature({ ports: { realtime: socket }, scope });
  feature.configureRealtime({
    ensureConnection: () => Promise.reject(new Error("auth_failed")),
    installId: "user:5",
    socket,
  });
  feature.start();

  assert.equal(await feature.requestTrophyStatus(), null);
  assert.equal(socket.connectionHandlers.size, 0);
  assert.equal(feature.store.getState().trophyLoading, false);
  scope.dispose();
});

test("stats satellite replaces a status request when identity changes", async () => {
  const socket = createStatsSocket({ connected: true });
  const scope = createResourceScope("stats-status-identity-replacement-test");
  const feature = createStatsFeature({ ports: { realtime: socket }, scope });
  feature.configureRealtime({ installId: "user:old", socket });
  feature.start();

  const oldRequest = feature.requestVocabCount();
  const nextRequest = feature.requestVocabCount({
    installId: "user:new",
    socket,
  });
  assert.notStrictEqual(nextRequest, oldRequest);
  assert.equal(await oldRequest, null);
  assert.equal(socket.emissions.length, 2);

  socket.emissions[0].acknowledge({ count: 999, weeklyCount: 999 });
  assert.equal(feature.store.getState().vocabCount, null);
  socket.emissions[1].acknowledge({ count: 20, weeklyCount: 9 });
  assert.deepEqual(await nextRequest, { count: 20, weeklyCount: 9 });
  assert.equal(feature.store.getState().vocabCount, 20);
  scope.dispose();
});

test("stats satellite deduplicates and safely replaces weekly requests", async () => {
  const requests = [];
  const timers = createTimerHarness();
  const scope = createResourceScope("stats-weekly-replacement-test");
  const feature = createStatsFeature(
    { ports: {}, scope },
    {
      clearTimeoutFn: timers.clearTimeoutFn,
      fetchImpl(url, options) {
        const deferred = createDeferred();
        requests.push({ deferred, options, url });
        return deferred.promise;
      },
      now: () => 1000,
      setTimeoutFn: timers.setTimeoutFn,
    }
  );
  feature.start();

  const firstRequest = feature.fetchWeekly(false, 20);
  const duplicateRequest = feature.fetchWeekly(true, 20);
  assert.strictEqual(duplicateRequest, firstRequest);
  assert.equal(requests.length, 1);
  assert.equal(feature.store.getState().loading, true);

  const replacementRequest = feature.fetchWeekly(true, 500);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.signal.aborted, true);
  assert.equal(requests[1].url, "/api/stats/weekly?topN=200");

  requests[0].deferred.resolve(createJsonResponse({ marker: "stale" }));
  await firstRequest;
  assert.equal(feature.store.getState().stats, null);

  requests[1].deferred.resolve(createJsonResponse({ marker: "fresh", topN: 200 }));
  assert.deepEqual(await replacementRequest, { marker: "fresh", topN: 200 });
  assert.deepEqual(feature.store.getState().stats, {
    marker: "fresh",
    topN: 200,
  });
  assert.equal(feature.store.getState().loading, true);

  timers.runDelay(220);
  assert.equal(feature.store.getState().loading, false);
  scope.dispose();
  assert.equal(timers.timers.size, 0);
});

test("stats satellite owns weekly timeout, retry window and cleanup", async () => {
  let clock = 1000;
  let requestCount = 0;
  const timers = createTimerHarness();
  const scope = createResourceScope("stats-weekly-timeout-test");
  const feature = createStatsFeature(
    { ports: {}, scope },
    {
      clearTimeoutFn: timers.clearTimeoutFn,
      fetchImpl(_url, { signal }) {
        requestCount += 1;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
      now: () => clock,
      setTimeoutFn: timers.setTimeoutFn,
    }
  );
  feature.start();

  const timedOutRequest = feature.fetchWeekly(false, 40);
  clock = 7500;
  timers.runDelay(6500);
  assert.equal(await timedOutRequest, null);
  assert.equal(feature.store.getState().error, "timeout");
  assert.equal(feature.store.getState().loading, true);
  timers.runDelay(0);
  assert.equal(feature.store.getState().loading, false);

  assert.equal(feature.fetchWeekly(true, 40), null);
  assert.equal(requestCount, 1);
  clock = 10000;
  feature.fetchWeekly(true, 40);
  assert.equal(requestCount, 2);
  assert.equal(feature.store.getState().loading, true);

  scope.dispose();
  await Promise.resolve();
  assert.equal(timers.timers.size, 0);
  assert.deepEqual(feature.store.getState(), createInitialStatsState());
});

test("stats satellite owns scoped trophy updates and socket cleanup", () => {
  const handlers = new Map();
  const socket = {
    bind(nextHandlers) {
      for (const [eventName, handler] of Object.entries(nextHandlers)) {
        handlers.set(eventName, handler);
      }
      return () => {
        for (const [eventName, handler] of Object.entries(nextHandlers)) {
          if (handlers.get(eventName) === handler) handlers.delete(eventName);
        }
      };
    },
    fire(eventName, payload) {
      handlers.get(eventName)?.(payload);
    },
  };
  const scope = createResourceScope("stats-realtime-test");
  const feature = createStatsFeature(
    { ports: { realtime: socket }, scope },
    { now: () => 1234 }
  );
  const phaseLoopTestEnabledRef = { current: false };
  const liveSessionReadyRef = { current: true };
  feature.configureRealtime({
    appViewRef: { current: "live" },
    currentRoomIdRef: { current: "room-1" },
    gameplaySession: {
      acceptsEvent: ({ roomId }) => !roomId || roomId === "room-1",
    },
    installIdRef: { current: "install-self" },
    isLoggedInRef: { current: true },
    liveSessionReadyRef,
    phaseLoopTestEnabledRef,
    socket,
    standaloneTrainingSessionRef: { current: null },
  });
  feature.start();

  assert.deepEqual([...handlers.keys()], ["trophiesUpdated"]);

  socket.fire("trophiesUpdated", {
    roomId: "room-2",
    tournamentId: "tournament-ignored",
    updates: [
      {
        delta: 99,
        installId: "install-self",
        league: "or",
        newTrophies: 999,
      },
    ],
  });
  assert.equal(feature.store.getState().trophyStatus, null);

  socket.fire("trophiesUpdated", {
    roomId: "room-1",
    tournamentId: "tournament-1",
    updates: [
      {
        delta: 3,
        installId: "install-other",
        league: "argent",
        newTrophies: 20,
      },
      {
        delta: 5,
        installId: "install-self",
        league: "or",
        newTrophies: 42,
        progress: { current: 2, target: 10 },
        shieldCount: 1,
        shieldFloor: 30,
      },
    ],
  });
  assert.deepEqual(feature.store.getState().trophyStatus, {
    lastDelta: 5,
    lastTournamentId: "tournament-1",
    league: "or",
    progress: { current: 2, target: 10 },
    shieldCount: 1,
    shieldFloor: 30,
    trophies: 42,
    updatedAt: 1234,
  });
  assert.deepEqual(feature.store.getState().trophyHistory, [
    {
      delta: 5,
      league: "or",
      tournamentId: "tournament-1",
      trophies: 42,
      ts: 1234,
    },
  ]);

  liveSessionReadyRef.current = false;
  socket.fire("trophiesUpdated", {
    roomId: "room-1",
    updates: [
      {
        delta: 100,
        installId: "install-self",
        newTrophies: 142,
      },
    ],
  });
  assert.equal(feature.store.getState().trophyStatus.trophies, 42);
  liveSessionReadyRef.current = true;

  phaseLoopTestEnabledRef.current = true;
  socket.fire("trophiesUpdated", {
    roomId: "room-1",
    updates: [
      {
        delta: 100,
        installId: "install-self",
        newTrophies: 142,
      },
    ],
  });
  assert.equal(feature.store.getState().trophyStatus.trophies, 42);

  scope.dispose();
  assert.equal(handlers.size, 0);
  assert.deepEqual(feature.store.getState(), createInitialStatsState());
});
