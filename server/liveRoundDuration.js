export const LIVE_SPECIAL_ROUND_DURATION_MS = 120 * 1000;
export const TARGET_SPECIAL_ROUND_DURATION_MS = 90 * 1000;
export const THREE_WORDS_ROUND_DURATION_MS = 90 * 1000;
export const OCID_PROPOSAL_DURATION_MS = 40 * 1000;
export const OCID_VOTE_DURATION_MS = 20 * 1000;

// The round timer and tournament estimates must use the same playable duration.
export function getLiveRoundDurationMs(type, configuredDurationMs = 120 * 1000) {
  if (type === "ocid") return OCID_PROPOSAL_DURATION_MS;
  if (type === "self_specials_3_words") return THREE_WORDS_ROUND_DURATION_MS;
  if (type === "target_long" || type === "target_score") return TARGET_SPECIAL_ROUND_DURATION_MS;
  if (["speed", "monstrous", "massive_boggle"].includes(type)) return LIVE_SPECIAL_ROUND_DURATION_MS;
  return configuredDurationMs;
}
