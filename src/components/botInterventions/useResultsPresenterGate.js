import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import { isResultsVocabularyReady } from "../../features/presenters/resultsPresenterAvailability.js";

export default function useResultsPresenterGate({
  noVocabAnimation = false,
  phase,
  roundId,
  vocabDecisionRoundId,
  vocabOverlayOpen,
  vocabOverlayRequest,
}) {
  const liveUi = useFeatureRuntime("liveUi");
  const roundReviewOpen = useFeatureSelector(liveUi, state => !!state.threeWordsRecapOpen);
  return isResultsVocabularyReady({
    noVocabAnimation,
    phase,
    roundId,
    roundReviewOpen,
    vocabDecisionRoundId,
    vocabOverlayOpen,
    vocabOverlayRequest,
  });
}
