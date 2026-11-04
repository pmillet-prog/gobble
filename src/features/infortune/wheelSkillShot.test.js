import test from "node:test";
import assert from "node:assert/strict";
import { createWheelSkillShot, skillCurvePoint } from "./wheelSkillShot.js";
import { MIN_LAUNCH_SPEED, MAX_LAUNCH_SPEED } from "./wheelConfig.js";

const origin = { x: 0.2, y: 0.6, width: 1.4, height: 1 };
const rewards = { good: 50, perfect: 100 };
function trace(fps = 60, duration = 300, deviation = 0) {
  const shot = createWheelSkillShot("trace", origin, 0);
  const initial = shot.snapshot(0), targetProgress = 0.76 + 0.61803398875 * 0.12;
  const count = Math.round(fps * duration / 1000);
  for (let index = 1; index <= count; index++) {
    const progress = index / count, point = skillCurvePoint(initial.curve, progress * targetProgress);
    point.y += Math.sin(progress * Math.PI) * deviation;
    shot.record(point, progress * duration, progress * 0.4);
  }
  return shot;
}

test("the sling releases stored stretch, scores position independently and moves its visible target", () => {
  const shot = createWheelSkillShot("sling", origin, 0), goal = shot.snapshot(200).goal;
  shot.record(goal, 200, 0.3);
  assert.equal(shot.quality(200, rewards).kind, "perfect");
  const velocity = shot.velocity(200);
  assert.ok(velocity < -MIN_LAUNCH_SPEED && velocity >= -MAX_LAUNCH_SPEED);
  assert.equal(shot.quality(200, { good: 0, perfect: 0 }).bonus, 0);
  assert.equal(shot.velocity(900), velocity, "Elastic tension remains when the finger stops");
  assert.notDeepEqual(shot.snapshot(675).goal, goal);
  assert.notEqual(shot.quality(675, rewards).kind, "perfect", "Waiting at a fixed point does not preserve perfect timing");
  shot.record(origin, 1000, 0); assert.equal(shot.quality(1000, rewards).bonus, 0);
  assert.equal(Math.abs(shot.velocity(1000)), 0);
});

test("a clean trace remains playable from 0.3 to 1.5 seconds at 30, 60 and 120 Hz", () => {
  for (const fps of [30, 60, 120]) for (const duration of [300, 600, 800, 1000, 1500]) {
    const shot = trace(fps, duration), state = shot.snapshot(duration);
    assert.equal(shot.quality(duration, rewards).kind, "perfect", `${fps} Hz, ${duration} ms`);
    assert.ok(state.pathError < 0.002);
    assert.ok(shot.velocity(duration) >= MIN_LAUNCH_SPEED);
  }
});

test("lifting the finger preserves the displayed power briefly, but waiting cannot bank a bonus", () => {
  const shot = trace(60, 1200), released = shot.snapshot(1200);
  assert.equal(released.precision, "perfect");
  assert.equal(shot.quality(1350, rewards).kind, "perfect");
  assert.equal(shot.snapshot(1350).power, released.power);
  assert.equal(shot.quality(1800, rewards).bonus, 0);
});

test("a clean trace released in the green ring earns the good bonus instead of perfect", () => {
  const shot = trace(60, 1000), { goal } = shot.snapshot(1000);
  shot.record({ x: goal.x, y: goal.y - 0.03 }, 1020, 0.4);
  const quality = shot.quality(1020, rewards);
  assert.equal(quality.kind, "good");
  assert.equal(quality.bonus, 50);
});

test("the displayed guide ends at the scoring target and can be read before starting the gesture", () => {
  const shot = createWheelSkillShot("trace", origin, 0);
  assert.match(shot.snapshot(0).hint, /flèches/);
  assert.deepEqual(skillCurvePoint(shot.snapshot(0).guide, 1), shot.snapshot(0).goal);
  const { guide } = shot.snapshot(1200);
  for (let i = 1; i <= 40; i++) shot.record(skillCurvePoint(guide, i / 40), 1200 + 800 * i / 40, i / 100);
  assert.equal(shot.quality(2000, rewards).kind, "perfect");
  assert.equal(shot.snapshot(2000).canLaunch, true);
});

test("hitting the target cannot erase a bad trace; slow movement and a pause cannot keep a bonus", () => {
  const crooked = trace(60, 300, 0.18);
  assert.equal(crooked.quality(300, rewards).bonus, 0);
  assert.equal(crooked.quality(300, rewards).reason, "path");
  assert.ok(crooked.velocity(300) >= MIN_LAUNCH_SPEED, "A missed bonus still launches with the measured impulse");
  const slow = trace(60, 1800); assert.equal(slow.quality(1800, rewards).bonus, 0);
  assert.equal(slow.quality(1800, rewards).reason, "power");
  const stopped = trace(); assert.equal(stopped.quality(700, rewards).bonus, 0);
});

test("an overshoot and a backwards correction give explicit feedback, and the drawn trace stays bounded", () => {
  const shot = trace(), initial = shot.snapshot(300);
  shot.record(skillCurvePoint(initial.curve, 1), 350, 0.5);
  assert.equal(shot.quality(350, rewards).reason, "target");
  assert.match(shot.snapshot(350).hint, /dépassée/);
  shot.record(initial.goal, 400, 0.4);
  assert.equal(shot.quality(400, rewards).bonus, 0);
  assert.match(shot.snapshot(400).hint, /retours/);
  const reversed = createWheelSkillShot("trace", origin, 0);
  for (const [position, time] of [[0.5, 150], [0.2, 200], [0.76 + 0.61803398875 * 0.12, 400]]) {
    reversed.record(skillCurvePoint(initial.curve, position), time, position);
  }
  assert.equal(reversed.quality(400, rewards).reason, "backtrack");
  for (let i = 1; i <= 1000; i++) shot.record(skillCurvePoint(initial.guide, i % 2), 400 + i * 10, 0.4);
  assert.ok(shot.snapshot(10400).trail.length <= 161);
});

test("targets stay inside wide or tall viewports from all four edges, and attempts vary", () => {
  for (const [width, height] of [[1, 2], [2, 1]]) for (const x of [0.01, width - 0.01, width / 2]) for (const y of [0.01, height - 0.01, height / 2]) {
    for (const mode of ["sling", "trace"]) {
      const shot = createWheelSkillShot(mode, { x, y, width, height }, 0);
      for (const time of [0, 225, 675]) {
        const { goal } = shot.snapshot(time);
        assert.ok(goal.x > 0.05 && goal.x < width - 0.05);
        assert.ok(goal.y > 0.05 && goal.y < height - 0.05);
      }
    }
  }
  assert.notDeepEqual(createWheelSkillShot("trace", origin, 0, 0).snapshot(0).goal,
    createWheelSkillShot("trace", origin, 0, 1).snapshot(0).goal);
});
