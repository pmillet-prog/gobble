export const VOCAB_RESULTS_DECISION_TIMEOUT_MS = 6500;

export function scheduleVocabResultsDecisionDeadline(
  statsFeature,
  { phase, roundId, accountSeenReady, noVocabAnimation = false },
  { setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {},
) {
  if (phase !== "results" || accountSeenReady || noVocabAnimation) return undefined;
  const roundKey = String(roundId || "results-without-round-id");
  let cancelled = false;
  const timerId = setTimeoutFn(() => {
    if (cancelled) return;
    const state = statsFeature.store.getState();
    if (
      state.vocabDecisionRoundId === roundKey ||
      state.vocabOverlayRequest ||
      state.vocabOverlayOpen
    ) return;
    // This ends the decision for this round, so late markers cannot launch an overlay.
    statsFeature.set("vocabDecisionRoundId", roundKey);
  }, VOCAB_RESULTS_DECISION_TIMEOUT_MS);
  return () => {
    cancelled = true;
    clearTimeoutFn(timerId);
  };
}
