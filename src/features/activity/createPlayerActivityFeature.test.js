import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createPlayerActivityFeature } from "./createPlayerActivityFeature.js";

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.visibilityState = "visible";
  }

  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
  }

  removeEventListener(name, listener) {
    this.listeners.get(name)?.delete(listener);
  }

  dispatch(name, event = {}) {
    for (const listener of this.listeners.get(name) || []) listener(event);
  }
}

test("player activity satellite owns listeners and realtime throttling lifecycle", () => {
  const emitted = [];
  const realtime = {
    connected: true,
    emit: (name, payload) => emitted.push([name, payload]),
  };
  const scope = createResourceScope("activity-test");
  const windowObject = new FakeEventTarget();
  const documentObject = new FakeEventTarget();
  const feature = createPlayerActivityFeature(
    { ports: { realtime }, scope },
    { documentObject, windowObject }
  );
  feature.start();
  feature.configure({ enabled: true, roomId: "room-4x4" });
  assert.deepEqual(emitted[0], [
    "player:activity",
    { roomId: "room-4x4", kind: "live_open" },
  ]);
  assert.equal(feature.signal("manual", { force: true }), true);
  feature.configure({ enabled: false });
  windowObject.dispatch("pointerdown");
  assert.equal(emitted.length, 2);
  scope.dispose();
  assert.equal(windowObject.listeners.get("pointerdown")?.size || 0, 0);
  assert.equal(documentObject.listeners.get("visibilitychange")?.size || 0, 0);
});
