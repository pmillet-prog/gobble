import test from "node:test";
import assert from "node:assert/strict";
import { advanceTargetQuizPoints } from "../../../shared/targetQuizPoints.js";
import { buildTargetQuizProgressFrames, getTargetQuizProgressFrame } from "./targetQuizProgressAnimation.js";

test("recap visits the full gauge then the surplus, including losses after a milestone", () => {
  const before = { points: 9950, total: 9700, cycles: 2 };
  const steps = [100, -75, 100];
  const after = steps.reduce((current, delta) => advanceTargetQuizPoints(current, delta).after, before);
  const timeline = buildTargetQuizProgressFrames({ before, after, steps });
  const sampled = Array.from({ length: 1001 }, (_, i) => getTargetQuizProgressFrame(timeline, i / 1000));
  assert.ok(sampled.some(frame => frame.points === 10000 && frame.rewards === 1));
  assert.ok(sampled.some(frame => frame.points === 0));
  assert.ok(sampled.every(frame => frame.points >= 0 && frame.points <= 10000));
  assert.deepEqual(sampled.at(-1), { ...after, rewards: 1 });
  assert.equal(after.total, 9825);
  assert.equal(after.points, 100);
});
