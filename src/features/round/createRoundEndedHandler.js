import { RELEASE_SCOPE } from "../../../shared/releaseScope.js";

export function createRoundEndedHandler({
  shouldHandleLiveRoundSocketEvents,
  phaseRef,
  processRoundEndedRef,
  playOutroThenResultsRef,
}) {
  return function onRoundEnded(payload = {}) {
    if (!shouldHandleLiveRoundSocketEvents(payload.roomId)) return;
    if ((payload.targetSummary?.ocid && !(RELEASE_SCOPE.infortuneTournament && payload.infortune?.enabled)) || phaseRef.current !== "playing") {
      processRoundEndedRef.current?.(payload);
      return;
    }
    // Keep the entire result across the outro, including the QPUC recap.
    playOutroThenResultsRef.current?.(payload, { fallback: false });
  };
}
