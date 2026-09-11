import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("stats overlay is a global sibling and owns its viewport and navigation", () => {
  const applicationSource = read("../../src/GobbleApplication.jsx");
  const statsApplicationSource = read(
    "../../src/features/stats/StatsApplication.jsx"
  );
  const desktopSceneSource = read(
    "../../src/components/desktop/DesktopGameScene.jsx"
  );

  const shellSource = read("../../src/app/AppShell.jsx");
  assert.match(shellSource, /<StatsOverlaySatellite\s*\/>/);
  assert.doesNotMatch(applicationSource, /StatsApplication|StatsOverlaySatellite/);
  assert.doesNotMatch(applicationSource, /setAppView\("stats"\)/);
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
  assert.match(statsApplicationSource, /useStatsViewport\(\)/);
  assert.match(statsApplicationSource, /createPortal\(application, document.body\)/);
  assert.doesNotMatch(statsApplicationSource, /backgroundDesktop|backgroundMobile|overlayStyle/);

  assert.doesNotMatch(desktopSceneSource, /statsApplication/);
  assert.doesNotMatch(desktopSceneSource, /weeklyStatsPage/);
  assert.doesNotMatch(desktopSceneSource, /weeklyOverlayStyle/);
});
