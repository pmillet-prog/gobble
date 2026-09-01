import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import {
  createDailyFeature,
  createInitialDailyState,
} from "./createDailyFeature.js";

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
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

function createSocket({ connected = false } = {}) {
  const handlers = new Map();
  const emissions = [];
  return {
    connected,
    emissions,
    fire(eventName, payload) {
      handlers.get(eventName)?.(payload);
    },
    handlers,
    emit(eventName, payload, acknowledge) {
      emissions.push({ acknowledge, eventName, payload });
    },
    off(eventName, handler) {
      if (handlers.get(eventName) === handler) handlers.delete(eventName);
    },
    once(eventName, handler) {
      handlers.set(eventName, handler);
    },
  };
}

test("daily satellite loads status and forwards its duel snapshot", async () => {
  const calls = [];
  const duelSnapshots = [];
  const scope = createResourceScope("daily-status-http-test");
  const feature = createDailyFeature(
    { ports: {}, scope },
    {
      fetchImpl(url, options) {
        calls.push({ options, url });
        return Promise.resolve(
          jsonResponse({
            champion: { nick: "Tigre" },
            dateId: "2026-09-01",
            duel: { team: "red", weekId: "2026-W36" },
            hasPlayed: true,
            maintenanceMode: true,
            maintenanceMessage: "Pause",
            ready: true,
          })
        );
      },
    }
  );
  feature.start();

  const data = await feature.fetchDailyStatus({
    installId: "user:11",
    onDuelStatus: (duel) => duelSnapshots.push(duel),
  });
  assert.equal(calls[0].url, "/api/daily/status?installId=user%3A11");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(data.dateId, "2026-09-01");
  assert.deepEqual(duelSnapshots, [{ team: "red", weekId: "2026-W36" }]);
  assert.deepEqual(feature.store.getState().status, {
    champion: { nick: "Tigre" },
    dateId: "2026-09-01",
    error: "",
    hasPlayed: true,
    hasPlayedFakeTwins: false,
    hasPlayedMonstrous: false,
    hasPlayedSpecial: false,
    loading: false,
    maintenanceMode: true,
    maintenanceMessage: "Pause",
    myFakeTwinsResult: null,
    myMonstrousResult: null,
    myResult: null,
    mySpecialResult: null,
    ready: true,
  });
  scope.dispose();
});

test("daily satellite replaces a dated board request and ignores stale data", async () => {
  const calls = [];
  const scope = createResourceScope("daily-board-replacement-test");
  const feature = createDailyFeature(
    { ports: {}, scope },
    {
      fetchImpl(url, options) {
        const deferred = createDeferred();
        calls.push({ deferred, options, url });
        return deferred.promise;
      },
    }
  );
  feature.start();

  const firstRequest = feature.fetchDailyBoard({ dateId: "2026-08-31" });
  const nextRequest = feature.fetchDailyBoard({ dateId: "2026-09-01" });
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(await firstRequest, null);

  calls[0].deferred.resolve(
    jsonResponse({ dateId: "2026-08-31", entries: [{ nick: "Ancien" }] })
  );
  await Promise.resolve();
  assert.equal(feature.store.getState().board.loading, true);
  calls[1].deferred.resolve(
    jsonResponse({
      battle: { active: true },
      dateId: "2026-09-01",
      entries: [{ nick: "Nouveau" }],
      ready: true,
    })
  );
  assert.deepEqual(await nextRequest, {
    battle: { active: true },
    dateId: "2026-09-01",
    entries: [{ nick: "Nouveau" }],
    error: "",
    loading: false,
    ready: true,
  });
  assert.equal(feature.store.getState().board.entries[0].nick, "Nouveau");
  scope.dispose();
});

test("daily satellite deduplicates history and preserves legacy medal totals", async () => {
  const responses = [
    jsonResponse({
      days: [{ dateId: "2026-09-01" }],
      medalTotals: [
        { gold: 3, nick: "A" },
        { nick: "B" },
      ],
    }),
    jsonResponse({ error: "failed" }, { ok: false, status: 500 }),
  ];
  let requestCount = 0;
  const scope = createResourceScope("daily-history-http-test");
  const feature = createDailyFeature(
    { ports: {}, scope },
    {
      fetchImpl() {
        requestCount += 1;
        return Promise.resolve(responses.shift());
      },
    }
  );
  feature.start();

  const firstRequest = feature.fetchDailyHistory({ days: 10, installId: "user:12" });
  assert.strictEqual(
    feature.fetchDailyHistory({ days: 30, installId: "user:12" }),
    firstRequest
  );
  assert.deepEqual(await firstRequest, {
    crownTotals: [
      { crowns: 3, nick: "A" },
      { crowns: 0, nick: "B" },
    ],
    days: [{ dateId: "2026-09-01" }],
  });
  assert.equal(requestCount, 1);

  assert.equal(
    await feature.fetchDailyHistory({ days: 10, installId: "user:12" }),
    null
  );
  assert.deepEqual(feature.store.getState().history, {
    crownTotals: [],
    days: [],
  });
  assert.equal(feature.store.getState().historyError, "erreur");
  assert.equal(feature.store.getState().historyLoading, false);
  scope.dispose();
  assert.deepEqual(feature.store.getState(), createInitialDailyState());
});

test("daily satellite owns successful socket ACK timing", async () => {
  const socket = createSocket({ connected: true });
  const timers = createTimerHarness();
  const scope = createResourceScope("daily-ack-success-test");
  const feature = createDailyFeature(
    { ports: { realtime: socket }, scope },
    {
      clearTimeoutFn: timers.clearTimeoutFn,
      setTimeoutFn: timers.setTimeoutFn,
    }
  );
  feature.start();
  feature.configureTransport({ socket });

  const request = feature.emitSocketAck(
    "daily:start",
    { installId: "user:1" },
    { timeoutMs: 7000 }
  );
  assert.equal(socket.emissions.length, 1);
  assert.deepEqual(socket.emissions[0].payload, { installId: "user:1" });
  assert.equal([...timers.timers.values()][0].delayMs, 7000);

  socket.emissions[0].acknowledge({ ok: true, sessionId: "daily-1" });
  assert.deepEqual(await request, { ok: true, sessionId: "daily-1" });
  assert.equal(timers.timers.size, 0);
  scope.dispose();
});

test("daily satellite rejects a timed out ACK and ignores its late response", async () => {
  const socket = createSocket({ connected: true });
  const timers = createTimerHarness();
  const scope = createResourceScope("daily-ack-timeout-test");
  const feature = createDailyFeature(
    { ports: { realtime: socket }, scope },
    {
      clearTimeoutFn: timers.clearTimeoutFn,
      setTimeoutFn: timers.setTimeoutFn,
    }
  );
  feature.start();

  const request = feature.emitSocketAck("daily:submit", { score: 12 });
  const rejected = assert.rejects(request, { message: "timeout" });
  timers.runDelay(6500);
  await rejected;
  assert.equal(timers.timers.size, 0);
  socket.emissions[0].acknowledge({ ok: true });
  scope.dispose();
});

test("daily satellite cleans a deferred connection request on disposal", async () => {
  let connectionAttempts = 0;
  const socket = createSocket();
  const timers = createTimerHarness();
  const scope = createResourceScope("daily-ack-cleanup-test");
  const feature = createDailyFeature(
    { ports: { realtime: socket }, scope },
    {
      clearTimeoutFn: timers.clearTimeoutFn,
      setTimeoutFn: timers.setTimeoutFn,
    }
  );
  feature.start();
  feature.configureTransport({
    ensureConnection() {
      connectionAttempts += 1;
    },
    socket,
  });

  const request = feature.emitSocketAck("daily:start", {});
  assert.equal(connectionAttempts, 1);
  assert.deepEqual([...socket.handlers.keys()].sort(), ["connect", "connect_error"]);
  assert.equal(timers.timers.size, 0);

  socket.connected = true;
  socket.fire("connect");
  assert.equal(socket.emissions.length, 1);
  assert.equal(socket.handlers.size, 0);
  assert.equal(timers.timers.size, 1);

  const rejected = assert.rejects(request, { message: "cancelled" });
  scope.dispose();
  await rejected;
  assert.equal(socket.handlers.size, 0);
  assert.equal(timers.timers.size, 0);
});
