import test from "node:test";
import assert from "node:assert/strict";
import { measureWheelRendering } from "./measureWheelRendering.js";

function fixture() {
  let callback, time = 0, draws = 0;
  const visibility = new EventTarget(); visibility.hidden = false;
  const abort = new AbortController();
  const measurement = measureWheelRendering({ signal: abort.signal, visibility,
    draw() { draws++; }, now: () => time, requestFrame(fn) { callback = fn; return 1; }, cancelFrame() { callback = null; } });
  return { measurement, abort, visibility, draws: () => draws, pending: () => Boolean(callback),
    tick(delta = 1000 / 60) { time += delta; const fn = callback; callback = null; fn?.(time); } };
}
test("the benchmark excludes a background pause and finishes from visible frames only", async () => {
  const app = fixture();
  for (let i = 0; i < 30; i++) app.tick();
  app.visibility.hidden = true; app.visibility.dispatchEvent(new Event("visibilitychange")); app.tick(20000);
  app.visibility.hidden = false; app.visibility.dispatchEvent(new Event("visibilitychange"));
  for (let i = 0; i < 90; i++) app.tick();
  const sample = await app.measurement;
  assert.ok(sample.intervals.every(ms => ms < 17)); assert.equal(app.pending(), false);
});
test("switching to 2D during calibration cancels its animation callback and settles loading", async () => {
  const app = fixture(); app.tick(); app.abort.abort();
  assert.equal(await app.measurement, null); assert.equal(app.pending(), false);
  app.tick(); assert.equal(app.draws(), 1);
});

test("extremely slow frames stop calibration before collecting eight costly samples", async () => {
  const app = fixture();
  for (let i = 0; i < 5; i++) app.tick(1100);
  const sample = await app.measurement;
  assert.ok(sample.intervals.every(ms => ms >= 1000)); assert.equal(app.pending(), false);
  assert.ok(app.draws() <= 5);
});
