import assert from "node:assert/strict";
import test from "node:test";
import { getVocabProgressWord, resolveVocabRoundProgress } from "./vocabRoundProgress.js";

test("only the new word scrolls, even when known words sort before it", () => {
  const progress = resolveVocabRoundProgress({
    result: {
      words: ["ane", "bateau", "zebre"],
      newVocabWords: ["zebre"],
      vocabWeeklyRace: { beforeCount: 2, afterCount: 3 },
    },
    count: 3,
    baseline: 2,
    weeklyCount: 3,
  });
  assert.equal(progress.delta, 1);
  assert.equal(progress.weeklyDelta, 1);
  assert.deepEqual(progress.newWords, ["zebre"]);
  assert.equal(getVocabProgressWord(progress.newWords, 1), "zebre");
});

test("zero new words remains zero despite stale baselines and client deltas", () => {
  const progress = resolveVocabRoundProgress({
    result: {
      words: ["ane", "bateau"],
      newVocabWords: [],
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

test("a word known globally may count for the current week without becoming a global novelty", () => {
  const progress = resolveVocabRoundProgress({
    result: { newVocabWords: [], vocabWeeklyRace: { beforeCount: 0, afterCount: 1 } },
    count: 100,
    baseline: 100,
    weeklyCount: 1,
  });
  assert.equal(progress.delta, 0);
  assert.equal(progress.weeklyDelta, 1);
  assert.deepEqual(progress.newWords, []);
});

test("the word ticker follows global discoveries instead of the faster weekly counter", () => {
  const progress = resolveVocabRoundProgress({
    result: { newVocabWords: ["zebre", "ecole"], vocabWeeklyRace: { beforeCount: 0, afterCount: 10 } },
    count: 100,
    baseline: 98,
  });
  assert.equal(progress.delta, 2);
  assert.equal(progress.weeklyDelta, 10);
  assert.equal(getVocabProgressWord(progress.newWords, 1), "ecole");
  assert.equal(getVocabProgressWord(progress.newWords, 2), "zebre");
});

test("missing snapshots never turn every accepted word into a novelty", () => {
  const unknown = resolveVocabRoundProgress({ result: { words: ["ane", "zebre"] }, count: 200 });
  assert.equal(unknown.delta, null);
  assert.equal(unknown.weeklyDelta, null);
  assert.deepEqual(unknown.newWords, []);
  const baseline = resolveVocabRoundProgress({ count: 200, baseline: 199, weeklyCount: 30, weeklyBaseline: 29 });
  assert.equal(baseline.delta, 1);
  assert.equal(baseline.weeklyDelta, 1);
  assert.deepEqual(baseline.newWords, []);
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
