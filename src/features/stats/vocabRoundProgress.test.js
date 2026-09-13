import assert from "node:assert/strict";
import test from "node:test";
import { getVocabProgressWord, resolveVocabRoundProgress } from "./vocabRoundProgress.js";

test("committed round counts win over a later or stale SQL status response", () => {
  const result = {
    newVocabWords: ["hippopotame"],
    newWeeklyVocabWords: ["hippopotame"],
    vocabProgress: { status: "recorded", beforeCount: 99, afterCount: 100 },
    vocabWeeklyRace: { beforeCount: 10, afterCount: 11 },
  };
  for (const count of [null, 98, 250]) {
    const progress = resolveVocabRoundProgress({ result, count, weeklyCount: 800, baseline: 1 });
    assert.equal(progress.available, true);
    assert.equal(progress.count, 100);
    assert.equal(progress.delta, 1);
    assert.equal(progress.weeklyDelta, 1);
    assert.equal(progress.weeklyCount, 11);
    assert.deepEqual(progress.newWords, ["hippopotame"]);
    assert.deepEqual(progress.newWeeklyWords, ["hippopotame"]);
  }
});

test("an uncommitted round never animates a made-up delta from older counters", () => {
  const progress = resolveVocabRoundProgress({
    result: { vocabProgress: { status: "unavailable" }, words: ["chat", "hippopotame"] },
    count: 300, baseline: 200, delta: 100, weeklyCount: 50, weeklyBaseline: 0, weeklyDelta: 50,
  });
  assert.equal(progress.available, false);
  assert.equal(progress.delta, null);
  assert.equal(progress.weeklyDelta, null);
  assert.deepEqual(progress.newWords, []);
  assert.deepEqual(progress.newWeeklyWords, []);
});

test("only the new word scrolls, even when known words sort before it", () => {
  const progress = resolveVocabRoundProgress({
    result: {
      words: ["ane", "bateau", "zebre"],
      newVocabWords: ["zebre"],
      newWeeklyVocabWords: ["zebre"],
      vocabWeeklyRace: { beforeCount: 2, afterCount: 3 },
    },
    count: 3,
    baseline: 2,
    weeklyCount: 3,
  });
  assert.equal(progress.delta, 1);
  assert.equal(progress.weeklyDelta, 1);
  assert.deepEqual(progress.newWords, ["zebre"]);
  assert.equal(getVocabProgressWord(progress.newWeeklyWords, 1), "zebre");
});

test("zero new words remains zero despite stale baselines and client deltas", () => {
  const progress = resolveVocabRoundProgress({
    result: {
      words: ["ane", "bateau"],
      newVocabWords: [],
      newWeeklyVocabWords: [],
      vocabWeeklyRace: { beforeCount: 30, afterCount: 30 },
    },
    count: 200,
    baseline: 100,
    delta: 100,
    weeklyCount: 30,
    weeklyBaseline: 10,
    weeklyDelta: 20,
  });
  assert.equal(progress.delta, 0);
  assert.equal(progress.weeklyDelta, 0);
  assert.deepEqual(progress.newWords, []);
  assert.equal(getVocabProgressWord(progress.newWords, 20), "");
});

test("a word known this season still appears when it is new for the current week", () => {
  const progress = resolveVocabRoundProgress({
    result: { newVocabWords: [], newWeeklyVocabWords: ["École"], vocabWeeklyRace: { beforeCount: 0, afterCount: 1 } },
    count: 100,
    baseline: 100,
    weeklyCount: 1,
  });
  assert.equal(progress.delta, 0);
  assert.equal(progress.weeklyDelta, 1);
  assert.deepEqual(progress.newWords, []);
  assert.deepEqual(progress.newWeeklyWords, ["ecole"]);
});

test("the word ticker includes all weekly discoveries and keeps seasonal discoveries separate", () => {
  const progress = resolveVocabRoundProgress({
    result: {
      newVocabWords: ["zebre", "ecole"],
      newWeeklyVocabWords: ["ZÈBRE", "École", "ane", "bateau", "ecole"],
      vocabWeeklyRace: { beforeCount: 10, afterCount: 14 },
    },
    count: 100,
    baseline: 98,
  });
  assert.equal(progress.delta, 2);
  assert.equal(progress.weeklyDelta, 4);
  assert.deepEqual(progress.newWeeklyWords, ["ane", "bateau", "ecole", "zebre"]);
  assert.deepEqual(progress.newWords, ["ecole", "zebre"]);
  assert.equal(getVocabProgressWord(progress.newWeeklyWords, 1), "ane");
  assert.equal(getVocabProgressWord(progress.newWeeklyWords, 4), "zebre");
});

test("missing snapshots never turn every accepted word into a novelty", () => {
  const unknown = resolveVocabRoundProgress({ result: { words: ["ane", "zebre"] }, count: 200 });
  assert.equal(unknown.delta, null);
  assert.equal(unknown.weeklyDelta, null);
  assert.deepEqual(unknown.newWords, []);
  assert.deepEqual(unknown.newWeeklyWords, []);
  const baseline = resolveVocabRoundProgress({ count: 200, baseline: 199, weeklyCount: 30, weeklyBaseline: 29 });
  assert.equal(baseline.delta, 1);
  assert.equal(baseline.weeklyDelta, 1);
  assert.deepEqual(baseline.newWords, []);
  assert.deepEqual(baseline.newWeeklyWords, []);
});

test("null weekly counts stay unknown and zero deltas never fall back to older totals", () => {
  const progress = resolveVocabRoundProgress({
    result: { newVocabWords: ["École", "ecole"], vocabWeeklyRace: { beforeCount: null, afterCount: null } },
    count: 100,
    weeklyCount: 30,
    weeklyBaseline: 10,
    weeklyDelta: 0,
  });
  assert.equal(progress.delta, 1);
  assert.equal(progress.weeklyDelta, 0);
  assert.equal(progress.weeklyCount, 30);
});
