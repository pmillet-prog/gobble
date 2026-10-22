import { GOTUS_WORD_LENGTH, GOTUS_MAX_ATTEMPTS } from "../../../shared/gotusRules.js";

// Keep the server's per-round draw separate from the reusable special-round plan.
export function withRoundTargetMiniGame(special, targetMiniGame) {
  if (!special?.isSpecial) return null;
  if (!["target_long", "target_score"].includes(special.type)) return special;
  return { ...special, targetMiniGame: targetMiniGame?.kind === "gotus"
    ? { kind: "gotus", wordLength: GOTUS_WORD_LENGTH, maxAttempts: GOTUS_MAX_ATTEMPTS }
    : { kind: "quiz" } };
}
