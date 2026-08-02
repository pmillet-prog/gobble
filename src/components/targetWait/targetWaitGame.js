export const TARGET_WAIT_SESSION_SECONDS = 90;
export const TARGET_WAIT_BASE_SCORE = 100;
export const TARGET_WAIT_WRONG_PENALTY = 75;

export function getTargetWaitMultiplier(streak = 0) {
  const safeStreak = Math.max(0, Number(streak) || 0);
  return Math.min(2, 1 + Math.max(0, safeStreak - 1) * 0.25);
}

export function getTargetWaitCorrectScore(nextStreak = 1) {
  return Math.round(TARGET_WAIT_BASE_SCORE * getTargetWaitMultiplier(nextStreak));
}

function hashText(value = "") {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shuffleTargetWaitValues(values = [], seedText = "") {
  const next = [...values];
  let state = hashText(seedText || "target-wait") || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let index = next.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [next[index], next[other]] = [next[other], next[index]];
  }
  return next;
}

export function buildTargetWaitChoices(puzzle, choiceCount = 5) {
  const answer = String(puzzle?.answer || "").toUpperCase();
  const rawChoices = Array.isArray(puzzle?.choices) ? puzzle.choices : [];
  const distinct = Array.from(
    new Set(rawChoices.map((letter) => String(letter || "").toUpperCase()).filter(Boolean))
  );
  const decoys = distinct.filter((letter) => letter !== answer);
  const safeCount = choiceCount === 4 ? 4 : 5;
  const selected = [answer, ...decoys.slice(0, Math.max(0, safeCount - 1))].filter(Boolean);
  return shuffleTargetWaitValues(selected, `${puzzle?.id || puzzle?.grid || ""}:${safeCount}`);
}

export function isTargetWaitPuzzle(value) {
  if (!value || typeof value !== "object") return false;
  const grid = String(value.grid || "");
  const blankIndex = Number(value.blankIndex);
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const answer = String(value.answer || "");
  const word = String(value.word || "");
  const path = Array.isArray(value.path) ? value.path : [];
  return (
    grid.length === 16 &&
    Number.isInteger(blankIndex) &&
    blankIndex >= 0 &&
    blankIndex < 16 &&
    grid[blankIndex] === "_" &&
    choices.length >= 4 &&
    choices.includes(answer) &&
    word.length >= 7 &&
    path.length === word.replaceAll("QU", "Q").length &&
    path.every((index) => Number.isInteger(index) && index >= 0 && index < 16) &&
    path.includes(blankIndex)
  );
}
