import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createIntermissionClockFeature } from "./createIntermissionClockFeature.js";

test("intermission clock owns its timer and clears retained countdown state", () => {
  const scope = createResourceScope("intermission-test");
  const feature = createIntermissionClockFeature({ scope });
  feature.start();
  const serverNowMs = Date.now();
  feature.startCountdown({ deadlineServerMs: serverNowMs + 5000, serverNowMs });
  assert.equal(feature.store.getState().remainingSeconds, 5);
  assert.equal(feature.store.getState().running, true);
  scope.dispose();
  assert.deepEqual(feature.store.getState(), {
    deadlineMonotonicMs: null,
    remainingSeconds: null,
    running: false,
  });
});
