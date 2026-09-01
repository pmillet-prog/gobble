import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("daily session controller owns request and session resources", () => {
  const app = read("../../src/GobbleApplication.jsx");
  const controller = read(
    "../../src/features/daily/useDailySessionController.js",
  );

  assert.doesNotMatch(app, /dailyLifecycleRef/);
  assert.doesNotMatch(app, /dailySubmitRef/);
  assert.doesNotMatch(app, /createDailyGameController/);
  assert.match(app, /useDailySessionController\(/);

  assert.match(controller, /dailyLifecycleRef = React\.useRef/);
  assert.match(controller, /dailySubmitRef = React\.useRef/);
  assert.match(controller, /createDailyGameController/);
});
