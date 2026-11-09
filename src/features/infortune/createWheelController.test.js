import test from "node:test";
import assert from "node:assert/strict";
import { createWheelController } from "./createWheelController.js";
import { PEG_PITCH } from "./wheelConfig.js";
import { CLASSIC_PAWL, NEEDLE_PAWL, PIVOT_PAWL } from "./wheelPawlModels.js";

function harness(options = {}) {
  let time = 0, sequence = 0, view, snapshot, clicks = 0;
  const frames = new Map(), results = [];
  const controller = createWheelController({
    random: () => 0,
    ...options,
    audio: { unlock() {}, tick() { clicks++; }, suspend() {}, resume() {}, dispose() {} },
    now: () => time,
    requestFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelFrame(id) { frames.delete(id); },
    render(state) { snapshot = { ...state }; },
    onChange(next) { view = next; },
    onResult(result) { results.push(result); },
  });
  controller.initialize();
  return { controller, frames, results, get view() { return view; }, get snapshot() { return snapshot; }, get clicks() { return clicks; },
    advance(ms) { time += ms; const pending = [...frames.values()]; frames.clear(); for (const run of pending) run(time); },
    finish(fps = 60) { for (let i = 0; i < fps * 25 && view.phase !== "finished"; i++) this.advance(1000 / fps); assert.equal(view.phase, "finished"); },
  };
}

test('the same maximum-power throw from uniformly shifted starting wedges reaches all 24 results', () => {
  const indices = new Set();
  for (let i = 0; i < 24; i++) {
    const app = harness({ random: () => (i + .5) / 24 });
    app.controller.beginCharge(); app.advance(1500); app.controller.endCharge(); app.finish();
    indices.add(app.results[0].index); app.controller.dispose();
  }
  assert.equal(indices.size, 24);
});

test("same physical throw yields identical result at 30, 60 and 144 Hz, exactly once", () => {
  const outcomes = [];
  for (const fps of [30, 60, 144]) {
    const app = harness();
    assert.equal(app.frames.size, 0);
    app.controller.beginCharge();
    app.advance(900);
    assert.ok(app.controller.endCharge());
    app.finish(fps);
    outcomes.push(app.results[0]);
    assert.equal(app.frames.size, 0);
    app.advance(5000);
    assert.equal(app.results.length, 1);
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
});

test("deadline launches once, cancels held input and never grants a precision bonus", () => {
  for (const gesture of ["ready", "aiming", "dragging"]) {
    const app = harness({ launchGame: { gestureMode: "power" } });
    if (gesture === "aiming") app.controller.clickLaunch();
    if (gesture === "dragging") app.controller.beginDrag(0);
    assert.equal(app.controller.autoLaunch(), true);
    assert.equal(app.view.phase, "spinning");
    assert.equal(app.controller.autoLaunch(), false);
    app.finish();
    assert.equal(app.results.length, 1);
    assert.equal(app.results[0].launchQuality, undefined);
    assert.equal(app.controller.autoLaunch(), false);
  }
  const locked = harness({ inputLocked: true });
  assert.equal(locked.controller.autoLaunch(), false);
  locked.controller.setInputLocked(false); locked.controller.pause();
  assert.equal(locked.controller.autoLaunch(), false);
  locked.controller.resume();
  assert.equal(locked.controller.autoLaunch(), true);
  locked.controller.dispose();
});

test("live throws catch up after suspension to the same sector without duplicate results", () => {
  const foreground = harness({ catchUpElapsed: true }); foreground.controller.autoLaunch(); foreground.finish();
  const suspended = harness({ catchUpElapsed: true }); suspended.controller.autoLaunch(); suspended.advance(30_000);
  assert.equal(suspended.view.phase, "finished");
  assert.deepEqual(suspended.results, foreground.results);
  assert.equal(suspended.clicks, 0); suspended.advance(60_000); assert.equal(suspended.results.length, 1);
  suspended.controller.dispose(); foreground.controller.dispose();
});

test("a custom rod radius survives a complete spin, cancellation and reset", () => {
  const app = harness({ pegRadius: 1.6 });
  assert.equal(app.snapshot.pegRadius, 1.6);
  app.controller.beginDrag(0); app.controller.drag(0.1); app.controller.cancelGesture();
  assert.equal(app.snapshot.pegRadius, 1.6);
  app.controller.beginCharge(); app.advance(900); assert.ok(app.controller.endCharge());
  app.finish(); app.controller.reset();
  assert.equal(app.snapshot.pegRadius, 1.6);
  app.controller.dispose();
});

for (const model of [NEEDLE_PAWL, PIVOT_PAWL]) test(`${model.id} can be selected between throws and preserves results across frame rates`, () => {
  const outcomes = [];
  for (const fps of [30, 60, 144]) {
    const app = harness({ pegRadius: 1.3 });
    assert.equal(app.controller.setPawlModel(model), true);
    assert.equal(app.snapshot.pawlModel, model);
    app.controller.beginCharge(); app.advance(900); app.controller.endCharge();
    assert.equal(app.controller.setPawlModel(CLASSIC_PAWL), false);
    app.finish(fps); outcomes.push(app.results[0]); app.controller.reset();
    assert.equal(app.snapshot.pawlModel, model);
    assert.equal(app.controller.setPawlModel(CLASSIC_PAWL), true);
    assert.equal(app.snapshot.pawlModel, CLASSIC_PAWL); assert.equal(app.view.result, null);
    app.controller.dispose();
  }
  assert.deepEqual(outcomes[0], outcomes[1]); assert.deepEqual(outcomes[1], outcomes[2]);
});

test("weak charge and slow drag produce no reward and can be retried", () => {
  const app = harness();
  app.controller.beginCharge(); app.advance(120);
  assert.equal(app.controller.endCharge(), false);
  assert.equal(app.view.phase, "ready");
  assert.equal(app.frames.size, 0);
  assert.ok(app.view.message);
  app.controller.beginDrag(0); app.advance(60); app.controller.drag(0.1);
  assert.equal(app.controller.endDrag(), false);
  assert.equal(app.results.length, 0);
  assert.equal(app.view.phase, "ready");
});

test("direct mouse/touch-style gesture launches; a spinning wheel cannot be grabbed or reset", () => {
  const app = harness();
  app.controller.beginDrag(3); app.advance(40); app.controller.drag(-2.8); app.advance(35); app.controller.drag(-2.4);
  assert.equal(app.controller.endDrag(), true);
  assert.equal(app.controller.beginDrag(0), false);
  assert.equal(app.controller.beginCharge(), false);
  app.controller.reset();
  assert.equal(app.view.phase, "spinning");
  app.finish();
  assert.equal(app.results.length, 1);
  app.controller.reset();
  assert.equal(app.view.phase, "ready");
  assert.equal(app.frames.size, 0);
});

test("pointer cancellation restores the starting position without producing a result", () => {
  const app = harness(), initial = app.snapshot.angle;
  app.controller.beginDrag(0); app.advance(40); app.controller.drag(1);
  app.controller.cancelGesture();
  assert.equal(app.snapshot.angle, initial);
  assert.equal(app.view.phase, "ready");
  assert.equal(app.frames.size, 0);
  assert.equal(app.results.length, 0);
});

test("drag rendering and audio use the same contact; a weak release lets the pawl settle", () => {
  const app = harness(), initial = app.snapshot.angle;
  app.controller.beginDrag(0);
  app.controller.drag(0.025 - initial);
  assert.equal(app.snapshot.pawl, 0);
  app.controller.drag(-initial);
  assert.ok(app.snapshot.pawl > 0, "Pawl must already move in the same render as the peg, before any animation frame");
  assert.equal(app.clicks, 0, "No release sound merely for crossing the wheel axis");
  app.controller.drag(-0.14 - initial);
  assert.equal(app.clicks, 1);
  assert.ok(app.snapshot.pawl > 0);
  assert.equal(app.controller.endDrag(), false);
  assert.ok(app.snapshot.pawl > 0, "A rejected fling must not teleport the pawl to neutral");
  for (let i = 0; i < 360; i++) app.advance(1000 / 60);
  assert.equal(app.view.phase, "ready");
  assert.ok(Math.abs(app.snapshot.pawl) < 0.001);
  assert.equal(app.frames.size, 0);
  assert.equal(app.results.length, 0);
});

test("releasing a strongly bent blade below the launch threshold returns the wheel without awarding a result", () => {
  const app = harness(), initial = app.snapshot.angle, loadedAngle = PEG_PITCH + 0.1;
  app.controller.beginDrag(0);
  app.controller.drag(loadedAngle - initial);
  assert.ok(Math.abs(app.snapshot.pawl) > 1.4);
  assert.equal(app.controller.endDrag(), false);
  for (let i = 0; i < 360; i++) app.advance(1000 / 60);
  assert.ok(app.snapshot.angle < loadedAngle - 0.08);
  assert.ok(Math.abs(app.snapshot.pawl) < 0.001);
  assert.equal(app.frames.size, 0);
  assert.equal(app.results.length, 0);
});

test("hidden tab pauses physics, and disposal cancels all frames without a late result", () => {
  const app = harness();
  app.controller.beginCharge(); app.advance(900); app.controller.endCharge(); app.advance(16); app.advance(16);
  const angle = app.snapshot.angle;
  app.controller.pause(); app.advance(60_000);
  assert.equal(app.frames.size, 0);
  assert.equal(app.snapshot.angle, angle);
  app.controller.resume(); app.advance(16);
  assert.equal(app.snapshot.angle, angle);
  app.advance(16);
  assert.notEqual(app.snapshot.angle, angle);
  app.controller.dispose(); app.advance(60_000);
  assert.equal(app.frames.size, 0);
  assert.equal(app.results.length, 0);
  assert.equal(app.controller.beginCharge(), false);
});
