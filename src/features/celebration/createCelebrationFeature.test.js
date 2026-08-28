import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createCelebrationFeature } from "./createCelebrationFeature.js";

test("celebration satellite owns flash expiry timers and cleanup", () => {
  const timers = new Map();
  const scope = createResourceScope("celebration-test");
  let nextTimerId = 1;
  let notifications = 0;
  const feature = createCelebrationFeature(
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
    }
  );
  feature.start();
  feature.subscribe(() => {
    notifications += 1;
  });

  feature.showCelebrationFlash("praiseFlash", { id: 1, text: "SUPER" }, 850);
  assert.equal(feature.getSnapshot().praiseFlash.text, "SUPER");
  assert.equal([...timers.values()][0].delayMs, 850);
  assert.equal(notifications, 1);

  feature.showCelebrationFlash("praiseFlash", { id: 2, text: "GÉNIAL" }, 900);
  assert.equal(timers.size, 1);
  assert.equal(feature.getSnapshot().praiseFlash.id, 2);
  [...timers.values()][0].callback();
  assert.equal(feature.getSnapshot().praiseFlash, null);
  assert.equal(notifications, 3);

  feature.showCelebrationFlash("gobbleFlash", { id: 3 }, 1200);
  feature.showCelebrationFlash("invalidFlash", { id: 4 }, 500);
  assert.equal(timers.size, 2);
  scope.dispose();
  assert.equal(timers.size, 0);
  assert.deepEqual(feature.getSnapshot(), {
    gobbleFlash: null,
    invalidFlash: null,
    praiseFlash: null,
  });
  assert.equal(feature.showCelebrationFlash("praiseFlash", { id: 5 }, 100), false);
});
