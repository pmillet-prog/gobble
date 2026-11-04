export const RESULT_SOUND_VARIANTS = [
  ["small", "Petit gain"], ["good", "Beau gain"], ["jackpot", "1 000"],
  ["bonus", "Bonus"], ["bankrupt", "Banqueroute"], ["exchange", "Échange"],
];
export const DRUMS_START_SPEED = 0.18; // turns / second, independent of the camera shot

export function resultSoundVariant(result) {
  if (!result || result.kind === "pass") return null;
  if (result.kind === "bankrupt" || result.kind === "bonus" || result.kind === "exchange") return result.kind;
  if (result.kind !== "amount") return "exchange";
  return result.amount >= 1000 ? "jackpot" : result.amount > 200 ? "good" : "small";
}
