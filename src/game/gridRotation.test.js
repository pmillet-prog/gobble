import test from "node:test";
import assert from "node:assert/strict";

import {
  mapDisplayToBoardIndex,
  normalizeRotationTurns,
  rotateIndexByTurns,
} from "./gridRotation.js";

test("grid rotation normalizes turns and preserves inverse display mapping", () => {
  assert.equal(normalizeRotationTurns(-1), 3);
  for (let index = 0; index < 16; index += 1) {
    const displayIndex = rotateIndexByTurns(index, 4, 1);
    assert.equal(mapDisplayToBoardIndex(displayIndex, 4, 1), index);
  }
});
