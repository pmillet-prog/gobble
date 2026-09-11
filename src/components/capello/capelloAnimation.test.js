import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPELLO_INTERVENTION_CONFIG,
  CAPELLO_TYPE_DELAY_MAX_MS,
  CAPELLO_TYPE_DELAY_MIN_MS,
  computeCapelloPlacement,
  getCapelloFramePosition,
  getCapelloTypingDelay,
  splitCapelloText,
} from "./capelloAnimation.js";

test("Capello types graphemes one by one and pauses on punctuation", () => {
  assert.deepEqual(splitCapelloText("ça !"), ["ç", "a", " ", "!"]);
  assert.equal(
    getCapelloTypingDelay("a", () => 0),
    Math.round(CAPELLO_TYPE_DELAY_MIN_MS / 8)
  );
  assert.equal(
    getCapelloTypingDelay("a", () => 1),
    Math.round(CAPELLO_TYPE_DELAY_MAX_MS / 8)
  );
  assert.ok(getCapelloTypingDelay(",", () => 0) > getCapelloTypingDelay("a", () => 1));
  assert.ok(getCapelloTypingDelay(".", () => 0) > getCapelloTypingDelay(",", () => 0));
});

test("Capello frame positions address all five poses", () => {
  assert.equal(getCapelloFramePosition(0), "0% 0%");
  assert.equal(getCapelloFramePosition(2), "50% 0%");
  assert.equal(getCapelloFramePosition(4), "100% 0%");
  assert.equal(CAPELLO_INTERVENTION_CONFIG.bubbleMaxWidthPx, 340);
  assert.equal(CAPELLO_INTERVENTION_CONFIG.textHoldMs, 3500);
});

test("Capello placement stays inside desktop and mobile viewport bounds", () => {
  const desktop = computeCapelloPlacement(
    { left: 420, top: 260, width: 420 },
    { height: 900, width: 1440 }
  );
  assert.equal(desktop.compact, false);
  assert.ok(desktop.anchorX > 420 && desktop.anchorX < 840);
  assert.ok(desktop.anchorBottom > 0 && desktop.anchorBottom < 900);

  const mobile = computeCapelloPlacement(
    { left: 8, top: 210, width: 344 },
    { height: 640, width: 360 }
  );
  assert.equal(mobile.compact, true);
  assert.ok(mobile.anchorX >= 8 && mobile.anchorX <= 352);
  assert.ok(mobile.anchorBottom > 0 && mobile.anchorBottom < 640);
});
