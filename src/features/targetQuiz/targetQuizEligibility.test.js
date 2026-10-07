import assert from "node:assert/strict";
import test from "node:test";
import { getTargetQuizEligibility } from "./targetQuizEligibility.js";

const liveSolved = {
  appView: "live", gamePresentationView: "live", phase: "playing", isLoggedIn: true,
  roundId: 12, specialRoundType: "target_long", foundTargetThisRound: true,
};

test("only solved live target rounds automatically activate the quiz", () => {
  assert.equal(getTargetQuizEligibility(liveSolved).active, true);
  assert.equal(getTargetQuizEligibility({ ...liveSolved, specialRoundType: "target_score" }).active, true);
  assert.equal(getTargetQuizEligibility({ ...liveSolved, foundTargetThisRound: false }).active, false);
  for (const specialRoundType of ["normal", "speed", "three_words", "ocid", null]) {
    assert.equal(getTargetQuizEligibility({ ...liveSolved, specialRoundType }).active, false);
  }
});

test("training and non-live contexts exclude automatic and dev preview activation", () => {
  for (const patch of [
    { currentRoundTraining: true },
    { standaloneTrainingSession: { sessionId: "training-1" } },
    { standaloneTrainingSession: { tutorial: true } },
    { appView: "training" },
    { gamePresentationView: "daily" },
    { phase: "results" },
    { phase: "lobby" },
    { phaseLoopTestEnabled: true },
    { isLoggedIn: false },
    { roundId: null },
  ]) {
    assert.deepEqual(getTargetQuizEligibility({ ...liveSolved, devPreviewActiveRoundId: 12, ...patch }),
      { canRun: false, devPreview: false, active: false });
  }
});

test("dev simulation can use any live round, but only its armed round", () => {
  const preview = { ...liveSolved, specialRoundType: "normal", foundTargetThisRound: false };
  assert.deepEqual(getTargetQuizEligibility({ ...preview, devPreviewActiveRoundId: "12" }),
    { canRun: true, devPreview: true, active: true });
  assert.equal(getTargetQuizEligibility({ ...preview, devPreviewActiveRoundId: 11 }).active, false);
  assert.equal(getTargetQuizEligibility({ ...preview, devPreviewActiveRoundId: null }).active, false);
});
