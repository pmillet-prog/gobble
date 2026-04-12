// shared/gameLogic.js
// Logique pure du Boggle : génération de grille, voisinage, scoring, solveur.

// -----------------
// Constantes
// -----------------
export const SIZE = 4;
export const MOVABLE_BONUS_KEYS = Object.freeze(["L2", "L3", "M2", "M3"]);
export const FAKE_TWINS_TYPE = "fake_twins";
export const FAKE_TWINS_MIN_WORD_LENGTH = 4;

export const LETTER_BAG =
  "EEEEEEAAAAAAIIIIIIOOOOONNNNNRRRRRTTTTTLLLLSSSSSSSUUUUDDDDGGBBCCMMFPPHVWYKJXQZ";

export const SCRABBLE_FR = {
  a: 1,
  e: 1,
  i: 1,
  l: 1,
  n: 1,
  o: 1,
  r: 1,
  s: 1,
  t: 1,
  u: 1,
  d: 2,
  g: 2,
  m: 2,
  b: 3,
  c: 3,
  p: 3,
  f: 4,
  h: 4,
  v: 4,
  j: 8,
  q: 10,
  k: 10,
  w: 10,
  x: 10,
  y: 10,
  z: 10,
};

// -----------------
// Normalisation et utilitaires
// -----------------
export function normalizeWord(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0153/gi, "oe") // au cas ou tu corriges le dico plus tard
    .replace(/\u00e6/gi, "ae")
    .replace(/['\" -]/g, "")
    .toLowerCase();
}

export function randomLetter() {
  const letter = LETTER_BAG[Math.floor(Math.random() * LETTER_BAG.length)];
  return letter === "Q" ? "Qu" : letter;
}

// retourne les indices voisins (8-neighborhood) dâ€™une case i dans la grille 1D
export function neighbors(i, size = SIZE, total = null) {
  // si size n'est pas fourni, on tente de le dÃ©duire du total de cases
  const n = size || (total ? Math.sqrt(total) : SIZE);
  const r = Math.floor(i / n);
  const c = i % n;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) {
        out.push(rr * n + cc);
      }
    }
  }
  return out;
}

// -----------------
// Génération de la grille
// -----------------

// Reproduit la logique de startGame() dans ton App.jsx :
// - 25 tuiles { letter, bonus }
// - 4 bonus placÃ©s alÃ©atoirement : L2, L3, M2, M3
export function generateGrid(size = SIZE) {
  const T = size * size;

  const base = Array(T)
    .fill(null)
    .map(() => ({ letter: randomLetter(), bonus: null }));

  const shuffled = [...Array(T).keys()].sort(() => 0.5 - Math.random());
  const bonuses = ["L2", "L3", "M2", "M3"];
  bonuses.forEach((bonus, i) => {
    base[shuffled[i]].bonus = bonus;
  });

  return base;
}

export function cloneGridWithoutBonuses(grid) {
  if (!Array.isArray(grid)) return [];
  return grid.map((cell) => ({
    letter: cell?.letter ?? "",
    altLetter: cell?.altLetter ?? null,
    specialType: cell?.specialType ?? null,
    bonus: null,
  }));
}

function mulberry32(seed) {
  let a = Number(seed) >>> 0;
  return function rand() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function applySeededBonuses(grid, seed, bonusKeys = MOVABLE_BONUS_KEYS) {
  const base = cloneGridWithoutBonuses(grid);
  const total = base.length;
  if (total === 0) return base;
  const rand = mulberry32(Number(seed) || 0);
  const indices = [...Array(total).keys()];
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const keys = Array.isArray(bonusKeys) && bonusKeys.length ? bonusKeys : MOVABLE_BONUS_KEYS;
  keys.forEach((bonus, idx) => {
    const target = indices[idx % total];
    base[target] = { ...base[target], bonus };
  });
  return base;
}

// -----------------
// Scoring
// -----------------

export function tileScore(tile) {
  const primary = tileScoreForLetter(tile?.letter);
  if (!isFakeTwinsCell(tile)) return primary;
  return primary + tileScoreForLetter(tile?.altLetter);
}

function normalizeLetterKey(letter) {
  if (!letter) return "";
  if (letter === "Qu") return "qu";
  return String(letter).toLowerCase();
}

function tileScoreForLetter(letter) {
  const key = normalizeLetterKey(letter);
  if (key === "qu") return SCRABBLE_FR.q + SCRABBLE_FR.u;
  return SCRABBLE_FR[key] || 0;
}

function isFakeTwinsSpecial(special) {
  return special?.type === FAKE_TWINS_TYPE || special?.specialType === FAKE_TWINS_TYPE;
}

function getMinimumWordLength(special = null) {
  if (Number.isFinite(special?.minWordLength) && special.minWordLength > 0) {
    return Math.max(2, Math.trunc(special.minWordLength));
  }
  return isFakeTwinsSpecial(special) ? FAKE_TWINS_MIN_WORD_LENGTH : 2;
}

function isFakeTwinsCell(cell) {
  return (
    cell?.specialType === FAKE_TWINS_TYPE &&
    normalizeLetterKey(cell?.letter) &&
    normalizeLetterKey(cell?.altLetter) &&
    normalizeLetterKey(cell?.altLetter) !== normalizeLetterKey(cell?.letter) &&
    normalizeLetterKey(cell?.altLetter) !== "qu"
  );
}

function pathUsesFakeTwinsCell(path, board) {
  return Array.isArray(path) && path.some((idx) => isFakeTwinsCell(board?.[idx]));
}

function getCellLetterOptions(cell) {
  const primary = normalizeLetterKey(cell?.letter);
  if (!primary) return [];
  const options = [primary];
  if (isFakeTwinsCell(cell)) {
    const alt = normalizeLetterKey(cell?.altLetter);
    if (alt && alt !== primary) {
      options.push(alt);
    }
  }
  return options;
}

function cloneGridCell(cell) {
  return {
    letter: cell?.letter ?? "",
    bonus: cell?.bonus ?? null,
    altLetter: cell?.altLetter ?? null,
    specialType: cell?.specialType ?? null,
  };
}

function cloneGridWithFakeTwinsCell(grid, index, altLetter) {
  if (!Array.isArray(grid)) return [];
  const safeIndex = Number(index);
  const safeAltLetter = String(altLetter || "").trim();
  return grid.map((cell, cellIndex) => {
    const cloned = cloneGridCell(cell);
    if (cellIndex !== safeIndex) return cloned;
    return {
      ...cloned,
      altLetter: safeAltLetter || null,
      specialType: safeAltLetter ? FAKE_TWINS_TYPE : null,
    };
  });
}

export function computeScore(wordNorm, path, board, special = null, resolvedLettersByIndex = null) {
  let base = 0;
  let wordMultiplier = 1;
  const bonusKey =
    special && special.bonusLetter ? normalizeLetterKey(special.bonusLetter) : null;
  const bonusValue =
    special && Number.isFinite(special.bonusLetterScore) ? special.bonusLetterScore : null;
  const disableBonuses = !!special?.disableBonuses;

  for (const idx of path) {
    const tile = board[idx];
    const bonus = tile.bonus;
    const resolvedLetter = resolvedLettersByIndex?.[idx] || tile?.letter;
    const baseTileValue = isFakeTwinsCell(tile) ? tileScore(tile) : tileScoreForLetter(resolvedLetter);
    const letterValue =
      bonusKey && bonusValue != null && normalizeLetterKey(resolvedLetter) === bonusKey
        ? bonusValue
        : baseTileValue;

    if (disableBonuses) {
      base += letterValue;
      continue;
    }

    if (bonus === "L2") base += letterValue * 2;
    else if (bonus === "L3") base += letterValue * 3;
    else if (bonus === "M2") {
      base += letterValue;
      wordMultiplier *= 2;
    } else if (bonus === "M3") {
      base += letterValue;
      wordMultiplier *= 3;
    } else {
      base += letterValue;
    }
  }

  const len = wordNorm.length;
  const bonusLength =
    len >= 8 ? 15 :
    len === 7 ? 10 :
    len === 6 ? 6 :
    len === 5 ? 3 : 0;
  const fakeTwinsBonus =
    isFakeTwinsSpecial(special) && pathUsesFakeTwinsCell(path, board) ? 20 : 0;

  return (base + bonusLength) * wordMultiplier + fakeTwinsBonus;
}

export function summarizeBonuses(path, board) {
  const counts = { L2: 0, L3: 0, M2: 0, M3: 0 };
  for (const idx of path) {
    const bonus = board[idx]?.bonus;
    if (bonus && counts[bonus] !== undefined) counts[bonus]++;
  }
  return counts;
}

// -----------------
// Pathfinder / solveur
// -----------------

// Chemin â€œoptimisÃ© scoreâ€ pour un mot donnÃ© (wordNorm dÃ©jÃ  normalisÃ©)
function resolveWordOnBoard(board, wordNorm, special = null, forcedPath = null) {
  if (!Array.isArray(board) || board.length === 0) return null;
  if (!wordNorm || wordNorm.length < getMinimumWordLength(special)) return null;
  const total = board.length;
  const size = Math.sqrt(total);
  if (!Number.isFinite(size) || size <= 0) return null;
  const used = new Array(total).fill(false);
  const safeForcedPath =
    Array.isArray(forcedPath) && forcedPath.length > 0
      ? forcedPath.every((idx) => Number.isInteger(idx) && idx >= 0 && idx < total)
        ? [...forcedPath]
        : null
      : null;

  let best = null;

  function registerCandidate(path, resolvedLettersByIndex, usedFakeTwins) {
    const pts = computeScore(wordNorm, path, board, special, resolvedLettersByIndex);
    if (!best || pts > best.pts) {
      best = {
        path: [...path],
        pts,
        usedFakeTwins,
        resolvedLettersByIndex: { ...resolvedLettersByIndex },
      };
    }
  }

  function dfs(idx, pos, path, resolvedLettersByIndex, usedFakeTwins) {
    const cell = board[idx];
    const options = getCellLetterOptions(cell);
    if (!options.length) return;
    const primary = normalizeLetterKey(cell?.letter);

    for (const label of options) {
      if (!wordNorm.startsWith(label, pos)) continue;

      const nextPos = pos + label.length;
      const nextPath = [...path, idx];
      const nextResolvedLettersByIndex = {
        ...resolvedLettersByIndex,
        [idx]: label === "qu" ? "Qu" : label.toUpperCase(),
      };
      const nextUsedFakeTwins = usedFakeTwins || isFakeTwinsCell(cell);

      if (nextPos === wordNorm.length) {
        if (!safeForcedPath || nextPath.length === safeForcedPath.length) {
          registerCandidate(nextPath, nextResolvedLettersByIndex, nextUsedFakeTwins);
        }
        continue;
      }

      used[idx] = true;
      if (safeForcedPath) {
        const nextIdx = safeForcedPath[nextPath.length];
        if (
          Number.isInteger(nextIdx) &&
          !used[nextIdx] &&
          neighbors(idx, size, total).includes(nextIdx)
        ) {
          dfs(nextIdx, nextPos, nextPath, nextResolvedLettersByIndex, nextUsedFakeTwins);
        }
      } else {
        for (const nb of neighbors(idx, size, total)) {
          if (!used[nb]) {
            dfs(nb, nextPos, nextPath, nextResolvedLettersByIndex, nextUsedFakeTwins);
          }
        }
      }
      used[idx] = false;
    }
  }

  const starts = safeForcedPath ? [safeForcedPath[0]] : [...Array(total).keys()];
  for (const startIdx of starts) {
    if (!Number.isInteger(startIdx) || startIdx < 0 || startIdx >= total) continue;
    dfs(startIdx, 0, [], {}, false);
  }

  return best;
}

export function findBestPathForWord(board, wordNorm, special = null) {
  return resolveWordOnBoard(board, wordNorm, special)?.path || null;
}

export function pathMatchesWord(board, wordNorm, path, special = null) {
  return !!resolveWordOnBoard(board, wordNorm, special, path);
}
// Filtre un dico (Set de mots normalisÃ©s) en ne gardant
// que les mots compatibles avec les lettres prÃ©sentes sur la grille.
export function filterDictionary(dictionary, board, special = null) {
  const boardLetters = new Set();
  board.forEach((cell) => {
    getCellLetterOptions(cell).forEach((letter) => boardLetters.add(letter));
  });
  const minWordLength = getMinimumWordLength(special);

  const filtered = new Set(
    [...dictionary].filter((word) => {
      if (!word || word.length < minWordLength) return false;
      let i = 0;
      while (i < word.length) {
        const char = word[i] === "q" && word[i + 1] === "u" ? "qu" : word[i];
        i += char === "qu" ? 2 : 1;
        if (!boardLetters.has(char)) return false;
      }
      return true;
    })
  );

  return filtered;
}

// Solveur complet : renvoie une Map(wordNorm -> { path, pts })
export function solveGrid(board, dictionary, special = null) {
  if (!dictionary) {
    return new Map();
  }

  const filtered = filterDictionary(dictionary, board, special);
  const found = new Map();
  const minWordLength = getMinimumWordLength(special);

  for (const word of filtered) {
    if (word.length < minWordLength || word.length > 25) continue;
    const resolved = resolveWordOnBoard(board, word, special);
    if (resolved?.path) {
      found.set(word, {
        path: resolved.path,
        pts: resolved.pts,
        usedFakeTwins: !!resolved.usedFakeTwins,
      });
    }
  }

  return found;
}

// Fonction pratique pour valider / scorer UN mot cÃ´tÃ© serveur
// - retourne null si le mot nâ€™est pas sur la grille
// - sinon { norm, path, pts }
export function scoreWordOnGrid(rawWord, board, special = null) {
  const norm = normalizeWord(rawWord);
  if (!norm || norm.length < getMinimumWordLength(special)) return null;

  const resolved = resolveWordOnBoard(board, norm, special);
  if (!resolved?.path) return null;

  return {
    norm,
    path: resolved.path,
    pts: resolved.pts,
    usedFakeTwins: !!resolved.usedFakeTwins,
  };
}

export function scoreWordOnGridWithPath(rawWord, board, path, special = null) {
  const norm = normalizeWord(rawWord);
  if (!norm || norm.length < getMinimumWordLength(special)) return null;
  const resolved = resolveWordOnBoard(board, norm, special, path);
  if (!resolved?.path) return null;
  return {
    norm,
    path: resolved.path,
    pts: resolved.pts,
    usedFakeTwins: !!resolved.usedFakeTwins,
  };
}

export function findBestMovableBonusWord(board, wordsIterable) {
  const words = Array.from(wordsIterable || []);
  let best = null;
  for (const word of words) {
    const scored = scoreWordOnGrid(word, board, null);
    if (!scored || !Array.isArray(scored.path) || scored.path.length === 0) continue;
    const candidate = {
      word,
      pts: Number(scored.pts) || 0,
      path: scored.path,
      placements: {},
    };
    for (let i = 0; i < MOVABLE_BONUS_KEYS.length && i < scored.path.length; i += 1) {
      candidate.placements[MOVABLE_BONUS_KEYS[i]] = scored.path[i];
    }
    if (
      !best ||
      candidate.pts > best.pts ||
      (candidate.pts === best.pts && String(candidate.word).length > String(best.word).length)
    ) {
      best = candidate;
    }
  }
  return best;
}

const FAKE_TWINS_FALLBACK_ALT_LETTERS = Object.freeze([
  "E",
  "A",
  "I",
  "S",
  "N",
  "R",
  "T",
  "L",
  "O",
  "U",
  "D",
  "M",
  "C",
  "P",
]);

function collectCandidateAltLetters(baseSolved) {
  const counts = new Map();
  for (const [word] of baseSolved.entries()) {
    if (word.length < FAKE_TWINS_MIN_WORD_LENGTH) continue;
    let i = 0;
    while (i < word.length) {
      const token = word[i] === "q" && word[i + 1] === "u" ? "qu" : word[i];
      i += token === "qu" ? 2 : 1;
      if (token === "qu") continue;
      const upper = token.toUpperCase();
      counts.set(upper, (counts.get(upper) || 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .sort((a, b) => {
      const diff = (b[1] || 0) - (a[1] || 0);
      if (diff !== 0) return diff;
      return String(a[0] || "").localeCompare(String(b[0] || ""), "fr", {
        sensitivity: "base",
      });
    })
    .map(([letter]) => letter);
  const merged = [...ranked];
  for (const fallback of FAKE_TWINS_FALLBACK_ALT_LETTERS) {
    if (!merged.includes(fallback)) merged.push(fallback);
  }
  return merged;
}

function collectCandidateTwinIndices(baseGrid, baseSolved, maxCandidates = 6) {
  const usageCounts = new Map();
  for (const [word, data] of baseSolved.entries()) {
    if (word.length < FAKE_TWINS_MIN_WORD_LENGTH) continue;
    const path = Array.isArray(data?.path) ? data.path : [];
    path.forEach((idx) => {
      usageCounts.set(idx, (usageCounts.get(idx) || 0) + 1);
    });
  }
  const ranked = Array.from(usageCounts.entries())
    .filter(([idx]) => {
      const letter = normalizeLetterKey(baseGrid?.[idx]?.letter);
      return letter && letter !== "qu";
    })
    .sort((a, b) => {
      const diff = (b[1] || 0) - (a[1] || 0);
      if (diff !== 0) return diff;
      return a[0] - b[0];
    })
    .map(([idx]) => idx);
  if (ranked.length >= maxCandidates) {
    return {
      indices: ranked.slice(0, maxCandidates),
      usageCounts,
    };
  }
  for (let idx = 0; idx < baseGrid.length && ranked.length < maxCandidates; idx += 1) {
    const letter = normalizeLetterKey(baseGrid?.[idx]?.letter);
    if (!letter || letter === "qu" || ranked.includes(idx)) continue;
    ranked.push(idx);
  }
  return {
    indices: ranked,
    usageCounts,
  };
}

function summarizeSolvedFakeTwinsWords(solved, baseSolvedKeys) {
  let fakeTwinWords = 0;
  let altOnlyWords = 0;
  for (const [word, data] of solved.entries()) {
    if (word.length < FAKE_TWINS_MIN_WORD_LENGTH) continue;
    if (data?.usedFakeTwins) {
      fakeTwinWords += 1;
      if (!baseSolvedKeys.has(word)) altOnlyWords += 1;
    }
  }
  return { fakeTwinWords, altOnlyWords };
}

function compareFakeTwinsCandidates(a, b) {
  if (!a) return -1;
  if (!b) return 1;
  const totalDiff = (a.totalWords || 0) - (b.totalWords || 0);
  if (totalDiff !== 0) return totalDiff;
  const twinDiff = (a.fakeTwinWords || 0) - (b.fakeTwinWords || 0);
  if (twinDiff !== 0) return twinDiff;
  const altOnlyDiff = (a.altOnlyWords || 0) - (b.altOnlyWords || 0);
  if (altOnlyDiff !== 0) return altOnlyDiff;
  return (a.usageWeight || 0) - (b.usageWeight || 0);
}

export function buildFakeTwinsGrid(baseGrid, dictionary, options = {}) {
  const sourceGrid = Array.isArray(baseGrid) ? baseGrid.map(cloneGridCell) : [];
  if (!dictionary || !(dictionary instanceof Set) || sourceGrid.length === 0) {
    return {
      grid: sourceGrid,
      solved: new Map(),
      twinIndex: null,
      altLetter: null,
      totalWords: 0,
      fakeTwinWords: 0,
      altOnlyWords: 0,
    };
  }

  const specialConfig = {
    type: FAKE_TWINS_TYPE,
    minWordLength: FAKE_TWINS_MIN_WORD_LENGTH,
  };
  const baseSolved = solveGrid(sourceGrid, dictionary, specialConfig);
  const baseSolvedKeys = new Set(baseSolved.keys());
  const maxCellCandidates = Math.max(1, Math.trunc(options?.maxCellCandidates || 6));
  const maxAltLetters = Math.max(1, Math.trunc(options?.maxAltLetters || 6));
  const { indices: candidateIndices, usageCounts } = collectCandidateTwinIndices(
    sourceGrid,
    baseSolved,
    maxCellCandidates
  );
  const candidateAltLetters = collectCandidateAltLetters(baseSolved);

  let best = null;
  let fallback = null;

  for (const idx of candidateIndices) {
    const cell = sourceGrid[idx];
    const primary = normalizeLetterKey(cell?.letter);
    if (!primary || primary === "qu") continue;
    let tested = 0;
    for (const altLetter of candidateAltLetters) {
      if (!altLetter || normalizeLetterKey(altLetter) === primary) continue;
      const grid = cloneGridWithFakeTwinsCell(sourceGrid, idx, altLetter);
      const solved = solveGrid(grid, dictionary, specialConfig);
      const { fakeTwinWords, altOnlyWords } = summarizeSolvedFakeTwinsWords(solved, baseSolvedKeys);
      const candidate = {
        grid,
        solved,
        twinIndex: idx,
        altLetter,
        totalWords: solved.size,
        fakeTwinWords,
        altOnlyWords,
        usageWeight: usageCounts.get(idx) || 0,
      };
      if (!fallback || compareFakeTwinsCandidates(candidate, fallback) > 0) {
        fallback = candidate;
      }
      if (fakeTwinWords > 0 && (!best || compareFakeTwinsCandidates(candidate, best) > 0)) {
        best = candidate;
      }
      tested += 1;
      if (tested >= maxAltLetters) break;
    }
  }

  const chosen = best || fallback;
  if (!chosen) {
    return {
      grid: sourceGrid,
      solved: baseSolved,
      twinIndex: null,
      altLetter: null,
      totalWords: baseSolved.size,
      fakeTwinWords: 0,
      altOnlyWords: 0,
    };
  }

  return chosen;
}

