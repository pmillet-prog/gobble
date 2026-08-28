import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createResultsFeature } from "./createResultsFeature.js";

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
  scheduled[0].callback();
  assert.equal(feature.store.getState().mobileOutroFadeActive, true);
  scheduled[1].callback();
  assert.equal(feature.store.getState().roundStartDelayTick, 77);

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
  assert.equal(timers.size, 0);
  scope.dispose();
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
