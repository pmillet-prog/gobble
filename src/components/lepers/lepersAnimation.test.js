import assert from "node:assert/strict";
import test from "node:test";

import {
  LEPERS_INTERVENTION_CONFIG,
  LEPERS_SOLVED_CELEBRATION_DELAY_MS,
  LEPERS_SOLVED_CELEBRATION_DURATION_MS,
  computeLepersPlacement,
  getLepersFramePosition,
} from "./lepersAnimation.js";

test("the Lepers frame set addresses seven separate poses", () => {
  assert.equal(getLepersFramePosition(0), "0% 0%");
  assert.equal(getLepersFramePosition(6), "100% 0%");
  assert.equal(LEPERS_INTERVENTION_CONFIG.neutralFrame, 6);
  assert.equal(LEPERS_INTERVENTION_CONFIG.blinkFrame, 5);
  assert.equal(LEPERS_INTERVENTION_CONFIG.frameAspectRatio, 5 / 6);
  assert.match(LEPERS_INTERVENTION_CONFIG.spriteUrl, /frames\.webp$/);
  assert.match(LEPERS_INTERVENTION_CONFIG.buttonUrl, /button\.webp$/);
  assert.ok(
    LEPERS_SOLVED_CELEBRATION_DELAY_MS >= LEPERS_SOLVED_CELEBRATION_DURATION_MS
  );
});

test("the Lepers overlay remains inside a compact viewport", () => {
  const placement = computeLepersPlacement(
    { left: 12, top: 210, width: 336 },
    { width: 360, height: 740 }
  );
  assert.ok(placement.anchorX > 0 && placement.anchorX < 360);
  assert.ok(placement.anchorBottom >= 8);
  assert.equal(placement.compact, true);
});
