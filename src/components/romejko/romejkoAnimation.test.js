import assert from "node:assert/strict";
import test from "node:test";

import {
  ROMEJKO_INTERVENTION_CONFIG,
  computeRomejkoPlacement,
  getRomejkoFramePosition,
} from "./romejkoAnimation.js";

test("the Romejko frame set addresses five poses", () => {
  assert.equal(getRomejkoFramePosition(0), "0% 0%");
  assert.equal(getRomejkoFramePosition(4), "100% 0%");
  assert.equal(ROMEJKO_INTERVENTION_CONFIG.frameAspectRatio, 5 / 6);
  assert.equal(ROMEJKO_INTERVENTION_CONFIG.neutralFrame, 0);
  assert.equal(ROMEJKO_INTERVENTION_CONFIG.blinkFrame, 4);
  assert.equal(ROMEJKO_INTERVENTION_CONFIG.mirrored, true);
  assert.equal(ROMEJKO_INTERVENTION_CONFIG.bubbleMaxWidthPx, 340);
  assert.equal(ROMEJKO_INTERVENTION_CONFIG.characterHeightPx, 190);
  assert.equal(ROMEJKO_INTERVENTION_CONFIG.characterHeightMobilePx, 158);
  assert.equal(ROMEJKO_INTERVENTION_CONFIG.textHoldMs, 3500);
});

test("the Romejko overlay has a safe compact fallback", () => {
  const placement = computeRomejkoPlacement(null, {
    height: 640,
    width: 360,
  });

  assert.equal(placement.compact, true);
  assert.ok(placement.anchorX > 0 && placement.anchorX < 360);
  assert.ok(placement.anchorBottom >= 8);
});
