import test from "node:test";
import assert from "node:assert/strict";
import { recommendWheelGraphics, assessWheelGraphicsRun } from "./wheelGraphicsRecommendation.js";
const phase = (fps = 60, p95 = 18) => ({ fps, p95, samples: 180, durationMs: 3000, slowRatio: 1 });
const run = (profile, fps = 60, p95 = 18) => ({ profile, status: "complete", phases: { intro: phase(fps, p95), spin: phase(fps, p95), results: phase(fps, p95) } });
test("high quality at a stable 30 FPS wins over medium preference and medium 60 FPS", () => {
  const report = { runs: [run("light", 30, 34), run("balanced"), run("detailed", 30, 34)], survey: { preferred: "balanced" } };
  assert.equal(recommendWheelGraphics(report).profile, "detailed");
});
test("a phase below 25 FPS excludes its mode even with a fast overall spin", () => {
  const high = run("detailed"); high.phases.intro = phase(24, 44);
  const result = recommendWheelGraphics({ runs: [run("balanced"), high] });
  assert.equal(result.profile, "balanced"); assert.deepEqual(result.evidence.detailed.reasons, ["below_25"]);
  high.status = "skipped";
  assert.equal(assessWheelGraphicsRun(high).reason, "below_25", "Interrupted slow samples remain evidence");
});
test("borderline 25-28 FPS and recurrent stutters prefer a stable lower quality", () => {
  for (const high of [run("detailed", 27, 39), run("detailed", 50, 110)]) {
    assert.equal(recommendWheelGraphics({ runs: [run("balanced", 30, 34), high] }).profile, "balanced");
  }
});
test("missing/skipped observations do not prove 3D incapacity", () => {
  assert.equal(recommendWheelGraphics({ runs: [{ profile: "flat", status: "complete" }, { profile: "detailed", status: "skipped" }] }).profile, null);
  const short = run("detailed"); short.phases.spin.samples = 4;
  assert.equal(assessWheelGraphicsRun(short).conclusive, false);
  const timeouts = ["detailed", "balanced", "light"].map(profile => ({ profile, status: "timeout" }));
  assert.equal(recommendWheelGraphics({ runs: timeouts }).profile, null, "A loading timeout is not a frame-rate measurement");
});
test("failed 3D levels choose 2D, and a retry cannot hide a failed attempt", () => {
  const runs = ["light", "balanced", "detailed"].map(profile => ({ profile, status: "error" }));
  assert.equal(recommendWheelGraphics({ runs }).profile, "flat");
  runs.push(run("detailed")); assert.equal(recommendWheelGraphics({ runs }).profile, "flat");
});
test("visual defects matter even when frames are fast; startup time alone does not", () => {
  const runs = [{ ...run("detailed"), loadingMs: 18000 }];
  assert.equal(recommendWheelGraphics({ runs }).profile, "detailed");
  assert.equal(recommendWheelGraphics({ runs, survey: { visual: "black" } }).profile, "flat");
});
