import test from "node:test";
import assert from "node:assert/strict";

import { createFeatureRegistry } from "./createFeatureRegistry.js";

test("feature registry starts once, reference-counts consumers and disposes resources", async () => {
  const events = [];
  const registry = createFeatureRegistry({ shared: "context" });
  registry.define("chat", ({ scope, shared }) => {
    scope.add(() => events.push("resource-disposed"));
    return {
      shared,
      start: () => events.push("started"),
      stop: () => events.push("stopped"),
    };
  });

  const first = registry.acquire("chat");
  const second = registry.acquire("chat");
  assert.equal(first.feature, second.feature);
  assert.equal(first.feature.shared, "context");
  assert.deepEqual(events, ["started"]);

  first.release();
  assert.equal(registry.isActive("chat"), true);
  second.release();
  await Promise.resolve();

  assert.equal(registry.isActive("chat"), false);
  assert.deepEqual(events, ["started", "stopped", "resource-disposed"]);
});
