import React from "react";
import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { scheduleVocabResultsDecisionDeadline } from "./vocabResultsDecisionDeadline.js";

export default function useVocabResultsDecisionDeadline({
  phase,
  roundId,
  accountSeenReady,
  noVocabAnimation = false,
}) {
  const statsFeature = useFeatureRuntime("stats");
  React.useEffect(() => scheduleVocabResultsDecisionDeadline(statsFeature, {
    phase, roundId, accountSeenReady, noVocabAnimation,
  }), [statsFeature, phase, roundId, accountSeenReady, noVocabAnimation]);
}
