import test from "node:test";
import assert from "node:assert/strict";

import {
  getDailySpecialDragTransform,
  shouldPublishDailySpecialDrag,
} from "./useDailySpecialInteraction.js";

test("daily special drag keeps raw pointer coordinates outside React state", () => {
  const previous = {
    bonusKey: "M2",
    hoverIndex: 4,
    previousIndex: 2,
    x: 100,
    y: 200,
  };
  const movedInsideSameTile = { ...previous, x: 135, y: 228 };
  const movedToAnotherTile = { ...movedInsideSameTile, hoverIndex: 5 };

  assert.equal(shouldPublishDailySpecialDrag(previous, movedInsideSameTile), false);
  assert.equal(shouldPublishDailySpecialDrag(previous, movedToAnotherTile), true);
});

test("daily special drag uses a compositor-friendly integer transform", () => {
  assert.equal(
    getDailySpecialDragTransform(100.4, 200.6),
    "translate3d(100px, 201px, 0) translate(-50%, -50%)"
  );
});
