import assert from "node:assert/strict";
import test from "node:test";
import { isResultsVocabularyReady } from "./resultsPresenterAvailability.js";

const results = { phase: "results", roundId: "round-8" };

test("results stay closed before the vocabulary decision, including a delayed overlay", () => {
  assert.equal(isResultsVocabularyReady(results), false);
  assert.equal(isResultsVocabularyReady({ ...results, vocabDecisionRoundId: "round-7" }), false);
  assert.equal(isResultsVocabularyReady({
    ...results, vocabDecisionRoundId: "round-8", vocabOverlayRequest: { id: 1 },
  }), false);
  assert.equal(isResultsVocabularyReady({
    ...results, vocabDecisionRoundId: "round-8", vocabOverlayOpen: true,
  }), false);
});

test("completion, skip and an explicit no-animation decision release results", () => {
  assert.equal(isResultsVocabularyReady({ ...results, vocabDecisionRoundId: "round-8" }), true);
  assert.equal(isResultsVocabularyReady({ ...results, noVocabAnimation: true }), true);
  assert.equal(isResultsVocabularyReady({
    ...results, noVocabAnimation: true, roundReviewOpen: true,
  }), false);
  assert.equal(isResultsVocabularyReady({
    ...results, noVocabAnimation: true, vocabOverlayOpen: true,
  }), false);
  assert.equal(isResultsVocabularyReady({ ...results, phase: "playing" }), true);
  assert.equal(isResultsVocabularyReady({ phase: "results", vocabDecisionRoundId: "results-without-round-id" }), true);
  assert.equal(isResultsVocabularyReady({ phase: "results" }), false);
});
