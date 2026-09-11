import React from "react";

export const RESULTS_PRESENTER_VOCAB_FALLBACK_MS = 6500;
const VOCAB_DECISION_SETTLE_MS = 120;

export default function useResultsPresenterGate({
  accountSeenReady,
  isAccountAuthenticated,
  phase,
  roundId,
  targetSummary,
  vocabOverlayOpen,
  vocabOverlayRequest,
  vocabResultsReadyKey,
}) {
  const resultsKey = String(roundId || "results-without-round-id");
  const [readyResultsKey, setReadyResultsKey] = React.useState(null);
  const sawOverlayRef = React.useRef(false);

  React.useEffect(() => {
    sawOverlayRef.current = false;
    setReadyResultsKey(null);
  }, [phase, roundId]);

  React.useEffect(() => {
    if (phase !== "results") {
      return undefined;
    }
    if (targetSummary || !isAccountAuthenticated) {
      setReadyResultsKey(resultsKey);
      return undefined;
    }
    if (vocabOverlayOpen) {
      sawOverlayRef.current = true;
      setReadyResultsKey(null);
      return undefined;
    }
    if (sawOverlayRef.current) {
      setReadyResultsKey(resultsKey);
      return undefined;
    }
    if (vocabOverlayRequest || !accountSeenReady) {
      setReadyResultsKey(null);
    }

    // Une clé prête sans ouverture au tick suivant signifie que l'animation a
    // été déjà vue/écartée. Le fallback couvre aussi une requête vocab en panne.
    const delayMs =
      vocabResultsReadyKey && !vocabOverlayRequest
        ? VOCAB_DECISION_SETTLE_MS
        : RESULTS_PRESENTER_VOCAB_FALLBACK_MS;
    const timerId = setTimeout(() => setReadyResultsKey(resultsKey), delayMs);
    return () => clearTimeout(timerId);
  }, [
    accountSeenReady,
    isAccountAuthenticated,
    phase,
    resultsKey,
    targetSummary,
    vocabOverlayOpen,
    vocabOverlayRequest,
    vocabResultsReadyKey,
  ]);

  return phase !== "results" || readyResultsKey === resultsKey;
}
