import { normalizeWord } from "../../shared/gameLogic.js";
import { areGameplayPresenterHintsDisabled } from "../../shared/presenterRoundPolicy.js";

const SUFFIX_MIN_LENGTH = 4;
const SUFFIX_MAX_LENGTH = 5;
const LONG_WORD_MIN_LENGTH = 8;
const COMMON_SUFFIXES = new Set(["able", "ible", "ique", "ment"]);

export function rankCoachSuffixes(solutions, gridSize = 4) {
  const counts = new Map();
  for (const entry of Array.isArray(solutions) ? solutions : []) {
    const word = normalizeWord(entry?.word || "");
    if (!word || word.length < SUFFIX_MIN_LENGTH + 2) continue;
    const maxLength = Math.min(SUFFIX_MAX_LENGTH, word.length - 2);
    for (let length = SUFFIX_MIN_LENGTH; length <= maxLength; length++) {
      const suffix = word.slice(-length);
      if (!/[aeiouy]/.test(suffix)) continue;
      const item = counts.get(suffix) || { suffix, count: 0 };
      item.count++;
      counts.set(suffix, item);
    }
  }
  const minCount = Number(gridSize) >= 5 ? 3 : 2;
  return [...counts.values()]
    .filter(item => item.count >= minCount
      && (!COMMON_SUFFIXES.has(item.suffix) || item.count >= minCount + 1)
      && (item.suffix.length > 4 || item.count >= minCount + 1))
    .map(item => ({ ...item, score: item.suffix.length ** 2 + item.count * 5
      + (/(aient|ions|iez|asses|assent|assiez|assions|assiaient|erions|eriez|irions|iriez)$/.test(item.suffix) ? 18 : 0) }))
    .sort((a, b) => b.score - a.score || b.suffix.length - a.suffix.length || b.count - a.count);
}

function quadrantForPath(path, gridSize) {
  const start = path?.[0];
  if (!Number.isInteger(gridSize) || gridSize <= 0 || !Number.isInteger(start) || start < 0 || start >= gridSize ** 2) return "";
  const row = Math.floor(start / gridSize), column = start % gridSize;
  return `${row < gridSize / 2 ? "haut" : "bas"} à ${column < gridSize / 2 ? "gauche" : "droite"}`;
}

function bestStartingZone(solutions, gridSize, eligible) {
  const zones = new Map();
  for (const entry of solutions) {
    if (!eligible(entry)) continue;
    const zone = quadrantForPath(entry.path, gridSize);
    if (zone) zones.set(zone, (zones.get(zone) || 0) + 1);
  }
  const best = [...zones].sort((a, b) => b[1] - a[1])[0];
  return best ? { zone: best[0], count: best[1] } : null;
}

// One candidate per kind: a grid rich in endings must not give that kind
// more tickets than the spatial clues. Reuse the solver's scored paths.
export function buildCoachHints(rawSolutions, gridSize = 4) {
  const solutions = (Array.isArray(rawSolutions) ? rawSolutions : []).map(entry => ({
    word: normalizeWord(entry?.word || ""), pts: Number(entry?.pts) || 0,
    path: Array.isArray(entry?.path) ? entry.path : [],
  })).filter(entry => entry.word);
  if (!solutions.length) return [];
  const hints = [];
  const suffix = rankCoachSuffixes(solutions, gridSize)[0];
  if (suffix) hints.push({ kind: "suffix", suffix: suffix.suffix, count: suffix.count,
    text: `Je conseille de tester la terminaison -${suffix.suffix}: ${suffix.count} mots possibles semblent s'y accrocher.` });

  const long = bestStartingZone(solutions, gridSize, entry => entry.word.length >= LONG_WORD_MIN_LENGTH);
  if (long) hints.push({ kind: "long_start", ...long, minLength: LONG_WORD_MIN_LENGTH,
    text: `J’ai repéré ${long.count} ${long.count === 1 ? "mot" : "mots"} de ${LONG_WORD_MIN_LENGTH} lettres ou plus avec un départ en ${long.zone}.` });

  let bestScore = 0;
  for (const entry of solutions) if (Number.isFinite(entry.pts)) bestScore = Math.max(bestScore, entry.pts);
  // Relative to this grid: classic Boggle and bonus-heavy grids use different scales.
  const minPoints = Math.ceil(bestScore * .75);
  const valuable = minPoints > 0 ? bestStartingZone(solutions, gridSize, entry => Number.isFinite(entry.pts) && entry.pts >= minPoints) : null;
  if (valuable) hints.push({ kind: "score_start", ...valuable, minPoints,
    text: `Pour les points, j’ai repéré ${valuable.count} ${valuable.count === 1 ? "mot rapportant" : "mots rapportant"} au moins ${minPoints} points avec un départ en ${valuable.zone}.` });
  return hints;
}

export function createCoachHintPicker({ random = Math.random } = {}) {
  // Each room owns a small draw bag and one cached round. Weak keys let closed
  // rooms be collected; there is no timer, solve, request or per-player state.
  const rooms = new WeakMap();
  return {
    forRound(room, planUsed = null) {
      const round = room?.currentRound;
      if (!round || areGameplayPresenterHintsDisabled(round.special, planUsed)
        || [round.special?.type, planUsed?.type].includes("speed")) return null;
      const previous = rooms.get(room) || { remaining: [], lastKind: null };
      if (previous.round === round) return previous.hint;
      const hints = buildCoachHints(round.solutions, Number(room.config?.gridSize) || 0);
      if (!hints.length) {
        rooms.set(room, { ...previous, round, hint: null });
        return null;
      }
      const kinds = hints.map(hint => hint.kind);
      let remaining = previous.remaining.filter(kind => kinds.includes(kind));
      if (!remaining.length) remaining = [...kinds];
      let choices = remaining.filter(kind => kind !== previous.lastKind);
      if (!choices.length && kinds.length > 1) {
        remaining = kinds.filter(kind => kind !== previous.lastKind);
        choices = remaining;
      }
      if (!choices.length) choices = remaining;
      const sample = Math.min(.999999, Math.max(0, Number(random()) || 0));
      const kind = choices[Math.floor(sample * choices.length)];
      const hint = hints.find(candidate => candidate.kind === kind);
      rooms.set(room, { round, hint, lastKind: kind, remaining: remaining.filter(candidate => candidate !== kind) });
      return hint;
    },
  };
}
