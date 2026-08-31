import test from "node:test";
import assert from "node:assert/strict";

import {
  createPhaseLoopController,
  readPhaseLoopTestEnabled,
} from "./usePhaseLoopController.js";

function createHarness() {
  let nextTimerId = 1;
  const timers = new Map();
  const cleared = [];
  const events = [];
  let view = "live";
  let wallNow = 50_000;
  const controller = createPhaseLoopController({
    clearScheduledTimeout: (timerId) => {
      cleared.push(timerId);
      timers.delete(timerId);
    },
    getWallNowMs: () => wallNow,
    scheduleTimeout: (callback, delayMs) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, { callback, delayMs });
      return timerId;
    },
  });
  controller.configure({
    createGrid: (size) => Array.from({ length: size * size }, (_, index) => index),
    fallbackGridSize: 4,
    getCurrentView: () => view,
    getNowServerMs: () => 10_000,
    getSourceRoomId: () => "room-5x5",
    onEnterResults: (payload) => events.push({ name: "results", payload }),
    onStartRound: (payload) => events.push({ name: "start", payload }),
    resolveGridSize: () => 5,
    stopRoundEffects: () => events.push({ name: "stop-effects" }),
    timings: {
      introMs: 7_000,
      playingGuardMs: 250,
      playingMs: 10_000,
      resultsMs: 10_000,
    },
  });

  return {
    cleared,
    controller,
    events,
    fireNextTimer() {
      const [timerId, timer] = timers.entries().next().value || [];
      assert.ok(timerId);
      timers.delete(timerId);
      timer.callback();
      return timer;
    },
    setView(nextView) {
      view = nextView;
    },
    setWallNow(nextNow) {
      wallNow = nextNow;
    },
    timers,
  };
}

test("phase loop query accepts only explicit enabled values", () => {
  assert.equal(readPhaseLoopTestEnabled("?phaseLoop=1"), true);
  assert.equal(readPhaseLoopTestEnabled("?phaseLoop=TRUE"), true);
  assert.equal(readPhaseLoopTestEnabled("?phaseLoop=on"), true);
  assert.equal(readPhaseLoopTestEnabled("?phaseLoop=0"), false);
  assert.equal(readPhaseLoopTestEnabled("?other=1"), false);
});

test("phase loop controller owns results, intro, playing and cleanup timing", () => {
  const harness = createHarness();
  harness.controller.start();

  assert.deepEqual(harness.events.map((entry) => entry.name), ["stop-effects", "results"]);
  assert.equal(harness.events[1].payload.nextStartAt, 60_000);
  assert.equal(harness.timers.size, 1);
  assert.equal(harness.fireNextTimer().delayMs, 10_000);

  const startEvent = harness.events.at(-1);
  assert.equal(startEvent.name, "start");
  assert.equal(startEvent.payload.roundId, "phase-loop-1-50000");
  assert.equal(startEvent.payload.startsAt, 17_000);
  assert.equal(startEvent.payload.endsAt, 27_250);
  assert.equal(startEvent.payload.gridSize, 5);
  assert.equal(startEvent.payload.grid.length, 25);
  assert.equal(harness.fireNextTimer().delayMs, 17_000);
  assert.equal(harness.events.at(-1).name, "results");

  harness.controller.stop();
  assert.equal(harness.timers.size, 0);
});

test("phase loop drops a scheduled transition after leaving live view", () => {
  const harness = createHarness();
  harness.controller.start();
  harness.setView("home");
  harness.fireNextTimer();

  assert.deepEqual(harness.events.map((entry) => entry.name), ["stop-effects", "results"]);
  assert.equal(harness.timers.size, 0);
});

test("restarting the loop clears the previous timer and resets round numbering", () => {
  const harness = createHarness();
  harness.controller.start();
  harness.fireNextTimer();
  assert.equal(harness.events.at(-1).payload.roundId, "phase-loop-1-50000");

  harness.setWallNow(75_000);
  harness.controller.start();
  assert.ok(harness.cleared.length > 0);
  harness.fireNextTimer();
  assert.equal(harness.events.at(-1).payload.roundId, "phase-loop-1-75000");
});
