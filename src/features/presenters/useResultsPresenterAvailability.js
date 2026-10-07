import React from "react";
import usePresenterHintsController from "./usePresenterHintsController.js";

export default function useResultsPresenterAvailability({
  phase,
  roundId,
  vocabReady,
  lepersAnswerExpected = false,
}) {
  const controller = usePresenterHintsController();
  const getAnswerRoundId = React.useCallback(
    () => controller.getSnapshot().lepersAnswerRevealedRoundId,
    [controller],
  );
  const answerRevealedRoundId = React.useSyncExternalStore(
    controller.subscribe,
    getAnswerRoundId,
    getAnswerRoundId,
  );
  React.useLayoutEffect(() => {
    controller.setResultsAvailability({ roundId, vocabReady, lepersAnswerExpected });
  }, [controller, roundId, vocabReady, lepersAnswerExpected]);
  return phase !== "results" || (!!vocabReady && (
    !lepersAnswerExpected || answerRevealedRoundId === String(roundId || "")
  ));
}
