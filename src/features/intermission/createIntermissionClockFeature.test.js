import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createIntermissionClockFeature } from "./createIntermissionClockFeature.js";

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
  };
}

test("intermission clock owns its timer and clears retained countdown state", () => {
  const scope = createResourceScope("intermission-test");
  const feature = createIntermissionClockFeature({ scope });
  feature.start();
  const serverNowMs = Date.now();
  feature.startCountdown({ deadlineServerMs: serverNowMs + 5000, serverNowMs });
  assert.equal(feature.store.getState().remainingSeconds, 5);
  assert.equal(feature.store.getState().running, true);
  scope.dispose();
  assert.deepEqual(feature.store.getState(), {
    deadlineMonotonicMs: null,
    remainingSeconds: null,
    running: false,
  });
});

test("intermission countdown catches up when the tab becomes visible", () => {
  const timers = new Map();
  const documentTarget = createEventTarget();
  const windowTarget = createEventTarget();
  const scope = createResourceScope("intermission-foreground-test");
  let nextTimerId = 1;
  let nowMs = 10_000;
  const feature = createIntermissionClockFeature(
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
  feature.startCountdown({ deadlineServerMs: 205_000, serverNowMs: 200_000 });
  assert.equal(feature.store.getState().remainingSeconds, 5);

  nowMs = 14_100;
  documentTarget.emit("visibilitychange");
  assert.equal(feature.store.getState().remainingSeconds, 1);
  assert.equal(timers.size, 1);

  scope.dispose();
  assert.equal(timers.size, 0);
});
