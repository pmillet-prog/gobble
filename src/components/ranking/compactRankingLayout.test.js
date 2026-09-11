import assert from "node:assert/strict";
import test from "node:test";
import { getCompactRankingLayout } from "./compactRankingLayout.js";

test("compact ranking rows fit their container at every supported height", () => {
  for (let height = 54; height <= 128; height++) {
    const layout = getCompactRankingLayout(height);
    const total = layout.rowHeights.reduce((sum, row) => sum + row, 0) +
      layout.gap * (layout.offsets.length - 1) + layout.inset * 2;
    assert.ok(total <= height + 0.01, `${height}px: rows need ${total}px`);
    assert.ok(layout.fontScale * 21 >= 17);
    assert.ok(layout.rowHeights[Math.floor(layout.rowHeights.length / 2)] >= 22);
  }
});

test("short ranking retains self and immediate neighbors, restoring five rows when space allows", () => {
  assert.deepEqual(getCompactRankingLayout(54).offsets, [-1, 0, 1]);
  assert.deepEqual(getCompactRankingLayout(89).offsets, [-1, 0, 1]);
  assert.deepEqual(getCompactRankingLayout(90).offsets, [-2, -1, 0, 1, 2]);
});
