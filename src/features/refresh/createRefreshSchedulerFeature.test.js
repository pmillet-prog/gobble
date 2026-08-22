import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createRefreshSchedulerFeature } from "./createRefreshSchedulerFeature.js";

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

test("refresh scheduler owns intervals and foreground listeners", () => {
  const intervals = new Map();
  const windowTarget = createEventTarget();
  const documentTarget = createEventTarget();
  const scope = createResourceScope("refresh-test");
  let nextIntervalId = 1;
  let runs = 0;
  const feature = createRefreshSchedulerFeature(
    { scope },
    {
      clearIntervalFn: (id) => intervals.delete(id),
      documentTarget,
      setIntervalFn: (callback) => {
        const id = nextIntervalId++;
        intervals.set(id, callback);
        return id;
      },
      windowTarget,
    }
  );
  feature.start();
  feature.schedule("theme", {
    intervalMs: 120000,
    onFocus: true,
    onVisible: true,
    run: () => {
      runs += 1;
    },
  });
  assert.equal(runs, 1);
  assert.equal(intervals.size, 1);
  windowTarget.emit("focus");
  documentTarget.emit("visibilitychange");
  assert.equal(runs, 3);

  feature.schedule("theme", { enabled: false, run: () => {} });
  assert.equal(intervals.size, 0);
  assert.equal(windowTarget.listenerCount("focus"), 0);
  assert.equal(documentTarget.listenerCount("visibilitychange"), 0);

  feature.schedule("lobby", { intervalMs: 6000, run: () => {} });
  scope.dispose();
  assert.equal(intervals.size, 0);
});

