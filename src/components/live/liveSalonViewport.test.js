import assert from "node:assert/strict";
import test from "node:test";
import { computeLiveSalonKeyboardViewport } from "./liveSalonViewport.js";

test("salon composer follows the visible keyboard edge even when Safari pans to the layout bottom", () => {
  const resting = { surfaceHeight: 956, viewportHeight: 956, viewportWidth: 440 };
  assert.equal(computeLiveSalonKeyboardViewport(resting).keyboardVisible, false);
  for (const offsetTop of [0, 80, 426]) {
    const open = computeLiveSalonKeyboardViewport({ ...resting, viewportHeight: 530, offsetTop });
    assert.equal(open.keyboardVisible, true);
    assert.equal(open.composerBottom - offsetTop, 520);
    assert.equal(open.composerLeft, 17.6);
    assert.equal(open.composerWidth, 404.8);
  }
  assert.equal(computeLiveSalonKeyboardViewport(resting).keyboardVisible, false);
});

test("a system bar height change is not treated as a keyboard", () => {
  assert.equal(computeLiveSalonKeyboardViewport({
    surfaceHeight: 915, viewportHeight: 867, viewportWidth: 412,
  }).keyboardVisible, false);
});
