import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createConnectionHealthFeature } from "./createConnectionHealthFeature.js";

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

test("connection health owns foreground listeners, retry and watchdog timers", () => {
  const documentTarget = createEventTarget();
  const windowTarget = createEventTarget();
  const intervals = new Map();
  const timeouts = new Map();
  const foregroundReasons = [];
  const healthReasons = [];
  const kernel = createApplicationKernel();
  const scope = createResourceScope("connection-health-test");
  let connected = false;
  let nextTimerId = 1;
  let pageShow = null;
  const feature = createConnectionHealthFeature(
    { getKernel: () => kernel, scope },
    {
      clearIntervalFn: (id) => intervals.delete(id),
      clearTimeoutFn: (id) => timeouts.delete(id),
      documentTarget,
      now: () => 1234,
      setIntervalFn: (callback, delayMs) => {
        const id = nextTimerId++;
        intervals.set(id, { callback, delayMs });
        return id;
      },
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timeouts.set(id, { callback, delayMs });
        return id;
      },
      windowTarget,
    }
  );
  feature.configure({
    isConnected: () => connected,
    onForeground: (reason) => foregroundReasons.push(reason),
    onHealthCheck: (reason) => healthReasons.push(reason),
    subscribePageShow: (listener) => {
      pageShow = listener;
      return () => {
        pageShow = null;
      };
    },
  });
  feature.start();

  assert.equal(intervals.size, 0);
  kernel.commands.session.setIsLoggedIn(true);
  assert.deepEqual([...intervals.values()].map((timer) => timer.delayMs), [5500]);
  kernel.commands.game.setPhase("playing");
  assert.deepEqual(
    [...intervals.values()].map((timer) => timer.delayMs).sort((a, b) => a - b),
    [5500, 15000]
  );

  documentTarget.visibilityState = "hidden";
  documentTarget.emit("visibilitychange");
  assert.equal(feature.refs.backgrounded.current, true);
  assert.equal(feature.refs.lastBackgroundAt.current, 1234);
  documentTarget.visibilityState = "visible";
  documentTarget.emit("visibilitychange");
  assert.equal(feature.refs.backgrounded.current, false);
  assert.equal(foregroundReasons.at(-1), "visibility");
  assert.equal([...timeouts.values()][0].delayMs, 1400);

  pageShow();
  assert.equal(foregroundReasons.at(-1), "pageshow");
  assert.equal([...timeouts.values()][0].delayMs, 1200);
  windowTarget.emit("pointerdown");
  assert.equal(foregroundReasons.at(-1), "interaction");

  const watchdog = [...intervals.values()].find((timer) => timer.delayMs === 15000);
  watchdog.callback();
  assert.deepEqual(healthReasons, ["watchdog_playing"]);
  feature.configure({ standaloneTrainingActive: true });
  assert.equal(
    [...intervals.values()].some((timer) => timer.delayMs === 15000),
    false
  );

  connected = true;
  const retry = [...intervals.values()].find((timer) => timer.delayMs === 5500);
  retry.callback();
  assert.notEqual(foregroundReasons.at(-1), "retry_timer");
  scope.dispose();
  assert.equal(intervals.size, 0);
  assert.equal(timeouts.size, 0);
  assert.equal(windowTarget.listenerCount("focus"), 0);
  assert.equal(documentTarget.listenerCount("visibilitychange"), 0);
  assert.equal(pageShow, null);
});
