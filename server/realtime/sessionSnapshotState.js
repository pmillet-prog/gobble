export function deriveSessionSnapshotPhase({
  breakState = null,
  currentRound = null,
  hasActiveRound = false,
  roundStartPending = false,
} = {}) {
  if (hasActiveRound) return "playing";
  if (roundStartPending) return "preparing";
  if (breakState || currentRound) return "results";
  return "lobby";
}

export function isSessionRoundDisplayable(round, hasActiveRound = false) {
  return (
    !!hasActiveRound ||
    (round?.special?.type === "ocid" && round?.status === "ocid_vote")
  );
}

export function buildSessionPlayerCapabilities({
  hasSessionRound = false,
  roundStatus = null,
  specialType = null,
  targetFound = false,
} = {}) {
  const acceptingInputs = !!hasSessionRound && roundStatus === "running";
  const isOcidRound = specialType === "ocid";
  const isSpecial3WordsRound = specialType === "self_specials_3_words";
  const isTargetRound = specialType === "target_long" || specialType === "target_score";
  return {
    canSubmit:
      acceptingInputs &&
      !isOcidRound &&
      !isSpecial3WordsRound &&
      !(isTargetRound && targetFound),
    canSyncSpecial3Words: acceptingInputs && isSpecial3WordsRound,
    canPropose: acceptingInputs && isOcidRound,
    canVote: !!hasSessionRound && isOcidRound && roundStatus === "ocid_vote",
  };
}
