// shared/gameLogic.js
// Logique pure du Boggle : génération de grille, voisinage, scoring, solveur.

// -----------------
// Constantes
// -----------------
export const SIZE = 4;
export const MOVABLE_BONUS_KEYS = Object.freeze(["L2", "L3", "M2", "M3"]);
export const OCID_TYPE = "ocid";
export const FAKE_TWINS_TYPE = "fake_twins";
export const FAKE_TWINS_MIN_WORD_LENGTH = 2;
export const FAKE_TWINS_WORD_BONUS = 50;
export const FAKE_TWINS_COMPLETION_BONUS = 500;
export const FAKE_TWINS_COMPLETION_TARGET_RATIO = 0.4;
export const FAKE_TWINS_MIN_WORDS = 25;
export const FAKE_TWINS_MAX_WORDS = 90;
export const FAKE_TWINS_MIN_SIDE_WORD_RATIO = 0.2;
const FAKE_TWINS_MIN_PRIMARY_WORDS = 3;
const FAKE_TWINS_PREFERRED_MAX_PRIMARY_WORDS = 12;
const FAKE_TWINS_RARE_LETTERS = new Set(["k", "w", "x", "y", "z"]);

export function getFakeTwinsCompletionTarget(totalWords) {
  const safeTotal = Math.max(0, Math.trunc(Number(totalWords) || 0));
  return safeTotal > 0 ? Math.ceil(safeTotal * FAKE_TWINS_COMPLETION_TARGET_RATIO) : 0;
}

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

const FAKE_TWINS_LETTER_POOL = Object.freeze([
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
]);

const FAKE_TWINS_DICTIONARY_CACHE = new WeakMap();

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

function buildNeighborsByIndex(total, size) {
  return Array.from({ length: total }, (_, idx) => neighbors(idx, size, total));
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

function shuffleCopy(list, rand) {
  const copy = Array.isArray(list) ? [...list] : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
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

function getFakeTwinsUsage(path, board, resolvedLettersByIndex = null) {
  if (!Array.isArray(path) || !Array.isArray(board)) {
    return {
      usedFakeTwins: false,
      fakeTwinsTwinIndex: null,
      fakeTwinsResolvedLetter: null,
      fakeTwinsResolvedKey: "",
      fakeTwinsUsesAlt: false,
    };
  }

  for (const idx of path) {
    const cell = board[idx];
    if (!isFakeTwinsCell(cell)) continue;
    const primaryKey = normalizeLetterKey(cell?.letter);
    const altKey = normalizeLetterKey(cell?.altLetter);
    const resolvedValue = resolvedLettersByIndex?.[idx] || cell?.letter;
    const resolvedKey = normalizeLetterKey(resolvedValue);
    if (!resolvedKey || (resolvedKey !== primaryKey && resolvedKey !== altKey)) continue;
    return {
      usedFakeTwins: true,
      fakeTwinsTwinIndex: idx,
      fakeTwinsResolvedLetter: resolvedKey === altKey ? cell?.altLetter ?? null : cell?.letter ?? null,
      fakeTwinsResolvedKey: resolvedKey,
      fakeTwinsUsesAlt: resolvedKey === altKey,
    };
  }

  return {
    usedFakeTwins: false,
    fakeTwinsTwinIndex: null,
    fakeTwinsResolvedLetter: null,
    fakeTwinsResolvedKey: "",
    fakeTwinsUsesAlt: false,
  };
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

export function buildPathWordVariants(board, path, special = null) {
  if (!Array.isArray(board) || !Array.isArray(path) || path.length === 0) return [];
  let candidates = [{ raw: "", display: "", usedFakeTwins: false }];
  for (const idx of path) {
    const cell = board?.[idx];
    if (!cell) return [];
    const primaryDisplay = String(cell?.letter || "").trim();
    const primaryRaw = normalizeWord(primaryDisplay);
    if (!primaryRaw) return [];
    const options = [{ raw: primaryRaw, display: primaryDisplay, usedFakeTwins: false }];
    const altDisplay = String(cell?.altLetter || "").trim();
    const altRaw = normalizeWord(altDisplay);
    if (
      isFakeTwinsSpecial(special) &&
      cell?.specialType === FAKE_TWINS_TYPE &&
      altRaw &&
      altRaw !== primaryRaw
    ) {
      options.push({ raw: altRaw, display: altDisplay, usedFakeTwins: true });
    }
    const next = [];
    for (const candidate of candidates) {
      for (const option of options) {
        next.push({
          raw: `${candidate.raw}${option.raw}`,
          display: `${candidate.display}${option.display}`,
          usedFakeTwins: candidate.usedFakeTwins || option.usedFakeTwins,
        });
      }
    }
    const deduped = new Map();
    next.forEach((candidate) => {
      const key = `${candidate.raw}|${candidate.display}|${candidate.usedFakeTwins ? 1 : 0}`;
      if (!deduped.has(key)) deduped.set(key, candidate);
    });
    candidates = Array.from(deduped.values());
  }
  return candidates.filter((candidate) => candidate.raw);
}

function cloneGridCell(cell) {
  return {
    letter: cell?.letter ?? "",
    bonus: cell?.bonus ?? null,
    altLetter: cell?.altLetter ?? null,
    specialType: cell?.specialType ?? null,
  };
}

function tokenizeWord(word) {
  const tokens = [];
  for (let i = 0; i < word.length; i += 1) {
    if (word[i] === "q" && word[i + 1] === "u") {
      tokens.push("qu");
      i += 1;
      continue;
    }
    tokens.push(word[i]);
  }
  return tokens;
}

function buildBoardData(grid) {
  const size = Math.max(1, Math.round(Math.sqrt(Array.isArray(grid) ? grid.length : 0)));
  const letters = (Array.isArray(grid) ? grid : []).map((cell) => normalizeLetterKey(cell?.letter));
  return {
    letters,
    neighborsByIndex: letters.map((_, idx) => neighbors(idx, size, letters.length)),
    lettersSet: new Set(letters.filter(Boolean)),
  };
}

function buildWordsByIndex(solved) {
  const wordsByIndex = new Map();
  if (!(solved instanceof Map)) return wordsByIndex;
  for (const [word, meta] of solved.entries()) {
    const path = Array.isArray(meta?.path) ? meta.path : [];
    for (const idx of path) {
      if (!wordsByIndex.has(idx)) wordsByIndex.set(idx, []);
      wordsByIndex.get(idx).push(word);
    }
  }
  return wordsByIndex;
}

function getFakeTwinsDictionaryEntries(dictionary) {
  if (FAKE_TWINS_DICTIONARY_CACHE.has(dictionary)) {
    return FAKE_TWINS_DICTIONARY_CACHE.get(dictionary);
  }

  const byToken = new Map();
  const entries = [];
  for (const word of dictionary) {
    if (!word || word.length < FAKE_TWINS_MIN_WORD_LENGTH || word.length > 25) continue;
    const tokens = tokenizeWord(word);
    const letters = new Set(tokens);
    const entry = { word, tokens, letters };
    entries.push(entry);
    for (const token of letters) {
      if (!byToken.has(token)) byToken.set(token, []);
      byToken.get(token).push(entry);
    }
  }

  const indexed = { byToken, entries, completionBySet: new WeakMap() };
  FAKE_TWINS_DICTIONARY_CACHE.set(dictionary, indexed);
  return indexed;
}

function getFakeTwinsCompletionDictionaryEntries(dictionaryEntries, completionWordSet) {
  if (
    !(completionWordSet instanceof Set) ||
    completionWordSet.size === 0 ||
    !dictionaryEntries ||
    typeof dictionaryEntries !== "object"
  ) {
    return dictionaryEntries;
  }
  if (dictionaryEntries.completionBySet?.has(completionWordSet)) {
    return dictionaryEntries.completionBySet.get(completionWordSet);
  }
  const byToken = new Map();
  for (const entry of dictionaryEntries.entries || []) {
    if (!completionWordSet.has(normalizeWord(entry?.word || ""))) continue;
    for (const token of entry.letters || []) {
      if (!byToken.has(token)) byToken.set(token, []);
      byToken.get(token).push(entry);
    }
  }
  const indexed = { byToken };
  dictionaryEntries.completionBySet?.set(completionWordSet, indexed);
  return indexed;
}

function wordFitsBoardWithAlt(letters, boardLetters, altKey) {
  for (const token of letters) {
    if (token === altKey) continue;
    if (!boardLetters.has(token)) return false;
  }
  return true;
}

function canSpellWordUsingForcedTile(tokens, boardData, forcedIndex, forcedToken) {
  if (!Array.isArray(tokens) || !tokens.length) return false;
  const positions = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] === forcedToken) positions.push(i);
  }
  if (!positions.length) return false;

  const { letters, neighborsByIndex } = boardData;
  function buildPrefix(currentIndex, tokenPos, used) {
    if (tokenPos < 0) return [used];
    const states = [];
    for (const nb of neighborsByIndex[currentIndex] || []) {
      if (used.has(nb) || letters[nb] !== tokens[tokenPos]) continue;
      const nextUsed = new Set(used);
      nextUsed.add(nb);
      states.push(...buildPrefix(nb, tokenPos - 1, nextUsed));
    }
    return states;
  }

  function buildSuffix(currentIndex, tokenPos, used) {
    if (tokenPos >= tokens.length) return true;
    for (const nb of neighborsByIndex[currentIndex] || []) {
      if (used.has(nb) || letters[nb] !== tokens[tokenPos]) continue;
      used.add(nb);
      if (buildSuffix(nb, tokenPos + 1, used)) return true;
      used.delete(nb);
    }
    return false;
  }

  for (const forcedPos of positions) {
    const prefixStates = buildPrefix(forcedIndex, forcedPos - 1, new Set([forcedIndex]));
    for (const prefixUsed of prefixStates) {
      if (buildSuffix(forcedIndex, forcedPos + 1, new Set(prefixUsed))) {
        return true;
      }
    }
  }

  return false;
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
  if (special?.classicBoggleScoring) {
    return classicBoggleScoreForLength(wordNorm?.length || 0);
  }

  let base = 0;
  let wordMultiplier = 1;
  let usesFakeTwinsCell = false;
  const bonusKey =
    special && special.bonusLetter ? normalizeLetterKey(special.bonusLetter) : null;
  const bonusValue =
    special && Number.isFinite(special.bonusLetterScore) ? special.bonusLetterScore : null;
  const disableBonuses = !!special?.disableBonuses;

  for (const idx of path) {
    const tile = board[idx];
    const bonus = tile.bonus;
    const resolvedLetter = resolvedLettersByIndex?.[idx] || tile?.letter;
    const fakeTwinsCell = isFakeTwinsCell(tile);
    if (fakeTwinsCell) usesFakeTwinsCell = true;
    const baseTileValue = fakeTwinsCell ? tileScore(tile) : tileScoreForLetter(resolvedLetter);
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
    isFakeTwinsSpecial(special) && usesFakeTwinsCell ? FAKE_TWINS_WORD_BONUS : 0;

  return (base + bonusLength) * wordMultiplier + fakeTwinsBonus;
}

function classicBoggleScoreForLength(length) {
  if (length >= 8) return 11;
  if (length === 7) return 5;
  if (length === 6) return 3;
  if (length === 5) return 2;
  if (length >= 3) return 1;
  return 0;
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
  const neighborsByIndex = buildNeighborsByIndex(total, size);
  const letterOptionsByIndex = board.map((cell) => getCellLetterOptions(cell));
  const safeForcedPath =
    Array.isArray(forcedPath) && forcedPath.length > 0
      ? forcedPath.every((idx) => Number.isInteger(idx) && idx >= 0 && idx < total)
        ? [...forcedPath]
        : null
      : null;

  let best = null;

  function registerCandidate(path, resolvedLettersByIndex) {
    const pts = computeScore(wordNorm, path, board, special, resolvedLettersByIndex);
    const fakeTwinsUsage = getFakeTwinsUsage(path, board, resolvedLettersByIndex);
    if (!best || pts > best.pts) {
      best = {
        path: [...path],
        pts,
        usedFakeTwins: fakeTwinsUsage.usedFakeTwins,
        fakeTwinsTwinIndex: fakeTwinsUsage.fakeTwinsTwinIndex,
        fakeTwinsResolvedLetter: fakeTwinsUsage.fakeTwinsResolvedLetter,
        fakeTwinsResolvedKey: fakeTwinsUsage.fakeTwinsResolvedKey,
        fakeTwinsUsesAlt: fakeTwinsUsage.fakeTwinsUsesAlt,
        resolvedLettersByIndex: { ...resolvedLettersByIndex },
      };
    }
  }

  function dfs(idx, pos, path, resolvedLettersByIndex) {
    const options = letterOptionsByIndex[idx];
    if (!options.length) return;

    for (const label of options) {
      if (!wordNorm.startsWith(label, pos)) continue;

      const nextPos = pos + label.length;
      const prevResolvedLetter = resolvedLettersByIndex[idx];
      path.push(idx);
      resolvedLettersByIndex[idx] = label === "qu" ? "Qu" : label.toUpperCase();

      if (nextPos === wordNorm.length) {
        if (!safeForcedPath || path.length === safeForcedPath.length) {
          registerCandidate(path, resolvedLettersByIndex);
        }
        if (prevResolvedLetter === undefined) delete resolvedLettersByIndex[idx];
        else resolvedLettersByIndex[idx] = prevResolvedLetter;
        path.pop();
        continue;
      }

      used[idx] = true;
      if (safeForcedPath) {
        const nextIdx = safeForcedPath[path.length];
        if (
          Number.isInteger(nextIdx) &&
          !used[nextIdx] &&
          neighborsByIndex[idx].includes(nextIdx)
        ) {
          dfs(nextIdx, nextPos, path, resolvedLettersByIndex);
        }
      } else {
        for (const nb of neighborsByIndex[idx]) {
          if (!used[nb]) {
            dfs(nb, nextPos, path, resolvedLettersByIndex);
          }
        }
      }
      used[idx] = false;
      if (prevResolvedLetter === undefined) delete resolvedLettersByIndex[idx];
      else resolvedLettersByIndex[idx] = prevResolvedLetter;
      path.pop();
    }
  }

  if (safeForcedPath) {
    const startIdx = safeForcedPath[0];
    if (Number.isInteger(startIdx) && startIdx >= 0 && startIdx < total) {
      dfs(startIdx, 0, [], {});
    }
  } else {
    for (let startIdx = 0; startIdx < total; startIdx += 1) {
      dfs(startIdx, 0, [], {});
    }
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

  const filtered = new Set();
  for (const word of dictionary) {
    if (!word || word.length < minWordLength) continue;
    let fits = true;
    let i = 0;
    while (i < word.length) {
      const char = word[i] === "q" && word[i + 1] === "u" ? "qu" : word[i];
      i += char === "qu" ? 2 : 1;
      if (!boardLetters.has(char)) {
        fits = false;
        break;
      }
    }
    if (fits) filtered.add(word);
  }

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
        fakeTwinsTwinIndex:
          Number.isInteger(resolved.fakeTwinsTwinIndex) ? resolved.fakeTwinsTwinIndex : null,
        fakeTwinsResolvedLetter: resolved.fakeTwinsResolvedLetter ?? null,
        fakeTwinsUsesAlt: !!resolved.fakeTwinsUsesAlt,
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
    fakeTwinsTwinIndex:
      Number.isInteger(resolved.fakeTwinsTwinIndex) ? resolved.fakeTwinsTwinIndex : null,
    fakeTwinsResolvedLetter: resolved.fakeTwinsResolvedLetter ?? null,
    fakeTwinsUsesAlt: !!resolved.fakeTwinsUsesAlt,
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
    fakeTwinsTwinIndex:
      Number.isInteger(resolved.fakeTwinsTwinIndex) ? resolved.fakeTwinsTwinIndex : null,
    fakeTwinsResolvedLetter: resolved.fakeTwinsResolvedLetter ?? null,
    fakeTwinsUsesAlt: !!resolved.fakeTwinsUsesAlt,
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

function collectCandidateAltLetters(rand, maxLetters = FAKE_TWINS_LETTER_POOL.length) {
  const shuffled = shuffleCopy(FAKE_TWINS_LETTER_POOL, rand);
  const common = [];
  const rare = [];
  shuffled.forEach((letter) => {
    const key = normalizeLetterKey(letter);
    if (FAKE_TWINS_RARE_LETTERS.has(key)) rare.push(letter);
    else common.push(letter);
  });
  return [...common, ...rare].slice(
    0,
    Math.max(1, Math.trunc(maxLetters || FAKE_TWINS_LETTER_POOL.length))
  );
}

function getFakeTwinsLetterPenalty(primaryLetter, altLetter) {
  const primary = normalizeLetterKey(primaryLetter);
  const alt = normalizeLetterKey(altLetter);
  let penalty = 0;
  if (FAKE_TWINS_RARE_LETTERS.has(primary)) penalty += 250;
  if (FAKE_TWINS_RARE_LETTERS.has(alt)) penalty += 350;
  return penalty;
}

function collectCandidateTwinIndices(
  baseGrid,
  wordsByIndex,
  rand,
  maxCandidates = null,
  maxWords = FAKE_TWINS_MAX_WORDS
) {
  const preferred = [];
  const fallback = [];
  const overflow = [];
  const preferredMax = Math.min(maxWords, FAKE_TWINS_PREFERRED_MAX_PRIMARY_WORDS);
  for (let idx = 0; idx < baseGrid.length; idx += 1) {
    const letter = normalizeLetterKey(baseGrid?.[idx]?.letter);
    if (!letter || letter === "qu") continue;
    const baseCount = (wordsByIndex.get(idx) || []).length;
    const isRarePrimary = FAKE_TWINS_RARE_LETTERS.has(letter);
    if (
      !isRarePrimary &&
      baseCount >= FAKE_TWINS_MIN_PRIMARY_WORDS &&
      baseCount <= preferredMax
    ) {
      preferred.push(idx);
    } else if (baseCount > 0 && baseCount <= maxWords) {
      fallback.push(idx);
    } else if (baseCount > 0) {
      overflow.push(idx);
    }
  }
  const shuffled = [
    ...shuffleCopy(preferred, rand),
    ...shuffleCopy(fallback, rand),
    ...shuffleCopy(overflow, rand),
  ];
  const limit =
    maxCandidates == null
      ? shuffled.length
      : Math.max(1, Math.min(shuffled.length, Math.trunc(maxCandidates)));
  return {
    indices: shuffled.slice(0, limit),
  };
}

function summarizeFakeTwinsCandidate(
  primaryLetterWords,
  altLetterWords,
  maxWords = FAKE_TWINS_MAX_WORDS,
  primaryCompletionWords = primaryLetterWords,
  altCompletionWords = altLetterWords
) {
  const fakeTwinBonusWords =
    Math.max(0, Number(primaryLetterWords) || 0) + Math.max(0, Number(altLetterWords) || 0);
  const fakeTwinWords =
    Math.max(0, Number(primaryCompletionWords) || 0) +
    Math.max(0, Number(altCompletionWords) || 0);
  const minWords = Math.min(FAKE_TWINS_MIN_WORDS, maxWords);
  const targetMid = (minWords + maxWords) / 2;
  const minSideWords =
    fakeTwinWords > 0 ? Math.ceil(fakeTwinWords * FAKE_TWINS_MIN_SIDE_WORD_RATIO) : 0;
  const sidesUsed = primaryLetterWords > 0 && altLetterWords > 0;
  const balanced = sidesUsed && Math.min(primaryLetterWords, altLetterWords) >= minSideWords;
  const withinWordTarget = fakeTwinWords >= minWords && fakeTwinWords <= maxWords;
  const targetScore =
    (withinWordTarget ? 2000 : 0) -
    Math.abs(fakeTwinWords - targetMid) * 120 +
    Math.min(primaryLetterWords, altLetterWords) * 35 -
    Math.max(0, minWords - fakeTwinWords) * 500 -
    Math.max(0, fakeTwinWords - maxWords) * 1000 -
    Math.max(0, minSideWords - Math.min(primaryLetterWords, altLetterWords)) * 400 -
    (sidesUsed ? 0 : 200);
  return {
    fakeTwinWords,
    fakeTwinCompletionWords: fakeTwinWords,
    fakeTwinCompletionTarget: getFakeTwinsCompletionTarget(fakeTwinWords),
    fakeTwinBonusWords,
    altOnlyWords: Math.max(0, Number(altLetterWords) || 0),
    primaryLetterWords: Math.max(0, Number(primaryLetterWords) || 0),
    altLetterWords: Math.max(0, Number(altLetterWords) || 0),
    primaryCompletionWords: Math.max(0, Number(primaryCompletionWords) || 0),
    altCompletionWords: Math.max(0, Number(altCompletionWords) || 0),
    minSideWords,
    sidesUsed,
    balanced,
    withinWordTarget,
    meetsTarget: withinWordTarget && balanced,
    targetScore,
  };
}

function buildPathKey(path) {
  return Array.isArray(path) ? path.join(",") : "";
}

function isFakeTwinsCompletionWord(word, completionWordSet) {
  if (!(completionWordSet instanceof Set) || completionWordSet.size === 0) return true;
  return completionWordSet.has(normalizeWord(word));
}

function countFakeTwinsCompletionWords(words, completionWordSet) {
  if (!Array.isArray(words) || words.length === 0) return 0;
  let count = 0;
  for (const word of words) {
    if (isFakeTwinsCompletionWord(word, completionWordSet)) count += 1;
  }
  return count;
}

function summarizeSolvedFakeTwinsWords(solved, baseSolvedKeys, grid, completionWordSet = null) {
  let fakeTwinBonusWords = 0;
  let fakeTwinCompletionWords = 0;
  let altOnlyWords = 0;
  let primaryLetterWords = 0;
  let altLetterWords = 0;
  let primaryCompletionWords = 0;
  let altCompletionWords = 0;
  const fakeTwinPaths = new Set();
  const pathCounts = new Map();
  for (const [word, data] of solved.entries()) {
    if (word.length < FAKE_TWINS_MIN_WORD_LENGTH) continue;
    if (data?.usedFakeTwins) {
      fakeTwinBonusWords += 1;
      const countsForCompletion = isFakeTwinsCompletionWord(word, completionWordSet);
      data.fakeTwinsCompletionWord = countsForCompletion;
      data.fakeTwinsBonusOnly = !countsForCompletion;
      if (countsForCompletion) fakeTwinCompletionWords += 1;
      const pathKey = buildPathKey(data?.path);
      if (pathKey) {
        fakeTwinPaths.add(pathKey);
        pathCounts.set(pathKey, (pathCounts.get(pathKey) || 0) + 1);
      }
      if (!baseSolvedKeys.has(word)) altOnlyWords += 1;
      const twinIndex = Number.isInteger(data?.fakeTwinsTwinIndex) ? data.fakeTwinsTwinIndex : null;
      const twinCell = twinIndex != null ? grid?.[twinIndex] : null;
      const resolvedKey = normalizeLetterKey(data?.fakeTwinsResolvedLetter);
      const primaryKey = normalizeLetterKey(twinCell?.letter);
      const altKey = normalizeLetterKey(twinCell?.altLetter);
      if (resolvedKey && resolvedKey === altKey) {
        altLetterWords += 1;
        if (countsForCompletion) altCompletionWords += 1;
      } else if (resolvedKey && resolvedKey === primaryKey) {
        primaryLetterWords += 1;
        if (countsForCompletion) primaryCompletionWords += 1;
      }
    }
  }
  const duplicatePathWords = Array.from(pathCounts.values()).reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0
  );
  const baseMinSideWords =
    fakeTwinCompletionWords > 0
      ? Math.ceil(fakeTwinCompletionWords * FAKE_TWINS_MIN_SIDE_WORD_RATIO)
      : 0;
  const minSideWords = baseMinSideWords + Math.ceil(duplicatePathWords / 2);
  const sidesUsed = primaryCompletionWords > 0 && altCompletionWords > 0;
  const balanced = sidesUsed && Math.min(primaryCompletionWords, altCompletionWords) >= minSideWords;
  const withinWordTarget =
    fakeTwinCompletionWords >= FAKE_TWINS_MIN_WORDS &&
    fakeTwinCompletionWords <= FAKE_TWINS_MAX_WORDS;
  const targetMid = (FAKE_TWINS_MIN_WORDS + FAKE_TWINS_MAX_WORDS) / 2;
  const targetScore =
    (withinWordTarget ? 2000 : 0) -
    Math.abs(fakeTwinCompletionWords - targetMid) * 120 +
    Math.min(primaryCompletionWords, altCompletionWords) * 35 -
    Math.max(0, FAKE_TWINS_MIN_WORDS - fakeTwinCompletionWords) * 500 -
    Math.max(0, fakeTwinCompletionWords - FAKE_TWINS_MAX_WORDS) * 1000 -
    Math.max(0, minSideWords - Math.min(primaryCompletionWords, altCompletionWords)) * 400 -
    duplicatePathWords * 120 -
    (sidesUsed ? 0 : 200);
  return {
    fakeTwinWords: fakeTwinCompletionWords,
    fakeTwinCompletionWords,
    fakeTwinCompletionTarget: getFakeTwinsCompletionTarget(fakeTwinCompletionWords),
    fakeTwinBonusWords,
    fakeTwinUniquePaths: fakeTwinPaths.size,
    fakeTwinDuplicatePathWords: duplicatePathWords,
    altOnlyWords,
    primaryLetterWords,
    altLetterWords,
    primaryCompletionWords,
    altCompletionWords,
    minSideWords,
    sidesUsed,
    balanced,
    withinWordTarget,
    meetsTarget: withinWordTarget && balanced,
    targetScore,
  };
}

function compareFakeTwinsCandidates(a, b) {
  if (!a) return -1;
  if (!b) return 1;
  const targetDiff = (a.targetScore || 0) - (b.targetScore || 0);
  if (targetDiff !== 0) return targetDiff;
  const totalDiff = (a.totalWords || 0) - (b.totalWords || 0);
  if (totalDiff !== 0) return totalDiff;
  const altOnlyDiff = (a.altOnlyWords || 0) - (b.altOnlyWords || 0);
  if (altOnlyDiff !== 0) return altOnlyDiff;
  return (
    Math.min(a.primaryLetterWords || 0, a.altLetterWords || 0) -
    Math.min(b.primaryLetterWords || 0, b.altLetterWords || 0)
  );
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
      fakeTwinCompletionWords: 0,
      fakeTwinCompletionTarget: 0,
      fakeTwinBonusWords: 0,
      fakeTwinUniquePaths: 0,
      fakeTwinDuplicatePathWords: 0,
      altOnlyWords: 0,
      primaryLetterWords: 0,
      altLetterWords: 0,
      primaryCompletionWords: 0,
      altCompletionWords: 0,
      minSideWords: 0,
      sidesUsed: false,
      balanced: false,
      withinWordTarget: false,
      meetsTwinWordTarget: false,
      targetScore: -Infinity,
    };
  }

  const specialConfig = {
    type: FAKE_TWINS_TYPE,
    minWordLength: FAKE_TWINS_MIN_WORD_LENGTH,
    disableBonuses: true,
  };
  const baseSolved = solveGrid(sourceGrid, dictionary, specialConfig);
  const baseSolvedKeys = new Set(baseSolved.keys());
  const wordsByIndex = buildWordsByIndex(baseSolved);
  const boardData = buildBoardData(sourceGrid);
  const dictionaryEntries = getFakeTwinsDictionaryEntries(dictionary);
  const maxCellCandidates = Math.max(
    1,
    Math.trunc(options?.maxCellCandidates || sourceGrid.length || 1)
  );
  const maxAltLetters = Math.max(
    1,
    Math.trunc(options?.maxAltLetters || FAKE_TWINS_LETTER_POOL.length)
  );
  const maxWords = Math.max(1, Math.trunc(options?.maxWords || FAKE_TWINS_MAX_WORDS));
  const completionWordSet = null;
  const hasCompletionFilter = false;
  const candidateDictionaryEntries = dictionaryEntries;
  const rand = mulberry32(Number(options?.candidateSeed) || 0);
  const { indices: candidateIndices } = collectCandidateTwinIndices(
    sourceGrid,
    wordsByIndex,
    rand,
    maxCellCandidates,
    maxWords
  );
  const candidateAltLetters = collectCandidateAltLetters(rand, maxAltLetters);

  let best = null;

  for (const idx of candidateIndices) {
    const cell = sourceGrid[idx];
    const primary = normalizeLetterKey(cell?.letter);
    if (!primary || primary === "qu") continue;
    const primaryWords = wordsByIndex.get(idx) || [];
    const primaryLetterWords = primaryWords.length;
    const primaryCompletionWords = countFakeTwinsCompletionWords(primaryWords, completionWordSet);
    for (const altLetter of candidateAltLetters) {
      const altKey = normalizeLetterKey(altLetter);
      if (!altLetter || !altKey || altKey === primary || altKey === "qu") continue;
      let altOnlyWords = 0;
      let altOnlyCompletionWords = 0;
      for (const entry of candidateDictionaryEntries.byToken.get(altKey) || []) {
        if (baseSolvedKeys.has(entry.word)) continue;
        if (!wordFitsBoardWithAlt(entry.letters, boardData.lettersSet, altKey)) continue;
        if (canSpellWordUsingForcedTile(entry.tokens, boardData, idx, altKey)) {
          altOnlyWords += 1;
          if (hasCompletionFilter || isFakeTwinsCompletionWord(entry.word, completionWordSet)) {
            altOnlyCompletionWords += 1;
            if (primaryCompletionWords + altOnlyCompletionWords > maxWords) break;
          }
        }
      }
      const primaryCandidateWords = hasCompletionFilter
        ? primaryCompletionWords
        : primaryLetterWords;
      const summary = summarizeFakeTwinsCandidate(
        primaryCandidateWords,
        altOnlyWords,
        maxWords,
        primaryCompletionWords,
        altOnlyCompletionWords
      );
      const letterPenalty = getFakeTwinsLetterPenalty(primary, altLetter);
      const candidate = {
        twinIndex: idx,
        altLetter,
        totalWords: summary.fakeTwinWords,
        fakeTwinWords: summary.fakeTwinWords,
        fakeTwinCompletionWords: summary.fakeTwinCompletionWords,
        fakeTwinCompletionTarget: summary.fakeTwinCompletionTarget,
        fakeTwinBonusWords: summary.fakeTwinBonusWords,
        fakeTwinUniquePaths: summary.fakeTwinWords,
        fakeTwinDuplicatePathWords: 0,
        altOnlyWords: summary.altOnlyWords,
        primaryLetterWords: summary.primaryLetterWords,
        altLetterWords: summary.altLetterWords,
        primaryCompletionWords: summary.primaryCompletionWords,
        altCompletionWords: summary.altCompletionWords,
        minSideWords: summary.minSideWords,
        sidesUsed: summary.sidesUsed,
        balanced: summary.balanced,
        withinWordTarget: summary.withinWordTarget,
        meetsTwinWordTarget: summary.meetsTarget,
        targetScore: summary.targetScore - letterPenalty,
      };
      if (candidate.meetsTwinWordTarget) {
        const grid = cloneGridWithFakeTwinsCell(sourceGrid, idx, altLetter);
        const solved = solveGrid(grid, dictionary, specialConfig);
        const resolvedSummary = summarizeSolvedFakeTwinsWords(
          solved,
          baseSolvedKeys,
          grid,
          completionWordSet
        );
        const resolvedCandidate = {
          grid,
          solved,
          twinIndex: idx,
          altLetter,
          totalWords: solved.size,
          fakeTwinWords: resolvedSummary.fakeTwinWords,
          fakeTwinCompletionWords: resolvedSummary.fakeTwinCompletionWords,
          fakeTwinCompletionTarget: resolvedSummary.fakeTwinCompletionTarget,
          fakeTwinBonusWords: resolvedSummary.fakeTwinBonusWords,
          fakeTwinUniquePaths: resolvedSummary.fakeTwinUniquePaths,
          fakeTwinDuplicatePathWords: resolvedSummary.fakeTwinDuplicatePathWords,
          altOnlyWords: resolvedSummary.altOnlyWords,
          primaryLetterWords: resolvedSummary.primaryLetterWords,
          altLetterWords: resolvedSummary.altLetterWords,
          primaryCompletionWords: resolvedSummary.primaryCompletionWords,
          altCompletionWords: resolvedSummary.altCompletionWords,
          minSideWords: resolvedSummary.minSideWords,
          sidesUsed: resolvedSummary.sidesUsed,
          balanced: resolvedSummary.balanced,
          withinWordTarget: resolvedSummary.withinWordTarget,
          meetsTwinWordTarget: resolvedSummary.meetsTarget,
          targetScore: resolvedSummary.targetScore - letterPenalty,
        };
        if (resolvedCandidate.meetsTwinWordTarget) {
          return resolvedCandidate;
        }
        if (!best || compareFakeTwinsCandidates(resolvedCandidate, best) > 0) {
          best = resolvedCandidate;
        }
        continue;
      }
      if (!best || compareFakeTwinsCandidates(candidate, best) > 0) {
        best = candidate;
      }
    }
  }

  const chosen = best;
  if (!chosen) {
    return {
      grid: sourceGrid,
      solved: baseSolved,
      twinIndex: null,
      altLetter: null,
      totalWords: baseSolved.size,
      fakeTwinWords: 0,
      fakeTwinCompletionWords: 0,
      fakeTwinCompletionTarget: 0,
      fakeTwinBonusWords: 0,
      fakeTwinUniquePaths: 0,
      fakeTwinDuplicatePathWords: 0,
      altOnlyWords: 0,
      primaryLetterWords: 0,
      altLetterWords: 0,
      primaryCompletionWords: 0,
      altCompletionWords: 0,
      minSideWords: 0,
      sidesUsed: false,
      balanced: false,
      withinWordTarget: false,
      meetsTwinWordTarget: false,
      targetScore: -Infinity,
    };
  }

  if (Array.isArray(chosen.grid) && chosen.solved instanceof Map) {
    return chosen;
  }

  const grid = cloneGridWithFakeTwinsCell(sourceGrid, chosen.twinIndex, chosen.altLetter);
  const solved = solveGrid(grid, dictionary, specialConfig);
  const summary = summarizeSolvedFakeTwinsWords(solved, baseSolvedKeys, grid, completionWordSet);
  return {
    grid,
    solved,
    twinIndex: chosen.twinIndex,
    altLetter: chosen.altLetter,
    totalWords: solved.size,
    fakeTwinWords: summary.fakeTwinWords,
    fakeTwinCompletionWords: summary.fakeTwinCompletionWords,
    fakeTwinCompletionTarget: summary.fakeTwinCompletionTarget,
    fakeTwinBonusWords: summary.fakeTwinBonusWords,
    fakeTwinUniquePaths: summary.fakeTwinUniquePaths,
    fakeTwinDuplicatePathWords: summary.fakeTwinDuplicatePathWords,
    altOnlyWords: summary.altOnlyWords,
    primaryLetterWords: summary.primaryLetterWords,
    altLetterWords: summary.altLetterWords,
    primaryCompletionWords: summary.primaryCompletionWords,
    altCompletionWords: summary.altCompletionWords,
    minSideWords: summary.minSideWords,
    sidesUsed: summary.sidesUsed,
    balanced: summary.balanced,
    withinWordTarget: summary.withinWordTarget,
    meetsTwinWordTarget: summary.meetsTarget,
    targetScore: summary.targetScore,
  };
}

