import test from "node:test";
import assert from "node:assert/strict";
import { createWheelDiagnosticRun } from "./createWheelDiagnosticRun.js";
import { WHEEL_SURVEY, WHEEL_DIAGNOSTIC_STEPS, normalizeWheelDiagnostic, wheelSurveyComplete } from "../../../../shared/wheelDiagnostic.js";
import { createWheelPerformance } from "../../../../dev/infortune-perspective/wheelPerformance.js";
import { readWheelDiagnosticDraft } from "./wheelDiagnosticDraft.js";

const answers = () => ({ ...Object.fromEntries(WHEEL_SURVEY.map(q => [q.id, Object.keys(q.options)[0]])),
  fluidity: Object.fromEntries(WHEEL_DIAGNOSTIC_STEPS.map(s => [s.profile, "smooth"])), comment: "Le premier passage était lent." });
const report = () => ({ version: 1, id: "wheel-diagnostic-test-001", startedAt: "2026-11-04T12:00:00Z", environment: { userAgent: "test" },
  runs: [{ profile: "detailed", attempt: 1, status: "complete", phases: {} }], survey: answers() });

test("diagnostic measures actual intro/spin frames separately, retaining foreground stalls", () => {
  let time = 100;
  const run = createWheelDiagnosticRun({ profile: "detailed", now: () => time });
  time = 1100; run.ready(); time = 1500; run.intro();
  const intro = { sequence: { sequence: "intro", playing: true }, phase: "ready" };
  for (const t of [1500, 1501, 1520, 1540, 1740]) run.frame(t, 3, true, intro);
  run.frame(6000, 1, false, { phase: "ready" });
  for (const t of [10000, 10020, 10040]) run.frame(t, 2, true, { phase: "spinning" });
  time = 11000; const result = run.finish("complete");
  assert.equal(result.loadingMs, 1000); assert.equal(result.introWaitMs, 1400);
  assert.equal(result.phases.intro.samples, 3); assert.equal(result.phases.intro.max, 200);
  assert.equal(result.phases.spin.fps, 50); assert.equal(result.phases.spin.samples, 2);
  assert.equal(result.phases.spin.max, 20);
  run.frame(12000, 50, true, { phase: "spinning" });
  assert.deepEqual(run.snapshot(), result);
});

test("hidden time is counted but never pollutes FPS; slow 2D frames are measured too", () => {
  let time = 0;
  const run = createWheelDiagnosticRun({ profile: "flat", now: () => time });
  run.frame(0, 1, true, { phase: "spinning" }); run.frame(20, 1, true, { phase: "spinning" });
  time = 30; run.visibility(true); time = 5030; run.visibility(false);
  run.frame(5040, 1, true, { phase: "spinning" }); run.frame(5080, 1, true, { phase: "spinning" });
  const result = run.finish("skipped", "Trop lent");
  assert.equal(result.hiddenMs, 5000); assert.equal(result.hiddenCount, 1);
  assert.equal(result.phases.spin.samples, 2); assert.equal(result.phases.spin.max, 40);
  assert.equal(result.status, "skipped"); assert.equal(result.loadingMs, null);
});

test("a stall before the first intro frame is retained in the diagnostic", () => {
  let time = 0; const run = createWheelDiagnosticRun({ profile: "detailed", now: () => time });
  time = 100; run.ready(); time = 200; run.intro();
  time = 500; run.frame(500, 10, true, { sequence: { sequence: "intro", playing: true } });
  assert.equal(run.snapshot().phases.intro.max, 300);
});

test("fixed diagnostic quality never downgrades on slow frames and leaves saved choices alone", () => {
  for (const profile of ["detailed", "balanced", "light"]) {
    const monitor = createWheelPerformance({ initial: { preference: profile, profile } });
    assert.equal(monitor.benchmark([200, 200, 200], [150, 150, 150], profile), profile);
    for (let t = 0; t < 10000; t += 200) monitor.frame(t, 150, true);
    assert.equal(monitor.snapshot().profile, profile);
  }
});

test("loading reports distinguish foreground waiting from time in a hidden tab", () => {
  let time = 0; const run = createWheelDiagnosticRun({ profile: "detailed", now: () => time });
  time = 100; run.visibility(true); time = 5100; run.visibility(false);
  time = 6000; run.ready(); time = 7000;
  const result = run.finish("complete");
  assert.equal(result.loadingMs, 1000); assert.equal(result.loadingWallMs, 6000);
});

test("the questionnaire requires an explicit response to every item", () => {
  assert.equal(wheelSurveyComplete({}), false);
  assert.equal(wheelSurveyComplete(answers()), true);
  const partial = answers(); delete partial.loading;
  assert.equal(wheelSurveyComplete(partial), false);
  assert.throws(() => normalizeWheelDiagnostic({ ...report(), survey: partial }));
});

test("report schema bounds payload fields and rejects unknown modes / excess runs", () => {
  const value = report(); value.owner = { admin: true }; value.survey.comment = "a".repeat(2000);
  value.environment.userAgent = "b".repeat(1000); value.runs[0].loadingMs = -5;
  const normalized = normalizeWheelDiagnostic(value);
  assert.equal(normalized.owner, undefined); assert.equal(normalized.survey.comment.length, 1200);
  assert.equal(normalized.environment.userAgent.length, 600); assert.equal(normalized.runs[0].loadingMs, null);
  assert.throws(() => normalizeWheelDiagnostic({ ...report(), runs: [{ profile: "auto", status: "complete" }] }));
  assert.throws(() => normalizeWheelDiagnostic({ ...report(), runs: Array(3).fill(value.runs[0]) }));
  assert.throws(() => normalizeWheelDiagnostic({ ...report(), id: "../invalid" }));
});

test("pending feedback is recoverable without a working storage service", () => {
  assert.equal(readWheelDiagnosticDraft({ getItem() { throw Error("denied"); } }), null);
  assert.equal(readWheelDiagnosticDraft({ getItem: () => "broken" }), null);
  assert.equal(readWheelDiagnosticDraft({ getItem: () => JSON.stringify(report()) }).id, report().id);
});

test("reports preserve measured startup stages without accepting arbitrary fields", () => {
  const run = createWheelDiagnosticRun({ profile: "balanced" });
  run.timing({ graphics: 120, steps: { shaders: 120, arbitrary: 900 } });
  const normalized = normalizeWheelDiagnostic({ ...report(), runs: [run.finish("complete")] });
  assert.deepEqual(normalized.runs[0].timings.steps, { shaders: 120 });
  const old = normalizeWheelDiagnostic(report());
  assert.deepEqual(old.runs[0].timings.steps, {});
});
