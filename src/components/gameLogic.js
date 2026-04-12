export const FAKE_TWINS_TYPE = "fake_twins";
export const FAKE_TWINS_MIN_WORD_LENGTH = 4;

export function normalizeWord(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0153/gi, "oe")
    .replace(/\u00e6/gi, "ae")
    .replace(/['" -]/g, "")
    .toLowerCase();
}

export function neighbors(i, size) {
  const n = size || 4;
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

const SCRABBLE_FR = {
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

export function findPathForWord(board, targetNorm, special = null) {
  return findBestPathForWord(board, targetNorm, special);
}

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

export function tileScore(tile) {
  const primary = tileScoreForLetter(tile?.letter);
  if (!isFakeTwinsCell(tile)) return primary;
  return primary + tileScoreForLetter(tile?.altLetter);
}

export function computeScore(word, path, board, special = null, resolvedLettersByIndex = null) {
  let base = 0;
  let wordMultiplier = 1;
  const bonusKey =
    special && special.bonusLetter ? normalizeLetterKey(special.bonusLetter) : null;
  const bonusValue =
    special && Number.isFinite(special.bonusLetterScore) ? special.bonusLetterScore : null;
  const disableBonuses = !!special?.disableBonuses;

  for (const idx of path) {
    const tile = board[idx];
    const bonus = tile?.bonus;
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
    } else base += letterValue;
  }

  const bonusLength =
    word.length >= 8
      ? 15
      : word.length === 7
      ? 10
      : word.length === 6
      ? 6
      : word.length === 5
      ? 3
      : 0;
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

function resolveWordOnBoard(board, wordNorm, special = null, forcedPath = null) {
  if (!Array.isArray(board) || board.length === 0) return null;
  if (!wordNorm || wordNorm.length < getMinimumWordLength(special)) return null;
  const total = board.length;
  const size = Math.max(1, Math.round(Math.sqrt(total)));
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
          neighbors(idx, size).includes(nextIdx)
        ) {
          dfs(nextIdx, nextPos, nextPath, nextResolvedLettersByIndex, nextUsedFakeTwins);
        }
      } else {
        for (const nb of neighbors(idx, size)) {
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

export function findBestPathForWord(board, targetNorm, special = null) {
  return resolveWordOnBoard(board, targetNorm, special)?.path || null;
}

export function pathMatchesWord(board, wordNorm, path, special = null) {
  return !!resolveWordOnBoard(board, wordNorm, special, path);
}

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

export function solveAll(board, dictionary, special = null) {
  const found = new Map();
  const filtered = filterDictionary(dictionary, board, special);
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
