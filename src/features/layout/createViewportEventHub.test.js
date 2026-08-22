import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import {
  VIEWPORT_EVENTS,
  createViewportEventHub,
} from "./createViewportEventHub.js";

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    dispatch(name) {
      for (const listener of listeners.get(name) || []) listener();
    },
    listenerCount(name) {
      return listeners.get(name)?.size || 0;
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener);
    },
  };
}

test("viewport hub coalesces native resize sources and releases listeners", () => {
  const scope = createResourceScope("test:viewport");
  const windowTarget = createEventTarget();
  const visualViewportTarget = createEventTarget();
  const frames = new Map();
  let nextFrameId = 1;
  const hub = createViewportEventHub(
    { scope },
    {
      cancelFrame: (id) => frames.delete(id),
      requestFrame: (callback) => {
        const id = nextFrameId++;
        frames.set(id, callback);
        return id;
      },
      visualViewportTarget,
      windowTarget,
    }
  );
  const received = [];
  hub.subscribe(
    (payload) => received.push(payload.types),
    [VIEWPORT_EVENTS.WINDOW_RESIZE, VIEWPORT_EVENTS.VISUAL_RESIZE]
  );
  hub.start();

  windowTarget.dispatch("resize");
  visualViewportTarget.dispatch("resize");
  assert.equal(frames.size, 1);
  const callback = [...frames.values()][0];
  frames.clear();
  callback();
  assert.deepEqual(received, [[
    VIEWPORT_EVENTS.WINDOW_RESIZE,
    VIEWPORT_EVENTS.VISUAL_RESIZE,
  ]]);

  assert.equal(windowTarget.listenerCount("resize"), 1);
  assert.equal(visualViewportTarget.listenerCount("resize"), 1);
  scope.dispose();
  assert.equal(windowTarget.listenerCount("resize"), 0);
  assert.equal(visualViewportTarget.listenerCount("resize"), 0);
});
