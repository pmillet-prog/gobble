export function isResultsVocabularyReady({
  noVocabAnimation = false,
  phase,
  roundId,
  roundReviewOpen = false,
  vocabDecisionRoundId,
  vocabOverlayOpen = false,
  vocabOverlayRequest = null,
} = {}) {
  if (phase !== "results") return true;
  if (roundReviewOpen || vocabOverlayOpen || vocabOverlayRequest) return false;
  if (noVocabAnimation) return true;
  return String(vocabDecisionRoundId || "") === String(roundId || "results-without-round-id");
}

export function getResultsPresenterDisabledReason(snapshot, key) {
  if (snapshot?.phaseKey !== "results") return "";
  const availability = snapshot.resultsAvailability;
  if (
    !availability?.vocabReady ||
    availability.roundId !== snapshot.roundId
  ) {
    return "Disponible après la progression vocabulaire";
  }
  if (
    key !== "lepers" &&
    availability.lepersAnswerExpected &&
    snapshot.lepersAnswerRevealedRoundId !== snapshot.roundId
  ) {
    return "Disponible après la réponse de Julien Lechéper";
  }
  return "";
}
