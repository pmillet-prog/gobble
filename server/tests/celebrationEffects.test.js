import assert from "node:assert/strict";
import test from "node:test";

import { createCelebrationEffects } from "../../src/effects/createCelebrationEffects.js";

test("background cleanup cancels pending celebration state", () => {
  const clearedFlashes = [];
  const gridShakeStates = [];
  const scoreFlightStates = [];
  const animationCancellations = [];
  const burstTokenRef = { current: 4 };
  const gridShakeAnimationRef = {
    current: { cancel: () => animationCancellations.push("cancelled") },
  };
  const gridShakeTimerRef = { current: null };
  const ref = (current = null) => ({ current });
  const controller = createCelebrationEffects(
    { clearAllCelebrationFlashes: () => clearedFlashes.push("cleared") },
    ref(false),
    burstTokenRef,
    ref(null),
    gridShakeAnimationRef,
    gridShakeTimerRef,
    ref(null),
    false,
    ref(false),
    ref(false),
    ref(0),
    ref("playing"),
    ref(null),
    ref(false),
    ref(0),
    (value) => gridShakeStates.push(value),
    (value) => scoreFlightStates.push(value),
    ref([]),
    ref(true),
    ref(true),
    ref(true),
    ref(true),
    ref(true),
    ref(true)
  );

  controller.clearCelebrationEffects();

  assert.equal(burstTokenRef.current, 5);
  assert.deepEqual(clearedFlashes, ["cleared"]);
  assert.deepEqual(animationCancellations, ["cancelled"]);
  assert.equal(gridShakeAnimationRef.current, null);
  assert.deepEqual(gridShakeStates, [false]);
  assert.deepEqual(scoreFlightStates, [[]]);
});
