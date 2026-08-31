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
