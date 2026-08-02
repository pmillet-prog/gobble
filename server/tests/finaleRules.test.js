import assert from "node:assert/strict";
import test from "node:test";

import { computeScore as computeClientScore } from "../../src/components/gameLogic.js";
import { computeScore as computeServerScore } from "../../shared/gameLogic.js";
import {
  FINALE_MIN_TOTAL_SCORE,
  FINALE_TILE_BONUS_MULTIPLIER,
  FINALE_TYPE,
  getFinaleMinWords,
} from "../../shared/finaleRules.js";

const finaleConfig = Object.freeze({
  type: FINALE_TYPE,
  tileBonusMultiplier: FINALE_TILE_BONUS_MULTIPLIER,
});

function scoreBoth(board, path = [0, 1], word = "aa", special = null) {
  return [
    computeServerScore(word, path, board, special),
    computeClientScore(word, path, board, special),
  ];
}

test("la finale relève le seuil de mots de 50 %", () => {
  assert.equal(getFinaleMinWords(150), 225);
  assert.equal(FINALE_MIN_TOTAL_SCORE, 12_000);
});

test("la tuile rouge M3 devient un multiplicateur de mot x6", () => {
  const board = [
    { letter: "A", bonus: "M3" },
    { letter: "A", bonus: null },
  ];

  assert.deepEqual(scoreBoth(board), [6, 6]);
  assert.deepEqual(scoreBoth(board, [0, 1], "aa", finaleConfig), [12, 12]);
});

test("tous les facteurs de tuiles spéciales sont doublés", () => {
  const cases = [
    { bonus: "L2", normal: 3, finale: 5 },
    { bonus: "L3", normal: 4, finale: 7 },
    { bonus: "M2", normal: 4, finale: 8 },
    { bonus: "M3", normal: 6, finale: 12 },
  ];

  for (const entry of cases) {
    const board = [
      { letter: "A", bonus: entry.bonus },
      { letter: "A", bonus: null },
    ];
    assert.deepEqual(scoreBoth(board), [entry.normal, entry.normal]);
    assert.deepEqual(scoreBoth(board, [0, 1], "aa", finaleConfig), [entry.finale, entry.finale]);
  }
});

test("plusieurs bonus de mot renforcés continuent de se combiner", () => {
  const board = [
    { letter: "A", bonus: "M2" },
    { letter: "A", bonus: "M3" },
  ];

  assert.deepEqual(scoreBoth(board), [12, 12]);
  assert.deepEqual(scoreBoth(board, [0, 1], "aa", finaleConfig), [48, 48]);
});
