import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createRoundClockFeature } from "./createRoundClockFeature.js";

function createEventTarget() {
  const listeners = new Map();
  return {
    visibilityState: "visible",
    addEventListener(event, listener) {
      const bucket = listeners.get(event) || new Set();
      bucket.add(listener);
      listeners.set(event, bucket);
    },
    removeEventListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    emit(event) {
      for (const listener of listeners.get(event) || []) listener();
    },
    listenerCount(event) {
      return listeners.get(event)?.size || 0;
    },
  };
}

test("round clock state is owned outside React and stops cleanly", () => {
  const scope = createResourceScope("clock-test");
  const feature = createRoundClockFeature({ scope });
  feature.start();
  feature.setCountdown(3);
  assert.deepEqual(feature.store.getState(), {
    deadlineMonotonicMs: null,
    maxSeconds: 0,
    remainingSeconds: 3,
    running: false,
  });
  scope.dispose();
  assert.equal(feature.store.getState().remainingSeconds, 0);
});

test("round clock refreshes immediately when a suspended tab returns", () => {
  const timers = new Map();
  const documentTarget = createEventTarget();
  const windowTarget = createEventTarget();
  const scope = createResourceScope("clock-foreground-test");
  let nextTimerId = 1;
  let nowMs = 1_000;
  let expirations = 0;
  const feature = createRoundClockFeature(
    { scope },
    {
      clearTimeoutFn: (id) => timers.delete(id),
      documentTarget,
      getNowMs: () => nowMs,
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timers.set(id, { callback, delayMs });
        return id;
      },
      windowTarget,
    }
  );
  feature.start();
  feature.onExpired(() => {
    expirations += 1;
  });
  feature.startRound({
    deadlineServerMs: 105_000,
    maxSeconds: 5,
    serverNowMs: 100_000,
  });

  assert.equal(feature.store.getState().remainingSeconds, 5);
  assert.equal(timers.size, 1);

  nowMs = 4_001;
  documentTarget.emit("visibilitychange");
  assert.equal(feature.store.getState().remainingSeconds, 2);
  assert.equal(timers.size, 1);

  nowMs = 6_000;
  windowTarget.emit("focus");
  windowTarget.emit("pageshow");
  assert.equal(feature.store.getState().remainingSeconds, 0);
  assert.equal(feature.store.getState().running, false);
  assert.equal(expirations, 1);
  assert.equal(timers.size, 0);

  scope.dispose();
  assert.equal(documentTarget.listenerCount("visibilitychange"), 0);
  assert.equal(windowTarget.listenerCount("focus"), 0);
  assert.equal(windowTarget.listenerCount("pageshow"), 0);
});

test("priming an authoritative same-round snapshot keeps the clock running", () => {
  const timers = new Map();
  const scope = createResourceScope("clock-snapshot-test");
  let nextTimerId = 1;
  let nowMs = 1_000;
  const feature = createRoundClockFeature(
    { scope },
    {
      clearTimeoutFn: (id) => timers.delete(id),
      getNowMs: () => nowMs,
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timers.set(id, { callback, delayMs });
        return id;
      },
    }
  );
  feature.start();
  feature.startRound({
    deadlineServerMs: 110_000,
    maxSeconds: 10,
    serverNowMs: 100_000,
  });
  const scheduledTimerId = [...timers.keys()][0];

  feature.primeRemaining(8);

  assert.equal(feature.store.getState().remainingSeconds, 8);
  assert.equal(feature.store.getState().running, true);
  assert.equal(timers.has(scheduledTimerId), true);
  assert.equal(timers.size, 1);

  nowMs = 3_001;
  timers.get(scheduledTimerId).callback();
  assert.equal(feature.store.getState().remainingSeconds, 8);
  assert.equal(feature.store.getState().running, true);
  assert.equal(timers.size, 1);
  scope.dispose();
});
