import test from "node:test";
import assert from "node:assert/strict";

import { createRoundFinalizationGate } from "./useRoundFinalizationGate.js";

function createHarness({ pendingDrag = false, sessionToken = 4 } = {}) {
  let nextTimerId = 1;
  const timers = new Map();
  const cleared = [];
  const finalized = [];
  const sessionTokenRef = { current: sessionToken };
  const gate = createRoundFinalizationGate({
    clearScheduledTimeout: (timerId) => {
      cleared.push(timerId);
      timers.delete(timerId);
    },
    scheduleTimeout: (callback, delayMs) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, { callback, delayMs });
      return timerId;
    },
  });
  gate.configure({
    flushPendingDragMove: () => pendingDrag,
    onFinalize: (token) => finalized.push(token),
    sessionTokenRef,
  });
  return {
    cleared,
    finalized,
    gate,
    sessionTokenRef,
    timers,
  };
}

test("round finalization completes immediately when no drag move is pending", () => {
  const harness = createHarness();
  assert.equal(harness.gate.request(4), "completed");
  assert.deepEqual(harness.finalized, [4]);
  assert.equal(harness.timers.size, 0);
});

test("pending drag finalization is deferred and guarded by session generation", () => {
  const harness = createHarness({ pendingDrag: true });
  assert.equal(harness.gate.request(4), "deferred");
  const timer = harness.timers.values().next().value;
  assert.equal(timer.delayMs, 0);
  harness.sessionTokenRef.current = 5;
  timer.callback();
  assert.deepEqual(harness.finalized, []);
});

test("a repeated request replaces the previous deferred finalization", () => {
  const harness = createHarness({ pendingDrag: true });
  harness.gate.request(4);
  harness.gate.request(4);
  assert.deepEqual(harness.cleared, [1]);
  assert.equal(harness.timers.size, 1);

  harness.gate.cancel();
  assert.deepEqual(harness.cleared, [1, 2]);
  assert.equal(harness.timers.size, 0);
});
