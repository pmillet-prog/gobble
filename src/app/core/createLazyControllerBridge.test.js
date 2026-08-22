import test from "node:test";
import assert from "node:assert/strict";

import {
  createLazyArrayControllerBridge,
  createLazyObjectControllerBridge,
} from "./createLazyControllerBridge.js";

test("lazy array controllers build only on first use of the latest runtime", () => {
  let builds = 0;
  const bridge = createLazyArrayControllerBridge((runtime) => {
    builds += 1;
    return [(suffix) => `${runtime.value}:${suffix}`];
  }, 1);
  const method = bridge.methods[0];
  bridge.update({ value: "one" });
  bridge.update({ value: "two" });
  assert.equal(builds, 0);
  assert.equal(method("ok"), "two:ok");
  assert.equal(method("again"), "two:again");
  assert.equal(builds, 1);
  bridge.update({ value: "three" });
  assert.equal(bridge.methods[0], method);
  assert.equal(method("ok"), "three:ok");
  assert.equal(builds, 2);
});

test("lazy object controllers expose stable named methods", () => {
  let builds = 0;
  const bridge = createLazyObjectControllerBridge((runtime) => {
    builds += 1;
    return { read: () => runtime.value };
  }, ["read"]);
  const read = bridge.methods.read;
  bridge.update({ value: 1 });
  assert.equal(read(), 1);
  bridge.update({ value: 2 });
  assert.equal(bridge.methods.read, read);
  assert.equal(read(), 2);
  assert.equal(builds, 2);
});

