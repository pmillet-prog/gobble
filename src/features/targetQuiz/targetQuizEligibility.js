export function getTargetQuizEligibility({
  appView,
  gamePresentationView,
  phase,
  isLoggedIn,
  roundId,
  specialRoundType,
  foundTargetThisRound,
  currentRoundTraining,
  standaloneTrainingSession,
  phaseLoopTestEnabled,
  devPreviewActiveRoundId,
}) {
  const canRun = appView === "live" && gamePresentationView === "live" &&
    phase === "playing" && !!isLoggedIn && roundId != null &&
    !currentRoundTraining && !standaloneTrainingSession && !phaseLoopTestEnabled;
  const devPreview = canRun && devPreviewActiveRoundId != null &&
    String(devPreviewActiveRoundId) === String(roundId);
  const solvedLiveTarget = (specialRoundType === "target_long" || specialRoundType === "target_score") &&
    !!foundTargetThisRound;
  return { canRun, devPreview, active: canRun && (devPreview || solvedLiveTarget) };
}
