import test from "node:test";
import assert from "node:assert/strict";
import { createWheelDragMotion } from "./wheelDragMotion.js";

test("wheel position builds up under the hand, then stops at the held angle without overshooting", () => {
  const motion = createWheelDragMotion(2, 0);
  motion.record(3, 100);
  const released = motion.position(100);
  assert.ok(released > 2 && released < 2.5);
  assert.ok(motion.position(150) > released && motion.position(150) < 3);
  assert.ok(Math.abs(motion.position(1000) - 3) < 0.00001);
  motion.record(2, 1100);
  assert.ok(motion.position(1100) > 2 && motion.position(1100) < 3);
  assert.ok(Math.abs(motion.position(2000) - 2) < 0.00001);
});

test("equal finger trajectories reach the same wheel angle at sparse or frequent touch sampling rates", () => {
  const reference = createWheelDragMotion(0, 0); reference.record(1.2, 400);
  for (const samples of [1, 12, 24, 48]) for (const sign of [-1, 1]) {
    const motion = createWheelDragMotion(0, 0);
    for (let i = 1; i <= samples; i++) {
      const time = i * 400 / samples;
      motion.record(sign * i * 1.2 / samples, time);
      motion.position(time + 8); motion.position(time + 16); // Display reads must not alter integration.
    }
    assert.ok(Math.abs(motion.position(400) - sign * reference.position(400)) < 1e-10);
  }
});

test("same-timestamp movement stays smooth and stale samples cannot rewind the drag", () => {
  const motion = createWheelDragMotion(0, 50);
  motion.record(1, 50);
  assert.equal(motion.position(50), 0);
  assert.ok(motion.position(66) > 0 && motion.position(66) < 1);
  const before = motion.position(100);
  motion.record(10, 40);
  assert.equal(motion.position(100), before);
});
