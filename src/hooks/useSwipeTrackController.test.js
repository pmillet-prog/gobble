import test from "node:test";
import assert from "node:assert/strict";

import { buildSwipeTrackTransform } from "./useSwipeTrackController.js";

test("swipe track transform combines the active page and the imperative drag offset", () => {
  assert.equal(
    buildSwipeTrackTransform(2, -48.5),
    "translate3d(calc(-200% + -48.5px), 0, 0)"
  );
});

test("swipe track transform normalizes malformed geometry", () => {
  assert.equal(
    buildSwipeTrackTransform("invalid", Number.NaN),
    "translate3d(calc(0% + 0px), 0, 0)"
  );
});
