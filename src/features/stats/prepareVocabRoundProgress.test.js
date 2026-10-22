import assert from "node:assert/strict";
import test from "node:test";
import { prepareVocabRoundProgress } from "./prepareVocabRoundProgress.js";

const recorded = {
  newVocabWords: ["zebre"],
  newWeeklyVocabWords: ["ane", "zebre"],
  vocabProgress: { status: "recorded", beforeCount: 99, afterCount: 100 },
  vocabWeeklyRace: { beforeCount: 10, afterCount: 12 },
};

test("a complete result starts vocabulary immediately despite a pending status request", async () => {
  let resolveSnapshot;
  const snapshot = new Promise(resolve => { resolveSnapshot = resolve; });
  const ready = [];
  let refreshes = 0;
  const pending = prepareVocabRoundProgress({
    result: recorded,
    requestSnapshot: () => { refreshes++; return snapshot; },
  }, progress => ready.push(progress));
  assert.equal(ready.length, 1);
  assert.equal(ready[0].count, 100);
  assert.equal(ready[0].weeklyCount, 12);
  assert.deepEqual(ready[0].newWeeklyWords, ["ane", "zebre"]);
  await Promise.resolve();
  assert.equal(refreshes, 1, "profile counters still refresh in the background");
  resolveSnapshot({ count: 800, weeklyCount: 200 });
  await pending;
  assert.equal(ready.length, 1, "a late response cannot replay or replace the animation");
});

test("a failed status refresh cannot suppress a recorded zero-gain round", async () => {
  const ready = [];
  const pending = prepareVocabRoundProgress({
    result: {
      ...recorded, newVocabWords: [], newWeeklyVocabWords: [],
      vocabProgress: { status: "recorded", beforeCount: 100, afterCount: 100 },
      vocabWeeklyRace: { beforeCount: 12, afterCount: 12 },
    },
    requestSnapshot: () => Promise.reject(new Error("offline")),
  }, progress => ready.push(progress));
  assert.equal(ready.length, 1);
  assert.equal(ready[0].delta, 0);
  assert.equal(ready[0].weeklyDelta, 0);
  await pending;
  assert.equal(ready.length, 1);
});

test("older incomplete results still wait for the counter snapshot", async () => {
  let resolveSnapshot;
  const snapshot = new Promise(resolve => { resolveSnapshot = resolve; });
  const ready = [];
  const pending = prepareVocabRoundProgress({
    result: { newVocabWords: ["zebre"], newWeeklyVocabWords: ["ane", "zebre"] },
    baseline: 99, weeklyBaseline: 10,
    requestSnapshot: () => snapshot,
  }, progress => ready.push(progress));
  assert.equal(ready.length, 0);
  resolveSnapshot({ count: 100, weeklyCount: 12 });
  await pending;
  assert.equal(ready.length, 1);
  assert.equal(ready[0].count, 100);
  assert.equal(ready[0].weeklyBaseline, 10);
});

test("an unavailable transaction ends the decision without waiting or inventing progress", async () => {
  const ready = [];
  const pending = prepareVocabRoundProgress({
    result: { vocabProgress: { status: "unavailable" } },
    baseline: 0, weeklyBaseline: 0,
    requestSnapshot: () => ({ count: 100, weeklyCount: 12 }),
  }, progress => ready.push(progress));
  assert.equal(ready.length, 1);
  assert.equal(ready[0].available, false);
  await pending;
  assert.equal(ready.length, 1);
});
