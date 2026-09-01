import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("stats application owns its route lifecycle and swipe presentation", () => {
  const applicationSource = read("../../src/GobbleApplication.jsx");
  const statsApplicationSource = read(
    "../../src/features/stats/StatsApplication.jsx"
  );
  const desktopSceneSource = read(
    "../../src/components/desktop/DesktopGameScene.jsx"
  );

  assert.match(applicationSource, /<StatsApplication/);
  assert.doesNotMatch(applicationSource, /WeeklyStatsScreen/);
  assert.doesNotMatch(applicationSource, /useSwipeTrackController/);
  assert.doesNotMatch(applicationSource, /weeklyTouchRef/);
  assert.doesNotMatch(applicationSource, /seasonTouchRef/);
  assert.doesNotMatch(applicationSource, /handleStatsTouchStart/);
  assert.doesNotMatch(applicationSource, /weeklyArrowTimerRef/);

  assert.match(statsApplicationSource, /useFeatureRuntime\("stats"\)/);
  assert.match(statsApplicationSource, /useSwipeTrackController/);
  assert.match(statsApplicationSource, /weeklyTouchRef = React\.useRef/);
  assert.match(statsApplicationSource, /seasonTouchRef = React\.useRef/);
  assert.match(statsApplicationSource, /window\.addEventListener\("keydown"/);
  assert.match(statsApplicationSource, /fetchWeeklyStats/);
  assert.match(statsApplicationSource, /requestTrophyStatus/);
  assert.match(statsApplicationSource, /<WeeklyStatsScreen/);

  assert.match(desktopSceneSource, /statsApplication/);
  assert.doesNotMatch(desktopSceneSource, /weeklyStatsPage/);
  assert.doesNotMatch(desktopSceneSource, /weeklyOverlayStyle/);
});
