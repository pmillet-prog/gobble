import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTargetWaitChoices,
  getTargetWaitCorrectScore,
  getTargetWaitMultiplier,
} from "../../src/components/targetWait/targetWaitGame.js";

const puzzle = {
  id: "tw-test",
  grid: "YRIOLSLU_ANGERAR",
  choices: ["P", "G", "E", "M", "I"],
  answer: "I",
};

test("le barème augmente avec la série puis plafonne", () => {
  assert.equal(getTargetWaitMultiplier(1), 1);
  assert.equal(getTargetWaitCorrectScore(1), 100);
  assert.equal(getTargetWaitCorrectScore(2), 125);
  assert.equal(getTargetWaitCorrectScore(3), 150);
  assert.equal(getTargetWaitCorrectScore(5), 200);
  assert.equal(getTargetWaitCorrectScore(20), 200);
});

test("les variantes 4 et 5 propositions gardent une unique bonne lettre", () => {
  const fourChoices = buildTargetWaitChoices(puzzle, 4);
  const fiveChoices = buildTargetWaitChoices(puzzle, 5);
  assert.equal(fourChoices.length, 4);
  assert.equal(fiveChoices.length, 5);
  assert.equal(fourChoices.filter((letter) => letter === puzzle.answer).length, 1);
  assert.equal(fiveChoices.filter((letter) => letter === puzzle.answer).length, 1);
});
