import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createResultsFeature } from "./createResultsFeature.js";
import {
  createServerClockState,
  readServerClockMs,
  updateServerClockFromSample,
} from "../../utils/realtimeClock.js";

test("results satellite owns preparation and mobile fade timers with exact delays", () => {
  const timers = new Map();
  let nextTimerId = 1;
  const scope = createResourceScope("test:results-timing");
  const feature = createResultsFeature(
    { scope },
    {
      clearTimeoutFn: (id) => timers.delete(id),
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timers.set(id, {
          callback: () => {
            timers.delete(id);
            callback();
          },
          delayMs,
        });
        return id;
      },
      wallNow: () => 77,
    }
  );
  feature.start();
  feature.configureTiming({
    breakKind: "round_end",
    fadeDurationMs: 300,
    isMobileLayout: true,
    nextStartAt: 2000,
    nowServerMs: () => 1000,
    phase: "results",
    preparationGraceMs: 150,
  });

  const scheduled = [...timers.values()].sort((left, right) => left.delayMs - right.delayMs);
  assert.deepEqual(
    scheduled.map((timer) => timer.delayMs),
    [700, 1160]
  );
  assert.equal(feature.store.getState().mobileOutroFadeActive, false);
  assert.equal(feature.store.getState().roundStartDelayed, false);
  scheduled[0].callback();
  assert.equal(feature.store.getState().mobileOutroFadeActive, true);
  scheduled[1].callback();
  assert.equal(feature.store.getState().roundStartDelayTick, 77);
  assert.equal(feature.store.getState().roundStartDelayed, true);

  feature.configureTiming({
    breakKind: null,
    fadeDurationMs: 300,
    isMobileLayout: true,
    nextStartAt: null,
    nowServerMs: () => 1000,
    phase: "lobby",
    preparationGraceMs: 150,
  });
  assert.equal(feature.store.getState().mobileOutroFadeActive, false);
  assert.equal(feature.store.getState().roundStartDelayed, false);
  assert.equal(timers.size, 0);
  scope.dispose();
});

function createTimingHarness() {
  const timers = new Map();
  let nextTimerId = 1;
  const scope = createResourceScope("test:results-fade-lifecycle");
  const feature = createResultsFeature({ scope }, {
    clearTimeoutFn: (id) => timers.delete(id),
    setTimeoutFn: (callback, delayMs) => {
      const id = nextTimerId++;
      timers.set(id, { callback, delayMs });
      return id;
    },
    wallNow: () => 77,
  });
  feature.start();
  const fadeTransitions = [feature.store.getState().mobileOutroFadeActive];
  feature.store.subscribe(() => {
    const active = feature.store.getState().mobileOutroFadeActive;
    if (active !== fadeTransitions.at(-1)) fadeTransitions.push(active);
  });

  return {
    feature,
    timers,
    scope,
    fadeTransitions,
    configure(overrides = {}) {
      feature.configureTiming({
        breakKind: "round_end",
        fadeDurationMs: 300,
        isMobileLayout: true,
        nextStartAt: 2000,
        nowServerMs: () => 1000,
        phase: "results",
        preparationGraceMs: 150,
        roundId: "round-1",
        ...overrides,
      });
    },
    fireTimerWithDelay(delayMs) {
      const match = [...timers].find(([, timer]) => timer.delayMs === delayMs);
      assert.ok(match, `expected timer after ${delayMs}ms`);
      const [id, timer] = match;
      timers.delete(id);
      timer.callback();
    },
  };
}

test("a later deadline preserves the started fade while rescheduling preparation", () => {
  const runtime = createTimingHarness();
  runtime.configure();
  runtime.fireTimerWithDelay(700);
  runtime.configure({ nextStartAt: 2200, nowServerMs: () => 1710 });

  assert.deepEqual(runtime.fadeTransitions, [false, true]);
  assert.deepEqual([...runtime.timers.values()].map((timer) => timer.delayMs), [650]);
  assert.equal(runtime.feature.store.getState().roundStartDelayed, false);
  runtime.fireTimerWithDelay(650);
  assert.equal(runtime.feature.store.getState().roundStartDelayed, true);
  assert.equal(runtime.feature.store.getState().roundStartDelayTick, 77);

  runtime.configure({ nextStartAt: 2500, nowServerMs: () => 2300 });
  assert.equal(runtime.feature.store.getState().roundStartDelayed, false);
  assert.deepEqual(runtime.fadeTransitions, [false, true]);
  assert.deepEqual([...runtime.timers.values()].map((timer) => timer.delayMs), [360]);
  runtime.scope.dispose();
});

test("an 80ms backward server-clock correction cannot replay the same intermission fade", () => {
  const runtime = createTimingHarness();
  runtime.configure();
  runtime.fireTimerWithDelay(700);
  const clock = updateServerClockFromSample(
    createServerClockState({
      monotonicNowMs: 1000,
      serverNowMs: 1000,
      synchronized: true,
    }),
    { monotonicNowMs: 1700, sampledServerNowMs: 1380 },
  );
  const correctedNow = readServerClockMs(clock, 1700);
  assert.equal(correctedNow, 1620);
  runtime.configure({ nowServerMs: () => correctedNow });

  assert.deepEqual(runtime.fadeTransitions, [false, true]);
  assert.deepEqual([...runtime.timers.values()].map((timer) => timer.delayMs), [540]);
  runtime.scope.dispose();
});

test("callbacks dispatched before timing cancellation cannot affect a newer phase or generation", () => {
  const runtime = createTimingHarness();
  runtime.configure();
  const firstCallbacks = [...runtime.timers.values()].map((timer) => timer.callback);
  runtime.configure({ nextStartAt: 3000 });
  const activeTimers = [...runtime.timers.keys()];
  for (const callback of firstCallbacks) callback();
  assert.deepEqual(runtime.fadeTransitions, [false]);
  assert.equal(runtime.feature.store.getState().roundStartDelayed, false);
  assert.equal(runtime.feature.store.getState().roundStartDelayTick, 0);
  assert.deepEqual([...runtime.timers.keys()], activeTimers);

  const secondCallbacks = [...runtime.timers.values()].map((timer) => timer.callback);
  runtime.configure({ phase: "playing", nextStartAt: null });
  for (const callback of secondCallbacks) callback();
  assert.deepEqual(runtime.fadeTransitions, [false]);
  assert.equal(runtime.feature.store.getState().roundStartDelayed, false);
  assert.equal(runtime.feature.store.getState().roundStartDelayTick, 0);
  assert.equal(runtime.timers.size, 0);
  runtime.scope.dispose();
});

test("a new round, results exit, tournament end or desktop layout resets the fade latch", () => {
  for (const reset of [
    { roundId: "round-2" },
    { phase: "playing" },
    { breakKind: "tournament_end" },
    { isMobileLayout: false },
  ]) {
    const runtime = createTimingHarness();
    runtime.configure();
    runtime.fireTimerWithDelay(700);
    runtime.configure({ nextStartAt: 4000, nowServerMs: () => 2000, ...reset });
    assert.equal(runtime.feature.store.getState().mobileOutroFadeActive, false);

    runtime.configure({
      roundId: "round-2",
      nextStartAt: 4000,
      nowServerMs: () => 2000,
    });
    runtime.fireTimerWithDelay(1700);
    assert.deepEqual(runtime.fadeTransitions, [false, true, false, true]);
    runtime.scope.dispose();
  }
});

test("results satellite owns path preview observation and animation frames", () => {
  class FakeElement {
    constructor(rect) {
      this.rect = rect;
      this.clientWidth = rect.width;
      this.clientHeight = rect.height;
    }

    getBoundingClientRect() {
      return this.rect;
    }
  }

  const animationFrames = new Map();
  const observers = [];
  const scope = createResourceScope("test:results-path-preview");
  let nextFrameId = 1;
  let viewportListener = null;
  let viewportUnsubscribed = 0;
  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }

    disconnect() {
      this.disconnected = true;
    }

    observe(element) {
      this.element = element;
    }
  }

  const feature = createResultsFeature(
    { scope },
    {
      cancelAnimationFrameFn: (id) => animationFrames.delete(id),
      HTMLElementCtor: FakeElement,
      requestAnimationFrameFn: (callback) => {
        const id = nextFrameId++;
        animationFrames.set(id, callback);
        return id;
      },
      ResizeObserverCtor: FakeResizeObserver,
    }
  );
  const gridElement = new FakeElement({ left: 10, top: 20, width: 100, height: 100 });
  const tileElements = [
    new FakeElement({ left: 10, top: 20, width: 20, height: 20 }),
    new FakeElement({ left: 30, top: 20, width: 20, height: 20 }),
  ];
  feature.start();
  feature.configurePathPreview({
    enabled: true,
    gridElement,
    path: [0, 1],
    subscribeViewport: (listener) => {
      viewportListener = listener;
      return () => {
        viewportListener = null;
        viewportUnsubscribed += 1;
      };
    },
    tileElements,
  });

  assert.equal(animationFrames.size, 1);
  const [firstFrameId, firstFrame] = [...animationFrames.entries()][0];
  animationFrames.delete(firstFrameId);
  firstFrame();
  assert.deepEqual(feature.store.getState().pathPreview, {
    width: 100,
    height: 100,
    points: [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
    ],
    endAngleDeg: 0,
  });
  assert.equal(observers[0].element, gridElement);

  tileElements[1].rect = { left: 30, top: 40, width: 20, height: 20 };
  viewportListener();
  const [nextFrameIdValue, nextFrame] = [...animationFrames.entries()][0];
  animationFrames.delete(nextFrameIdValue);
  nextFrame();
  assert.deepEqual(feature.store.getState().pathPreview.points[1], { x: 30, y: 30 });
  assert.equal(feature.store.getState().pathPreview.endAngleDeg, 45);

  feature.configurePathPreview({ enabled: false });
  assert.equal(feature.store.getState().pathPreview, null);
  assert.equal(observers[0].disconnected, true);
  assert.equal(viewportUnsubscribed, 1);
  assert.equal(viewportListener, null);
  scope.dispose();
  assert.equal(animationFrames.size, 0);
});
