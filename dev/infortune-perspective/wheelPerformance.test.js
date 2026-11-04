import test from "node:test";
import assert from "node:assert/strict";
import { createWheelPerformance, createWheelFrameGate, readWheelPerformance, summarizeWheelFrames, WHEEL_PERFORMANCE_KEY } from "./wheelPerformance.js";

function fixture(preference = "auto", profile = "balanced") {
  const values = new Map(), snapshots = [];
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const monitor = createWheelPerformance({ initial: { preference, profile }, storage, now: () => 10000,
    onChange: value => snapshots.push(value) });
  return { monitor, storage, values, snapshots };
}
const samples = (ms, count = 80) => Array(count).fill(ms);

test("automatic selection measures the actual scene and falls back to 2D only after light 3D is too slow", () => {
  const { monitor, storage } = fixture();
  assert.equal(monitor.benchmark(samples(40), []), "light");
  assert.equal(monitor.benchmark(samples(48), []), "flat");
  assert.deepEqual(readWheelPerformance(storage, {}, 11000), { preference: "auto", profile: "flat" });
  assert.equal(readWheelPerformance(storage, {}, 15 * 86400000).profile, "balanced", "An old automatic result is recalibrated");
});
test("manual quality is respected and manual 2D survives an expired benchmark", () => {
  const { monitor, storage } = fixture("detailed", "detailed");
  assert.equal(monitor.benchmark(samples(80), []), "detailed");
  monitor.setPreference("flat");
  assert.equal(readWheelPerformance(storage, {}, 100 * 86400000).profile, "flat");
  monitor.setPreference("auto"); assert.equal(monitor.snapshot().profile, "balanced");
});

test("a long startup does not classify the GPU or save an automatic 2D decision", () => {
  const auto = fixture(); auto.monitor.timings({ graphics: 9000 });
  assert.equal(auto.monitor.startupSlow({ step: "Shaders" }), false);
  assert.equal(auto.monitor.snapshot().profile, "balanced");
  assert.equal(auto.monitor.snapshot().timings.graphics, 9000);
  assert.equal(auto.storage.getItem(WHEEL_PERFORMANCE_KEY), undefined);
  auto.monitor.benchmark(samples(16), []);
  assert.equal(readWheelPerformance(auto.storage, {}, 11000).profile, "balanced");
  const manual = fixture("detailed", "detailed"); assert.equal(manual.monitor.startupSlow({ step: "Shaders" }), false);
  assert.equal(manual.monitor.snapshot().profile, "detailed");
});

test("legacy automatic fallback is retried while an explicit 2D choice remains", () => {
  const app = fixture();
  for (const preference of ["auto", "flat"]) {
    app.values.set(WHEEL_PERFORMANCE_KEY, JSON.stringify({ version: 1, at: 10000, profile: "flat", preference }));
    assert.equal(readWheelPerformance(app.storage, {}, 11000).profile, preference === "auto" ? "balanced" : "flat");
  }
});
test("a quality selected during calibration is not judged from the previous quality's sample", () => {
  const { monitor } = fixture(); monitor.setPreference("detailed");
  assert.equal(monitor.benchmark(samples(12), [], "balanced"), "detailed");
  assert.equal(monitor.snapshot().metrics, null);
});
test("unsupported or approximate hardware hints never alone force 2D, and denied storage is harmless", () => {
  assert.equal(readWheelPerformance(null).profile, "balanced");
  assert.equal(readWheelPerformance(null, { memory: 1, cores: 1 }).profile, "light");
  const storage = { getItem() { throw new Error(); }, setItem() { throw new Error(); } };
  assert.equal(readWheelPerformance(storage).profile, "balanced");
  const malformed = fixture(); malformed.values.set(WHEEL_PERFORMANCE_KEY, "invalid");
  assert.equal(readWheelPerformance(malformed.storage).profile, "balanced");
  const monitor = createWheelPerformance({ initial: { preference: "auto", profile: "balanced" }, storage });
  assert.doesNotThrow(() => monitor.setPreference("flat"));
});
test("isolated slow frames and idle/hidden periods do not cause an automatic downgrade", () => {
  const { monitor } = fixture(); let time = 0;
  for (let i = 0; i < 300; i++) { time += i === 30 ? 100 : 1000 / 60; monitor.frame(time, 2, true); }
  assert.equal(monitor.snapshot().profile, "balanced");
  monitor.resetSamples(); time += 20000;
  for (let i = 0; i < 220; i++) { time += 1000 / 60; monitor.frame(time, 2, true); }
  assert.equal(monitor.snapshot().profile, "balanced");
  monitor.frame(time + 50000, 0, false); monitor.frame(time + 60000, 2, true);
  assert.equal(monitor.snapshot().profile, "balanced");
});
test("sustained degradation waits for a held gesture to end; a stable 30 fps is acceptable in light mode", () => {
  const { monitor } = fixture();
  for (let t = 0; t < 3800; t += 40) monitor.frame(t, 20, true, false);
  assert.equal(monitor.snapshot().profile, "balanced"); assert.equal(monitor.snapshot().pending, "light");
  monitor.applyPending(); assert.equal(monitor.snapshot().profile, "light");
  for (let t = 4000; t < 11000; t += 1000 / 30) monitor.frame(t, 18, true);
  assert.equal(monitor.snapshot().profile, "light");
});
test("the report reveals recurring stutters even when average fps appears acceptable", () => {
  const metrics = summarizeWheelFrames([...samples(8, 70), ...samples(40, 30)]);
  assert.ok(metrics.fps > 50); assert.equal(metrics.p95, 40); assert.equal(metrics.slowRatio, 0.3);
});
test("render pacing caps 120 Hz at 60 or 30 draws without altering simulation timing", () => {
  for (const fps of [30, 60]) {
    const gate = createWheelFrameGate(); let rendered = 0;
    for (let i = 0; i < 120; i++) if (gate.due(i * 1000 / 120, fps)) rendered++;
    assert.equal(rendered, fps);
  }
});
