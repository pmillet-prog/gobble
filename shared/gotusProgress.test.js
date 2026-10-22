import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGotusProgress } from "./gotusProgress.js";

test("Gotus keeps a lifetime total and a ten-word reward gauge", () => {
  assert.deepEqual(normalizeGotusProgress(9), { totalWins: 9, words: 9, cycles: 0, target: 10, rewardAmount: 500 });
  assert.deepEqual(normalizeGotusProgress({ totalWins: 10 }), { totalWins: 10, words: 0, cycles: 1, target: 10, rewardAmount: 500 });
  assert.deepEqual(normalizeGotusProgress({ totalWins: 109 }), { totalWins: 109, words: 9, cycles: 10, target: 10, rewardAmount: 500 });
  for (const value of [null, undefined, -1, NaN, Infinity, 2.5]) assert.equal(normalizeGotusProgress(value).totalWins, 0);
});
