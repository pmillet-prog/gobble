import test from "node:test";
import assert from "node:assert/strict";

import { getScoreFlightOrigin } from "./scoreFlightGeometry.js";

const gridRect = { left: 10, top: 20, width: 400, height: 400 };

test("chooses the tile corner nearest the visual grid center", () => {
  assert.deepEqual(
    getScoreFlightOrigin({
      gridRect,
      tileRect: { left: 310, top: 320, width: 80, height: 80 },
    }),
    { x: 310, y: 320 }
  );
});

test("follows the tile's current DOM position after a grid rotation", () => {
  assert.deepEqual(
    getScoreFlightOrigin({
      gridRect,
      tileRect: { left: 310, top: 40, width: 80, height: 80 },
    }),
    { x: 310, y: 120 }
  );
});

test("falls back to the available rectangle center", () => {
  assert.deepEqual(
    getScoreFlightOrigin({
      gridRect: null,
      tileRect: { left: 30, top: 40, width: 80, height: 60 },
    }),
    { x: 70, y: 70 }
  );
});
