const PRESENTER_DISABLED_ROUND_TYPES = new Set([
  "ocid",
  "target_long",
  "target_score",
]);

export function areGameplayPresenterHintsDisabled(specialRound) {
  return PRESENTER_DISABLED_ROUND_TYPES.has(
    String(specialRound?.type || "").trim().toLowerCase()
  );
}
