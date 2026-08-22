import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "./createResourceScope.js";

test("resource scopes dispose owned resources once in reverse order", () => {
  const scope = createResourceScope("test");
  const calls = [];
  scope.add(() => calls.push("first"));
  scope.add(() => calls.push("second"));

  scope.dispose();
  scope.dispose();

  assert.deepEqual(calls, ["second", "first"]);
  assert.equal(scope.disposed, true);
});

test("resources registered after disposal are cleaned immediately", () => {
  const scope = createResourceScope("test");
  let disposed = 0;
  scope.dispose();
  scope.add(() => {
    disposed += 1;
  });
  assert.equal(disposed, 1);
});
