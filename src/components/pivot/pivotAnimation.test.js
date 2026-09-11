import assert from "node:assert/strict";
import test from "node:test";

import {
  PIVOT_INTERVENTION_CONFIG,
  computePivotPlacement,
  getPivotFramePosition,
} from "./pivotAnimation.js";

test("the Pivot frame set addresses its six poses", () => {
  assert.equal(getPivotFramePosition(0), "0% 0%");
  assert.equal(getPivotFramePosition(5), "100% 0%");
  assert.equal(
    PIVOT_INTERVENTION_CONFIG.frameAspectRatio,
    5 / 6
  );
  assert.equal(PIVOT_INTERVENTION_CONFIG.bubbleMaxWidthPx, 340);
  assert.equal(PIVOT_INTERVENTION_CONFIG.textHoldMs, 6500);
  assert.equal(PIVOT_INTERVENTION_CONFIG.typeDelayMinMs, 20);
  assert.equal(PIVOT_INTERVENTION_CONFIG.typeDelayMaxMs, 30);
});

test("the Pivot overlay has a safe compact fallback without a grid rect", () => {
  const placement = computePivotPlacement(null, {
    height: 640,
    width: 360,
  });

  assert.equal(placement.compact, true);
  assert.ok(placement.anchorX > 0 && placement.anchorX < 360);
  assert.ok(placement.anchorBottom >= 8);
});
