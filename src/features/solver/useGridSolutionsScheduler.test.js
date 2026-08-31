import test from "node:test";
import assert from "node:assert/strict";

import { createGridSolutionsScheduler } from "./useGridSolutionsScheduler.js";

function createTimerHarness() {
  let nextId = 1;
  const timers = new Map();
  return {
    clear(timerId) {
      timers.delete(timerId);
    },
    fireNext() {
      const [timerId, timer] = timers.entries().next().value || [];
      assert.ok(timerId);
      timers.delete(timerId);
      timer.callback();
      return timer;
    },
    schedule(callback, delayMs) {
      const timerId = nextId;
      nextId += 1;
      timers.set(timerId, { callback, delayMs });
      return timerId;
    },
    timers,
  };
}

test("grid solver scheduler preserves kickoff and non-idle fallback delays", async () => {
  const timerHarness = createTimerHarness();
  const events = [];
  const scheduler = createGridSolutionsScheduler({
    cancelIdle: null,
    clearScheduledTimeout: timerHarness.clear,
    disposeWorker: () => {},
    requestIdle: null,
    scheduleTimeout: timerHarness.schedule,
    solve: async () => ["worker-result"],
  });

  scheduler.schedule({
    board: [{ letter: "A" }],
    delayMs: 120,
    jobKey: "round-1",
    onComplete: (solutions) => events.push(["complete", solutions]),
    onStart: () => events.push(["start"]),
    onWorkerResult: (solutions) => solutions,
  });

  assert.equal(timerHarness.fireNext().delayMs, 120);
  assert.equal(timerHarness.fireNext().delayMs, 600);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, [["start"], ["complete", ["worker-result"]]]);
  assert.equal(scheduler.hasActiveJob(), true);
});

test("a stale worker response cannot commit or trigger the main-thread fallback", async () => {
  const timerHarness = createTimerHarness();
  const pending = [];
  const events = [];
  const scheduler = createGridSolutionsScheduler({
    clearScheduledTimeout: timerHarness.clear,
    disposeWorker: () => {},
    requestIdle: null,
    scheduleTimeout: timerHarness.schedule,
    solve: () =>
      new Promise((resolve, reject) => {
        pending.push({ reject, resolve });
      }),
  });

  const createJob = (jobKey) => ({
    board: [{ letter: "A" }],
    delayMs: 0,
    jobKey,
    onComplete: () => events.push(`${jobKey}:complete`),
    onFallback: () => events.push(`${jobKey}:fallback`),
    onWorkerResult: (solutions) => solutions,
  });
  scheduler.schedule(createJob("round-1"));
  timerHarness.fireNext();
  timerHarness.fireNext();
  scheduler.schedule(createJob("round-2"));
  pending[0].reject(new Error("cancelled worker"));
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(events, []);
  assert.equal(scheduler.hasActiveJob(), true);
});

test("idle scheduling is cancellable and keeps the worker timeout window", () => {
  const timerHarness = createTimerHarness();
  const idleRequests = new Map();
  const cancelledIdle = [];
  const scheduler = createGridSolutionsScheduler({
    cancelIdle: (requestId) => {
      cancelledIdle.push(requestId);
      idleRequests.delete(requestId);
    },
    clearScheduledTimeout: timerHarness.clear,
    disposeWorker: () => {},
    requestIdle: (callback, options) => {
      idleRequests.set(41, { callback, options });
      return 41;
    },
    scheduleTimeout: timerHarness.schedule,
    solve: async () => [],
  });

  scheduler.schedule({ board: [{ letter: "A" }], delayMs: 0, jobKey: "round-1" });
  timerHarness.fireNext();
  assert.equal(idleRequests.get(41).options.timeout, 15000);
  scheduler.cancel();
  assert.deepEqual(cancelledIdle, [41]);
  assert.equal(idleRequests.size, 0);
});

test("current worker failures use fallback and disposal clears scheduled work", async () => {
  const timerHarness = createTimerHarness();
  const events = [];
  const disposed = [];
  const scheduler = createGridSolutionsScheduler({
    clearScheduledTimeout: timerHarness.clear,
    disposeWorker: (reason) => disposed.push(reason),
    requestIdle: null,
    scheduleTimeout: timerHarness.schedule,
    solve: async () => {
      throw new Error("worker unavailable");
    },
  });

  scheduler.schedule({
    board: [{ letter: "A" }],
    delayMs: 0,
    jobKey: "round-1",
    onComplete: (solutions) => events.push(["complete", solutions]),
    onFallback: () => ["fallback-result"],
    onWorkerError: (error) => events.push(["error", error.message]),
  });
  timerHarness.fireNext();
  timerHarness.fireNext();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, [
    ["error", "worker unavailable"],
    ["complete", ["fallback-result"]],
  ]);

  scheduler.schedule({ board: [{ letter: "B" }], jobKey: "round-2" });
  scheduler.dispose("test_dispose");
  assert.equal(timerHarness.timers.size, 0);
  assert.equal(scheduler.hasActiveJob(), false);
  assert.deepEqual(disposed, ["test_dispose"]);
});
