export const MASSIVE_BOGGLE_TYPE = "massive_boggle";

export function isRareBonusEnabledForSpecial(special) {
  const type = String(special?.type || "");
  return type !== "speed" && type !== MASSIVE_BOGGLE_TYPE;
}
