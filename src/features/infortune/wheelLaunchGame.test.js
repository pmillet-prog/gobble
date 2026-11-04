import test from "node:test";
import assert from "node:assert/strict";
import { createWheelController } from "./createWheelController.js";
import { MAX_LAUNCH_SPEED, MIN_LAUNCH_SPEED } from "./wheelConfig.js";
import { GESTURE_REFERENCE_SPEED, GESTURE_SMOOTHING_MS } from "./wheelGesturePower.js";
import { createWheelLaunchGame, launchChallenge, launchQuality, gaugePosition, GOOD_WINDOW, PERFECT_WINDOW } from "./wheelLaunchGame.js";
import { skillCurvePoint } from "./wheelSkillShot.js";

function harness(launchGame = {}) {
  let time = 0, sequence = 0, snapshot, view, meter;
  const frames = new Map(), launches = [], results = [];
  const controller = createWheelController({ launchGame, pegRadius: 1.3,
    now: () => time,
    requestFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelFrame(id) { frames.delete(id); },
    render(state, phase, power, game) { snapshot = { ...state }; meter = game; }, onChange(value) { view = value; },
    onLaunch(value) { launches.push(value); }, onResult(value) { results.push(value); },
  });
  controller.initialize();
  return { controller, frames, launches, results, get snapshot() { return snapshot; }, get view() { return view; }, get meter() { return meter; },
    get time() { return time; },
    advance(ms) { time += ms; const work = [...frames.values()]; frames.clear(); work.forEach(frame => frame(time)); },
    finish(fps = 60) { for (let i = 0; i < fps * 25 && view.phase !== "finished"; i++) this.advance(1000 / fps); assert.equal(view.phase, "finished"); },
  };
}

function perfectClicks(app) {
  const target = app.view.launchGame.targets;
  assert.equal(app.controller.clickLaunch(), true);
  app.advance(target.power * target.powerDuration);
  assert.equal(app.controller.clickLaunch(), true);
}

function perfectGesture(app, direction, { release = true, angularSpeed = 3 } = {}) {
  const target = app.view.launchGame.targets.power, duration = 400;
  const speed = -GESTURE_REFERENCE_SPEED * Math.log1p(-target) / -Math.expm1(-duration / GESTURE_SMOOTHING_MS);
  app.controller.beginDrag(0);
  for (let i = 1; i <= 20; i++) {
    app.advance(20);
    app.controller.drag(direction * angularSpeed * i * 0.02, app.time, direction * speed * i * 0.02);
  }
  if (release) assert.equal(app.controller.endDrag(), true);
}

test("only power determines the bonus, with symmetric good/perfect zones and a real minimum", () => {
  const target = launchChallenge();
  for (const sign of [-1, 1]) {
    assert.equal(launchQuality(target.power + sign * PERFECT_WINDOW, target).kind, "perfect");
    assert.equal(launchQuality(target.power + sign * GOOD_WINDOW, target).kind, "good");
    assert.equal(launchQuality(target.power + sign * (GOOD_WINDOW + 0.001), target).bonus, 0);
  }
  assert.equal(launchQuality(target.power, target).bonus, 100);
  assert.equal(launchQuality(target.power + 0.06, target).bonus, 50);
  assert.equal(launchQuality(0.1, target).bonus, 0);
  assert.equal(launchQuality(NaN, target).bonus, 0);
});

test("one visible target stays fixed during preparation and changes only after a completed launch", () => {
  const game = createWheelLaunchGame(), target = game.view(0).targets;
  game.beginClick(0);
  for (const time of [0, 500, 3000]) assert.equal(game.view(time).targets, target);
  assert.equal(game.view(0).stage, "power");
  assert.equal(gaugePosition(250, 1000), 0.25); assert.equal(gaugePosition(1750, 1000), 0.25);
  assert.equal(gaugePosition(-20, 1000), 0);
  game.cancel(); assert.equal(game.view(0).targets, target);
  game.commit(launchQuality(target.power, target)); game.next();
  assert.notDeepEqual(game.view(0).targets, target);
});

test("the fast click gauge scores the press timestamp, not delayed input handling", () => {
  const app = harness(), target = app.view.launchGame.targets;
  assert.ok(target.powerDuration >= 440 && target.powerDuration <= 560);
  app.controller.clickLaunch(0);
  const pressedAt = target.power * target.powerDuration;
  app.advance(pressedAt + 90);
  assert.equal(app.controller.clickLaunch(pressedAt), true);
  assert.equal(app.view.launchQuality.kind, "perfect");
  assert.ok(Math.abs(app.meter.power - target.power) < 1e-10);
  app.advance(500);
  assert.equal(app.meter.power, app.view.launchQuality.power, "The stopped gauge stays on the scored power");
  app.controller.dispose();
});

test("an insufficient throw keeps its exact power and verdict until the next attempt", () => {
  const app = harness(), target = app.view.launchGame.targets;
  app.controller.clickLaunch(); app.advance(target.powerDuration * 0.2);
  assert.equal(app.controller.clickLaunch(), false);
  const quality = app.view.launchQuality;
  assert.equal(quality.label, "Puissance insuffisante");
  assert.equal(app.view.launchGame.stage, "rejected");
  app.advance(1000);
  assert.equal(app.meter.power, quality.power);
  assert.equal(app.launches.length, 0);
  app.controller.beginDrag(0);
  assert.equal(app.view.launchQuality, null);
  assert.equal(app.meter.targets, target);
  app.controller.dispose();
});

test("the release replay freezes successful and rejected traces and clears on a new attempt", () => {
  for (const duration of [1200, 4000]) {
    const app = harness({ gestureMode: "trace" });
    app.controller.beginDrag(0, app.time, { x: 0.2, y: 0.7, width: 1.4, height: 1 });
    const { guide } = app.view.launchGame.skill;
    for (let i = 1; i <= 40; i++) {
      app.advance(duration / 40);
      app.controller.drag(i * 0.02, app.time, i * 0.01, { gesturePoint: skillCurvePoint(guide, i / 40) });
    }
    const accepted = app.controller.endDrag();
    assert.equal(accepted, duration === 1200);
    const replay = app.view.launchGame.skillResult;
    assert.ok(replay);
    assert.ok(replay.progress > 0.99);
    assert.equal(replay.power, app.view.launchQuality.power);
    assert.equal(app.view.launchGame.skill, null);
    app.advance(2200);
    assert.equal(app.meter.skillResult, replay, "Animation frames reuse the exact release, without decaying its power");
    if (accepted) app.finish();
    app.controller.reset();
    assert.equal(app.view.launchGame.skillResult, null);
    app.controller.beginDrag(0, app.time, { x: 0.2, y: 0.7, width: 1.4, height: 1 });
    assert.equal(app.view.launchGame.skillResult, null);
    app.controller.cancelGesture();
    assert.equal(app.view.launchGame.skillResult, null);
    app.controller.dispose();
  }
});

test("the wheel follows the hand equally in both directions, including a complete back-and-forth", () => {
  for (const direction of [-1, 1]) for (const steps of [1, 30]) {
    const app = harness(), initial = app.snapshot.angle;
    app.controller.beginDrag(0);
    for (let i = 1; i <= steps; i++) app.controller.drag(direction * i / steps);
    assert.ok(Math.abs(app.snapshot.angle - initial - direction) < 1e-10);
    app.controller.drag(0);
    assert.ok(Math.abs(app.snapshot.angle - initial) < 1e-10);
    app.controller.cancelGesture(); app.controller.dispose();
  }
});

test("two clicks award exactly one bonus and preserve the physical result at different frame rates", () => {
  const results = [];
  for (const fps of [30, 60, 144]) {
    const app = harness(); perfectClicks(app);
    assert.equal(app.view.phase, "spinning"); assert.equal(app.launches.length, 1);
    assert.equal(app.launches[0].quality.bonus, 100);
    assert.equal(app.controller.clickLaunch(), false);
    assert.equal(app.controller.setLaunchOptions({ rewards: { perfect: 500 } }), false);
    app.finish(fps); results.push(app.results[0]); app.advance(5000);
    assert.equal(app.launches.length, 1); assert.equal(app.results.length, 1);
    const target = app.view.launchGame.targets; app.controller.reset();
    assert.notDeepEqual(app.view.launchGame.targets, target); assert.equal(app.frames.size, 0);
    app.controller.dispose();
  }
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
});

test("screen slide speed determines power in both directions regardless of perspective-amplified angle", () => {
  for (const direction of [-1, 1]) for (const angularSpeed of [2, 10]) {
    const app = harness(); perfectGesture(app, direction, { release: false, angularSpeed });
    const displayed = app.meter.power;
    assert.equal(app.controller.endDrag(), true);
    assert.equal(app.launches.length, 1); assert.equal(app.launches[0].quality.kind, "perfect");
    assert.equal(Math.sign(app.snapshot.velocity), direction);
    assert.ok(Math.abs(Math.abs(app.snapshot.velocity) / MAX_LAUNCH_SPEED - displayed) < 1e-10);
    app.finish(); assert.equal(app.results[0].launchQuality.bonus, 100); app.controller.dispose();
  }
});

test("pausing the finger smoothly loses launch power and cannot retain a stored bonus", () => {
  const app = harness(); perfectGesture(app, 1, { release: false });
  const before = app.meter.power;
  app.advance(30); assert.equal(app.meter.power, before);
  app.advance(50); assert.ok(app.meter.power < before && app.meter.power > 0);
  app.advance(200); assert.ok(app.meter.power < MIN_LAUNCH_SPEED / MAX_LAUNCH_SPEED);
  assert.equal(app.controller.endDrag(), false);
  assert.equal(app.launches.length, 0); assert.equal(app.view.phase, "ready"); app.controller.dispose();
});

test("changing rewards never changes launch velocity or the resulting sector", () => {
  const outcomes = [];
  for (const rewards of [{ good: 50, perfect: 100 }, { good: 0, perfect: 0 }]) {
    const app = harness({ rewards }); perfectGesture(app, 1); app.finish();
    const { launchQuality: quality, ...physical } = app.results[0]; outcomes.push(physical);
    assert.equal(quality.bonus, rewards.perfect); app.controller.dispose();
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
});

test("a weak click, cancellation or hidden tab cannot award a bonus or leave an active animation", () => {
  const app = harness(), initial = app.snapshot.angle;
  app.controller.clickLaunch();
  assert.equal(app.controller.clickLaunch(), false);
  assert.equal(app.launches.length, 0); assert.equal(app.view.phase, "ready");
  app.controller.clickLaunch(); app.advance(400); app.controller.pause(); app.advance(60000);
  assert.equal(app.snapshot.angle, initial); assert.equal(app.frames.size, 0); assert.equal(app.launches.length, 0);
  app.controller.resume(); assert.equal(app.view.phase, "ready");
  app.controller.beginDrag(0); app.advance(100); app.controller.drag(0.02, app.time, 0.005);
  assert.equal(app.controller.endDrag(), false); assert.equal(app.launches.length, 0);
  app.controller.dispose(); assert.equal(app.controller.clickLaunch(), false); assert.equal(app.frames.size, 0);
});

test("both gesture variants launch real physics once, and rewards cannot influence the result", () => {
  const origin = { x: 0.2, y: 0.6, width: 1.4, height: 1 };
  for (const gestureMode of ["sling", "trace"]) {
    const outcomes = [];
    for (const bonus of [100, 0]) {
      const app = harness({ gestureMode, rewards: { perfect: bonus } });
      app.controller.beginDrag(0, app.time, origin);
      const skill = app.view.launchGame.skill;
      assert.equal(skill.mode, gestureMode);
      for (let index = 1; index <= 18; index++) {
        app.advance(300 / 18);
        const point = gestureMode === "trace" ? skillCurvePoint(skill.curve, index / 18 * (0.76 + 0.61803398875 * 0.12))
          : app.meter.skill.goal;
        app.controller.drag(index * 0.02, app.time, index * 0.02, { gesturePoint: point });
      }
      assert.equal(app.controller.endDrag(), true);
      assert.equal(app.launches[0].quality.kind, "perfect");
      assert.equal(app.launches[0].quality.bonus, bonus);
      assert.equal(app.controller.endDrag(), false);
      assert.equal(app.launches.length, 1);
      app.finish();
      const { launchQuality, ...physical } = app.results[0]; outcomes.push(physical);
      app.controller.dispose();
    }
    assert.deepEqual(outcomes[0], outcomes[1]);
  }
});

test("variant selection keeps the click game, input locks and gesture cancellation functional", () => {
  for (const gestureMode of ["sling", "trace"]) {
    const app = harness({ gestureMode });
    app.controller.setInputLocked(true); assert.equal(app.controller.beginDrag(0), false);
    assert.equal(app.controller.setLaunchOptions({ gestureMode }), true);
    assert.equal(app.controller.beginDrag(0), false, "Changing the mode never bypasses the intro lock");
    app.controller.setInputLocked(false);
    app.controller.beginDrag(0, app.time, { x: 0.2, y: 0.6, width: 1, height: 1 });
    app.controller.cancelGesture(); assert.equal(app.view.phase, "ready"); assert.equal(app.view.launchGame.skill, null);
    assert.equal(app.launches.length, 0);
    perfectClicks(app); assert.equal(app.launches[0].quality.kind, "perfect");
    assert.equal(app.view.launchGame.scoringMode, "power");
    app.controller.dispose();
  }
});
