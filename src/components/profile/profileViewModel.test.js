import test from "node:test";
import assert from "node:assert/strict";
import { formatTargetTime, getProfileHighlights } from "./profileViewModel.js";

test("the new profile preserves the best records across lifetime and weekly history", () => {
  const result = getProfileHighlights({ lifetime: { bestRoundScore: 350, roundsPlayed: 100, totalScore: 4000, bestWord: { word: "CHAT", pts: 8 }, longestWord: { word: "CHOCOLAT", len: 8 } }, weekly: { allTime: { bestRoundScore: { pts: 500 }, roundsPlayed: 80, totalScore: 4500, bestWord: { word: "CHIEN", pts: 10 }, longestWord: { word: "CHIEN", len: 5 } } } });
  assert.equal(result.bestRound, 500);
  assert.equal(result.rounds, 100);
  assert.equal(result.score, 4500);
  assert.equal(result.bestWord.word, "CHIEN");
  assert.equal(result.longestWord.word, "CHOCOLAT");
});
test("a missing target record is not shown as a zero-second record", () => {
  assert.equal(formatTargetTime(null), "—");
  assert.equal(formatTargetTime(undefined), "—");
  assert.equal(formatTargetTime(8200), "8,2 s");
});
