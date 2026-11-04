import test from "node:test";
import assert from "node:assert/strict";
import { createGesturePower } from "./wheelGesturePower.js";
import { MAX_LAUNCH_SPEED, MIN_LAUNCH_SPEED } from "./wheelConfig.js";

function slide(speed, steps = 24) {
  const gesture = createGesturePower(); gesture.reset(0);
  for (let i = 1; i <= steps; i++) gesture.record(speed * 0.4 * i / steps, 400 * i / steps);
  return gesture;
}

test("power progresses across slow, medium and fast slides without saturating ordinary gestures", () => {
  const powers = [0.5, 1, 1.5, 2, 3, 5].map(speed => slide(speed).velocity(400) / MAX_LAUNCH_SPEED);
  assert.ok(powers[0] < MIN_LAUNCH_SPEED / MAX_LAUNCH_SPEED);
  assert.ok(powers[1] > MIN_LAUNCH_SPEED / MAX_LAUNCH_SPEED);
  assert.ok(powers[3] > 0.6 && powers[3] < 0.7);
  assert.ok(powers[5] < 0.95);
  for (let i = 1; i < powers.length; i++) assert.ok(powers[i] > powers[i - 1] + 0.07);
});

test("equal finger speeds produce equal power in both directions and at different event rates", () => {
  const reference = slide(2).velocity(400);
  for (const steps of [1, 12, 24, 48]) for (const direction of [-1, 1]) {
    assert.ok(Math.abs(slide(2 * direction, steps).velocity(400) - reference * direction) < 1e-10);
  }
});

test("steady slow slides do not fall and jump between input samples and display frames", () => {
  for (const hz of [30, 60, 120]) {
    const gesture = createGesturePower(); gesture.reset(0);
    let position = 0;
    const interval = 1000 / hz;
    for (let i = 1; i <= hz; i++) {
      position += 0.5 / hz;
      const time = interval * i;
      gesture.record(position, time);
      const sampled = gesture.velocity(time);
      for (const offset of [0.1, 0.5, 0.9]) {
        assert.equal(gesture.velocity(time + interval * offset), sampled);
      }
    }
  }
});

test("a pause or reversal dissipates the previous slide instead of retaining a charged impulse", () => {
  const gesture = slide(2), released = gesture.velocity(400);
  assert.equal(gesture.velocity(430), released, "Allow normal sample/release latency");
  assert.ok(gesture.velocity(480) < released);
  assert.ok(gesture.velocity(570) < MIN_LAUNCH_SPEED);
  gesture.record(0.5, 550);
  assert.ok(gesture.velocity(550) < 0);
  gesture.reset(600); assert.equal(gesture.velocity(600), 0);
});
