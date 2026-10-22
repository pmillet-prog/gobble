export const GOTUS_WORD_LENGTH = 6;
export const GOTUS_MAX_ATTEMPTS = 6;

export function normalizeGotusWord(value) {
  return String(value ?? "").trim().replace(/œ/gi, "oe").replace(/æ/gi, "ae")
    .normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
}

export function evaluateGotusGuess(target, guess) {
  if (!/^[A-Z]{6}$/.test(target) || !/^[A-Z]{6}$/.test(guess)) throw new Error("invalid_word");
  const marks = Array(GOTUS_WORD_LENGTH).fill("absent");
  const remaining = new Map();
  for (let index = 0; index < GOTUS_WORD_LENGTH; index += 1) {
    if (target[index] === guess[index]) marks[index] = "correct";
    else remaining.set(target[index], (remaining.get(target[index]) || 0) + 1);
  }
  for (let index = 0; index < GOTUS_WORD_LENGTH; index += 1) {
    if (marks[index] === "correct") continue;
    const count = remaining.get(guess[index]) || 0;
    if (count > 0) {
      marks[index] = "present";
      remaining.set(guess[index], count - 1);
    }
  }
  return marks;
}

export function normalizeGotusSummary(value = {}) {
  const phase = ["playing", "won", "lost", "expired", "dismissed"].includes(value.phase) ? value.phase : "playing";
  const won = value.won === true || phase === "won";
  const solution = normalizeGotusWord(value.solution);
  return {
    phase,
    won,
    wordsFound: won ? 1 : 0,
    attemptsUsed: Math.min(GOTUS_MAX_ATTEMPTS, Math.max(0, Math.trunc(Number(value.attemptsUsed) || 0))),
    ...(["won", "lost", "expired"].includes(phase) && /^[A-Z]{6}$/.test(solution) ? { solution } : {}),
  };
}
