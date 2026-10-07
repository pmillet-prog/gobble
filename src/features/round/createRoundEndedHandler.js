export function createRoundEndedHandler({
  shouldHandleLiveRoundSocketEvents,
  phaseRef,
  processRoundEndedRef,
  playOutroThenResultsRef,
}) {
  return function onRoundEnded(payload = {}) {
    if (!shouldHandleLiveRoundSocketEvents(payload.roomId)) return;
    if (payload.targetSummary?.ocid || phaseRef.current !== "playing") {
      processRoundEndedRef.current?.(payload);
      return;
    }
    // Keep the entire result across the outro, including the QPUC recap.
    playOutroThenResultsRef.current?.(payload, { fallback: false });
  };
}
