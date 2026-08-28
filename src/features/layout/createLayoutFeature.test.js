import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createLayoutFeature } from "./createLayoutFeature.js";

function createEventTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener(eventName, listener) {
      const bucket = listeners.get(eventName) || new Set();
      bucket.add(listener);
      listeners.set(eventName, bucket);
    },
    emit(eventName) {
      for (const listener of listeners.get(eventName) || []) listener();
    },
    listenerCount(eventName) {
      return listeners.get(eventName)?.size || 0;
    },
    removeEventListener(eventName, listener) {
      listeners.get(eventName)?.delete(listener);
    },
  };
}

test("layout satellite owns the foreground grid restore frame and listeners", () => {
  class FakeElement {
    constructor() {
      this.style = { opacity: "0", transition: "opacity 200ms" };
    }
  }

  const animationFrames = new Map();
  const timeouts = new Map();
  const documentTarget = createEventTarget({ visibilityState: "visible" });
  let nextId = 1;
  const windowTarget = createEventTarget({
    clearTimeout(id) {
      timeouts.delete(id);
    },
    getComputedStyle(element) {
      return { opacity: element.style.opacity || "1" };
    },
    setTimeout(callback, delayMs) {
      const id = nextId++;
      timeouts.set(id, { callback, delayMs });
      return id;
    },
    visualViewport: null,
  });
  const scope = createResourceScope("layout-foreground-grid-test");
  const feature = createLayoutFeature(
    { scope },
    {
      cancelAnimationFrameFn: (id) => animationFrames.delete(id),
      documentTarget,
      HTMLElementCtor: FakeElement,
      requestAnimationFrameFn: (callback) => {
        const id = nextId++;
        animationFrames.set(id, callback);
        return id;
      },
      viewportEventsOptions: {
        cancelFrame: () => {},
        requestFrame: () => null,
        visualViewportTarget: null,
      },
      windowTarget,
    }
  );
  const gridElement = new FakeElement();
  feature.start();
  feature.configureForegroundGridGuard({ enabled: true, gridElement });

  assert.equal(windowTarget.listenerCount("focus"), 2);
  assert.equal(windowTarget.listenerCount("pageshow"), 1);
  assert.equal(documentTarget.listenerCount("visibilitychange"), 2);
  assert.equal(animationFrames.size, 1);
  const [frameId, frame] = [...animationFrames.entries()][0];
  animationFrames.delete(frameId);
  frame();
  assert.equal(gridElement.style.opacity, "");
  assert.equal(gridElement.style.transition, "");

  gridElement.style.opacity = "0";
  windowTarget.emit("pageshow");
  assert.equal(animationFrames.size, 1);
  feature.configureForegroundGridGuard({ enabled: false });
  assert.equal(animationFrames.size, 0);
  assert.equal(windowTarget.listenerCount("focus"), 1);
  assert.equal(documentTarget.listenerCount("visibilitychange"), 1);

  scope.dispose();
  assert.equal(windowTarget.listenerCount("focus"), 0);
  assert.equal(windowTarget.listenerCount("pageshow"), 0);
  assert.equal(documentTarget.listenerCount("visibilitychange"), 0);
  assert.equal(timeouts.size, 0);
});
