import assert from "node:assert/strict";
import test from "node:test";

import {
  isTrainingRound,
  shouldPersistRoundProgress,
} from "../trainingProgressPolicy.js";

test("une manche d'entraînement interdit toute progression persistante", () => {
  const round = { id: "training-1", training: true };
  assert.equal(isTrainingRound(round), true);
  assert.equal(shouldPersistRoundProgress(round), false);
});

test("une manche live normale conserve la progression persistante", () => {
  const round = { id: "live-1", training: false };
  assert.equal(isTrainingRound(round), false);
  assert.equal(shouldPersistRoundProgress(round), true);
});

test("l'absence de manche n'autorise jamais une écriture persistante", () => {
  assert.equal(shouldPersistRoundProgress(null), false);
});
