import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createDailyFeature } from "./createDailyFeature.js";

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
