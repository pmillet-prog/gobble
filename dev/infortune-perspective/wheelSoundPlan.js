export const RESULT_SOUND_VARIANTS = [
  ["small", "Petit gain"], ["good", "Beau gain"], ["jackpot", "1 000"],
  ["bonus", "Bonus"], ["bankrupt", "Banqueroute"], ["exchange", "Échange"],
];
export const DRUMS_START_SPEED = 0.10; // turns / second, independent of the camera shot

export function resultSoundVariant(result) {
  if (!result) return null;
  if (result.kind === 'pass') return 'bankrupt';
  if (result.kind === "bankrupt" || result.kind === "bonus" || result.kind === "exchange") return result.kind;
  if (result.kind !== "amount") return "exchange";
  return result.amount >= 1000 ? "jackpot" : result.amount > 200 ? "good" : "small";
}
