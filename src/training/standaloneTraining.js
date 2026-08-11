export const TRAINING_DURATION_MIN_MS = 30 * 1000;
export const TRAINING_DURATION_MAX_MS = 10 * 60 * 1000;
export const TRAINING_DURATION_PRESETS_MS = Object.freeze([
  30 * 1000,
  60 * 1000,
  90 * 1000,
  2 * 60 * 1000,
  3 * 60 * 1000,
  5 * 60 * 1000,
]);

export function formatTrainingDuration(durationMs) {
  const totalSeconds = Math.max(0, Math.round((Number(durationMs) || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function buildStandaloneTrainingTargetSummary(session) {
  const mode = String(session?.mode || "");
  if (mode !== "target_long" && mode !== "target_score") return null;
  const word = String(session?.targetWord || "").trim();
  return word ? { word, foundOrder: [] } : null;
}

export function buildTrainingTargetHintSchedule(durationMs, targetLength) {
  const duration = Math.max(TRAINING_DURATION_MIN_MS, Number(durationMs) || 0);
  const count = Math.max(0, Math.min(11, Math.round(Number(targetLength) || 0) - 1));
  if (!count) return [];
  const first = Math.min(duration - 1000, Math.max(5000, duration * 0.14));
  const last = Math.max(first, duration - Math.max(2000, duration * 0.07));
  if (count === 1) return [Math.round(first)];
  return Array.from({ length: count }, (_, index) =>
    Math.round(first + ((last - first) * index) / (count - 1))
  );
}

function expandQuReveal(word, indices) {
  const expanded = new Set(indices);
  const chars = String(word || "").split("");
  for (let index = 0; index < chars.length - 1; index += 1) {
    if (chars[index].toUpperCase() !== "Q" || chars[index + 1].toUpperCase() !== "U") continue;
    if (expanded.has(index) || expanded.has(index + 1)) {
      expanded.add(index);
      expanded.add(index + 1);
    }
  }
  return expanded;
}

function buildTargetWordCellMap(word, path, grid) {
  const map = [];
  let wordIndex = 0;
  for (const cellIndex of Array.isArray(path) ? path : []) {
    if (wordIndex >= String(word || "").length) break;
    const cell = grid?.[cellIndex];
    const label = cell?.letter === "Qu" ? "qu" : String(cell?.letter || "").toLowerCase();
    for (let offset = 0; offset < label.length; offset += 1) {
      map[wordIndex + offset] = cellIndex;
    }
    wordIndex += label.length;
  }
  return map;
}

function stableRevealOrder(length, seed) {
  let hash = 2166136261;
  for (const char of String(seed || "training")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Array.from({ length }, (_, index) => index).sort((a, b) => {
    const scoreA = Math.imul(hash ^ (a + 1), 2246822519) >>> 0;
    const scoreB = Math.imul(hash ^ (b + 1), 2246822519) >>> 0;
    return scoreA - scoreB;
  });
}

export function buildTrainingTargetHint({ word, path, grid, revealCount, kind, seed }) {
  const normalizedWord = String(word || "").toLowerCase();
  const desiredCount = Math.max(0, Math.min(normalizedWord.length, Number(revealCount) || 0));
  const baseIndices = stableRevealOrder(normalizedWord.length, seed).slice(0, desiredCount);
  const revealed = expandQuReveal(normalizedWord, baseIndices);
  const wordIndices = Array.from(revealed).sort((a, b) => a - b);
  const cellMap = buildTargetWordCellMap(normalizedWord, path, grid);
  return {
    kind,
    length: normalizedWord.length,
    pattern: normalizedWord
      .split("")
      .map((letter, index) => (revealed.has(index) ? letter.toUpperCase() : "_"))
      .join(" "),
    cells: wordIndices
      .map((index) => cellMap[index])
      .filter((index) => Number.isInteger(index)),
    wordIndices,
  };
}

export function describeLiveTrainingStatus(status) {
  const playerCount = Math.max(0, Number(status?.humanPlayerCount) || 0);
  const round = status?.round;
  return {
    playerText: `${playerCount} joueur${playerCount > 1 ? "s" : ""} dans le live`,
    roundText: round
      ? `Manche ${round.number}/${round.total} · ${round.label || round.type || "Classique"}`
      : status?.phase === "results"
      ? "Résultats / intermanche"
      : "Lobby entre deux tournois",
  };
}
