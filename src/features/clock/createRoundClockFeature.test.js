import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createRoundClockFeature } from "./createRoundClockFeature.js";

test("round clock state is owned outside React and stops cleanly", () => {
  const scope = createResourceScope("clock-test");
  const feature = createRoundClockFeature({ scope });
  feature.start();
  feature.setCountdown(3);
  assert.deepEqual(feature.store.getState(), {
    deadlineMonotonicMs: null,
    maxSeconds: 0,
    remainingSeconds: 3,
    running: false,
  });
  scope.dispose();
  assert.equal(feature.store.getState().remainingSeconds, 0);
});
