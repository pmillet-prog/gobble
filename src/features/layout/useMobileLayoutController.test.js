import assert from "node:assert/strict";
import test from "node:test";

import {
  areMobileLayoutSizingsEqual,
  computeMobileGameLayoutSizing,
} from "./useMobileLayoutController.js";

test("mobile layout sizing keeps the game blocks inside the available body", () => {
  const sizing = computeMobileGameLayoutSizing({
    baseFontSize: 16,
    bodyHeight: 780,
    maxGridWidth: 720,
    viewportHeight: 844,
    viewportWidth: 390,
  });

  assert.deepEqual(sizing, {
    viewportWidth: 390,
    viewportHeight: 844,
    gridSide: 366,
    rankingHeight: 150,
    wordPreviewHeight: 62,
    liveFeedHeight: 178,
    liveFeedMinHeight: 96,
    bodyHeight: 780,
  });
  assert.equal(
    sizing.gridSide +
      sizing.rankingHeight +
      sizing.wordPreviewHeight +
      sizing.liveFeedHeight,
    sizing.bodyHeight - 24,
  );
});

test("mobile layout sizing caps the grid and compares committed measurements", () => {
  const sizing = computeMobileGameLayoutSizing({
    baseFontSize: 16,
    bodyHeight: 1000,
    maxGridWidth: 720,
    viewportHeight: 1080,
    viewportWidth: 1200,
  });

  assert.equal(sizing.gridSide, 720);
  assert.equal(areMobileLayoutSizingsEqual(sizing, { ...sizing }), true);
  assert.equal(
    areMobileLayoutSizingsEqual(sizing, {
      ...sizing,
      viewportHeight: sizing.viewportHeight - 1,
    }),
    false,
  );
});
