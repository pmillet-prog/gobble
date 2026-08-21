import assert from "node:assert/strict";
import test from "node:test";

import { clampValue, formatNumber } from "./numbers.js";

test("clampValue keeps finite numbers inside a range", () => {
  assert.equal(clampValue(-2, 0, 10), 0);
  assert.equal(clampValue(4, 0, 10), 4);
  assert.equal(clampValue(12, 0, 10), 10);
  assert.equal(clampValue(Number.NaN, 3, 10), 3);
});

test("formatNumber keeps the existing French presentation", () => {
  assert.equal(formatNumber(1234), (1234).toLocaleString("fr-FR"));
  assert.equal(formatNumber("1234"), null);
});
