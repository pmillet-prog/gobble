import assert from "node:assert/strict";
import test from "node:test";
import { getCompactRankingLayout } from "../../components/ranking/compactRankingLayout.js";

import {
  areMobileLayoutSizingsEqual,
  computeMobileGameLayoutSizing,
  resolveMobileGameViewportLock,
} from "./useMobileLayoutController.js";

test("mobile game viewport lock ignores height-only keyboard resizes", () => {
  const baseline = { width: 390, height: 844 };

  assert.deepEqual(
    resolveMobileGameViewportLock(baseline, { width: 390, height: 478 }),
    baseline,
  );
  assert.deepEqual(
    resolveMobileGameViewportLock(baseline, { width: 844, height: 390 }),
    { width: 844, height: 390 },
  );
  assert.deepEqual(
    resolveMobileGameViewportLock(baseline, { width: 391, height: 844 }),
    { width: 391, height: 844 },
  );
});

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
    rankingHeight: 128,
    wordPreviewHeight: 51,
    liveFeedHeight: 211,
    liveFeedMinHeight: 96,
    liveActionBarHeight: 0,
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

test("mobile live action bar is reserved below the flexible feed", () => {
  const sizing = computeMobileGameLayoutSizing({
    baseFontSize: 16,
    bodyHeight: 780,
    maxGridWidth: 720,
    showLiveActionBar: true,
    viewportHeight: 844,
    viewportWidth: 390,
  });

  assert.equal(sizing.liveActionBarHeight, 70);
  assert.equal(sizing.liveFeedHeight, 137);
  assert.equal(
    sizing.gridSide +
      sizing.rankingHeight +
      sizing.wordPreviewHeight +
      sizing.liveFeedHeight +
      sizing.liveActionBarHeight,
    sizing.bodyHeight - 28,
  );
});

test("adaptive mobile layout keeps five ranking rows, feed and actions on iPhone SE", () => {
  const sizing = computeMobileGameLayoutSizing({
    baseFontSize: 16,
    bodyHeight: 504,
    maxGridWidth: 720,
    showLiveActionBar: true,
    adaptiveRanking: true,
    viewportHeight: 568,
    viewportWidth: 320,
  });

  assert.equal(sizing.gridSide, 264);
  assert.equal(sizing.rankingHeight, 90);
  assert.equal(sizing.wordPreviewHeight, 30);
  assert.equal(sizing.liveFeedHeight, 40);
  assert.equal(sizing.liveActionBarHeight, 52);
});

test("widening a 632px-tall phone compacts ranking before reducing the live feed", () => {
  let previous;
  for (let width = 209; width <= 360; width++) {
    const sizing = computeMobileGameLayoutSizing({
      baseFontSize: 16, bodyHeight: 568, maxGridWidth: 720,
      showLiveActionBar: true, adaptiveRanking: true,
      viewportHeight: 632, viewportWidth: width,
    });
    assert.equal(sizing.gridSide, Math.min(width - 24, 328));
    assert.ok(sizing.liveFeedHeight >= 40);
    assert.ok(sizing.rankingHeight >= 90);
    assert.ok(!previous || sizing.rankingHeight <= previous.rankingHeight);
    assert.equal(sizing.gridSide + sizing.rankingHeight + sizing.wordPreviewHeight +
      sizing.liveFeedHeight + sizing.liveActionBarHeight + 28, sizing.bodyHeight);
    previous = sizing;
  }
  assert.equal(previous.rankingHeight, 90);
});

test("short layouts shrink the board after compacting the other blocks to keep the feed visible", () => {
  const sizing = computeMobileGameLayoutSizing({
    bodyHeight: 400, viewportHeight: 464, viewportWidth: 360,
    adaptiveRanking: true, showLiveActionBar: true,
  });
  assert.equal(sizing.gridSide, 160);
  assert.equal(sizing.rankingHeight, 90);
  assert.equal(sizing.wordPreviewHeight, 30);
  assert.equal(sizing.liveFeedHeight, 40);
  assert.equal(sizing.liveActionBarHeight, 52);
  assert.equal(sizing.gridSide + sizing.rankingHeight + sizing.wordPreviewHeight +
    sizing.liveFeedHeight + sizing.liveActionBarHeight + 28, sizing.bodyHeight);
});

test("adaptive mobile blocks fit without scrolling through the full-width threshold", () => {
  for (const width of [280, 320, 360, 390, 430]) {
    let previousSide = 0;
    for (let bodyHeight = 320; bodyHeight <= 850; bodyHeight++) {
      const sizing = computeMobileGameLayoutSizing({
        bodyHeight, viewportHeight: bodyHeight + 64, viewportWidth: width,
        adaptiveRanking: true, showLiveActionBar: true,
      });
      assert.ok(sizing.gridSide >= previousSide && sizing.gridSide <= width - 24);
      assert.ok(sizing.liveFeedHeight >= 40);
      assert.equal(getCompactRankingLayout(sizing.rankingHeight).offsets.length, 5);
      assert.equal(sizing.gridSide + sizing.rankingHeight + sizing.wordPreviewHeight +
        sizing.liveFeedHeight + sizing.liveActionBarHeight + 28, bodyHeight);
      if (sizing.gridSide < width - 24) {
        assert.equal(sizing.rankingHeight, 90);
        assert.equal(sizing.wordPreviewHeight, 30);
        assert.equal(sizing.liveActionBarHeight, 52);
      }
      previousSide = sizing.gridSide;
    }
    assert.equal(previousSide, width - 24);
  }
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

test("both target rounds reserve readable announcements independently of the ranking widget", () => {
  for (const roundType of ["target_long", "target_score"]) {
    for (const viewportWidth of [280, 320, 360, 390, 430]) {
      for (const baseFontSize of [16, 20]) {
        for (let bodyHeight = 320; bodyHeight <= 850; bodyHeight += 5) {
          const sizing = computeMobileGameLayoutSizing({
            bodyHeight, viewportHeight: bodyHeight + 64, viewportWidth,
            roundType, baseFontSize, showLiveActionBar: true,
          });
          assert.ok(sizing.targetHintHeight >= 80 && sizing.targetHintHeight <= 100);
          assert.equal(sizing.rankingHeight, 0);
          assert.ok(sizing.liveFeedHeight >= 60);
          assert.ok(sizing.gridSide > 0 && sizing.gridSide <= viewportWidth - 24);
          assert.equal(sizing.gridSide + sizing.targetHintHeight + sizing.wordPreviewHeight +
            sizing.liveFeedHeight + sizing.liveActionBarHeight + 28, bodyHeight);
        }
      }
    }
  }
});

test("switching from ordinary to target rounds commits their dedicated panel height", () => {
  const settings = {
    bodyHeight: 504, viewportWidth: 320, viewportHeight: 568,
    adaptiveRanking: true, showLiveActionBar: true,
  };
  const ordinary = computeMobileGameLayoutSizing(settings);
  const target = computeMobileGameLayoutSizing({ ...settings, roundType: "target_score" });
  assert.equal(areMobileLayoutSizingsEqual(ordinary, target), false);
  assert.equal(areMobileLayoutSizingsEqual(target, { ...target }), true);
  assert.equal(areMobileLayoutSizingsEqual(target, { ...target, targetHintHeight: 100 }), false);
  assert.equal(target.liveFeedMinHeight, 60);
  assert.equal(target.targetHintHeight, 80);
});

test("target feed reservation does not change OCID or standalone training layouts", () => {
  const settings = { bodyHeight: 504, viewportWidth: 320, viewportHeight: 568 };
  assert.deepEqual(
    computeMobileGameLayoutSizing({ ...settings, roundType: "ocid", showLiveActionBar: true }),
    computeMobileGameLayoutSizing({ ...settings, showLiveActionBar: true }),
  );
  assert.deepEqual(
    computeMobileGameLayoutSizing({ ...settings, roundType: "target_long" }),
    computeMobileGameLayoutSizing(settings),
  );
});
