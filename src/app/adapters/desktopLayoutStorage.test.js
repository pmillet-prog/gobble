import test from "node:test";
import assert from "node:assert/strict";

import {
  DAILY_DESKTOP_COLUMN_DEFS,
  areDesktopFractionsEqual,
  normalizeDesktopColumnFractions,
  normalizeDesktopColumnOrder,
} from "./desktopLayoutStorage.js";

test("desktop column fractions are normalized and reject invalid values", () => {
  const normalized = normalizeDesktopColumnFractions([2, -1, 1], [1, 1, 1]);
  assert.deepEqual(normalized, [0.5, 0.25, 0.25]);
  assert.equal(areDesktopFractionsEqual(normalized, [0.5, 0.25, 0.25]), true);
});

test("desktop column order is complete, unique and scoped to its layout", () => {
  assert.deepEqual(
    normalizeDesktopColumnOrder(["side", "grid", "side", "unknown"], DAILY_DESKTOP_COLUMN_DEFS),
    ["side", "grid", "players"]
  );
});
