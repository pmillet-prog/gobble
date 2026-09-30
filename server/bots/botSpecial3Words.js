import { computeScore, MOVABLE_BONUS_KEYS, scoreWordOnGridWithPath } from "../../shared/gameLogic.js";

function scoreSlots(grid, wordSlots, placements) {
  const board = grid.map(cell => ({ ...cell, bonus: null }));
  for (const [bonus, index] of Object.entries(placements)) board[index].bonus = bonus;
  return wordSlots.reduce((total, slot) => total + computeScore(slot.word, slot.path, board), 0);
}

function choosePlacements(grid, wordSlots, skill, rand) {
  const usedCells = [...new Set(wordSlots.flatMap(slot => slot.path))];
  const placements = {};
  const occupied = new Set();

  // Use the words already found, never search the whole grid for an optimal trio.
  // Multipliers first also help when a short word cannot use all four bonuses.
  for (const bonus of ["M3", "M2", "L3", "L2"]) {
    let candidates = usedCells.filter(index => !occupied.has(index));
    if (!candidates.length) {
      candidates = grid.map((_, index) => index).filter(index => !occupied.has(index));
    }
    if (!candidates.length) break;

    // Even skilled bots often overlook a better square. One local choice per
    // bonus, with no exhaustive placement search or repeated optimisation.
    if (rand() < 0.25 + skill * 0.45) {
      candidates = candidates.map(index => ({
        index,
        score: scoreSlots(grid, wordSlots, { ...placements, [bonus]: index }),
        tie: rand(),
      })).sort((a, b) => b.score - a.score || a.tie - b.tie)
        .slice(0, 2).map(candidate => candidate.index);
    }
    const index = candidates[Math.floor(rand() * candidates.length)];
    placements[bonus] = index;
    occupied.add(index);
  }
  return Object.fromEntries(MOVABLE_BONUS_KEYS
    .filter(bonus => Number.isInteger(placements[bonus]))
    .map(bonus => [bonus, placements[bonus]]));
}

export function planBotSpecial3Words({ grid, words, solutions, bot, timeBudget, rand = Math.random }) {
  if (!Array.isArray(grid) || !grid.length || !Array.isArray(words) || !words.length) return [];
  if (!Number.isFinite(timeBudget) || timeBudget <= 0) return [];
  const skill = Math.min(1, Math.max(0, Number.isFinite(bot?.skill) ? bot.skill : 0.4));
  // Preserve the existing skill-dependent word limit and discovery order.
  const desiredSlots = Math.min(3, Math.max(1, Math.round(1 + skill * 2 + rand() * 0.8)));
  const selected = [];
  const starts = new Set();
  const seenWords = new Set();
  const board = grid.map(cell => ({ ...cell, bonus: null }));
  for (const word of words) {
    const path = solutions?.get(word)?.path;
    if (!Array.isArray(path) || !path.length || starts.has(path[0]) || seenWords.has(word)) continue;
    if (path.some(index => !Number.isInteger(index) || index < 0 || index >= board.length)
      || new Set(path).size !== path.length) continue;
    if (!scoreWordOnGridWithPath(word, board, path)) continue;
    starts.add(path[0]);
    seenWords.add(word);
    selected.push({ id: selected.length, word, display: word.toUpperCase(), path: [...path] });
    if (selected.length >= desiredSlots) break;
  }

  const firstFraction = 0.12 + rand() * 0.1;
  const lastFraction = 0.6 + rand() * 0.28;
  let placements = {};
  return selected.map((_, index) => {
    const wordSlots = selected.slice(0, index + 1);
    // A new word can prompt one rethink, more often for stronger players.
    if (index === 0 || rand() < 0.25 + skill * 0.4) {
      const candidate = choosePlacements(board, wordSlots, skill, rand);
      if (scoreSlots(board, wordSlots, candidate) >= scoreSlots(board, wordSlots, placements)) {
        placements = candidate;
      }
    }
    const progress = selected.length <= 1 ? 0 : index / (selected.length - 1);
    return {
      delay: Math.round(timeBudget * (firstFraction + progress * (lastFraction - firstFraction))),
      wordSlots,
      specialPlacements: { ...placements },
    };
  });
}
