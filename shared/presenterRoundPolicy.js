const PRESENTER_DISABLED_ROUND_TYPES = new Set([
  "ocid",
  "target_long",
  "target_score",
  "self_specials_3_words",
]);

export function areGameplayPresenterHintsDisabled(...specialRounds) {
  return specialRounds.some((specialRound) =>
    PRESENTER_DISABLED_ROUND_TYPES.has(
      String(specialRound?.type || "").trim().toLowerCase()
    )
  );
}
