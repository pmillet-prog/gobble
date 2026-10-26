export const TRAINING_PLAYTIME_EXHAUSTED_MESSAGE =
  "Ton temps de jeu est écoulé pour aujourd’hui. Le live et les entraînements seront de nouveau accessibles demain.";

export function isTrainingPlaytimeExhausted(status, remainingMs = status?.remainingMs) {
  return !!status?.active && (status.exhausted === true || (remainingMs != null && Number(remainingMs) <= 0));
}
