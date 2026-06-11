export const OCID_TYPE = "ocid";
export const FAKE_TWINS_TYPE = "fake_twins";
export const FAKE_TWINS_MIN_WORD_LENGTH = 4;
export const FAKE_TWINS_WORD_BONUS = 50;

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

function buildNeighborsByIndex(total, size) {
  return Array.from({ length: total }, (_, idx) => neighbors(idx, size));
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

export function findPathForWord(board, targetNorm, special = null) {
  return findBestPathForWord(board, targetNorm, special);
}

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

export function tileScore(tile) {
  const primary = tileScoreForLetter(tile?.letter);
  if (!isFakeTwinsCell(tile)) return primary;
  return primary + tileScoreForLetter(tile?.altLetter);
}

export function computeScore(word, path, board, special = null, resolvedLettersByIndex = null) {
  if (special?.classicBoggleScoring) {
    return classicBoggleScoreForLength(word?.length || 0);
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
    const bonus = tile?.bonus;
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

function resolveWordOnBoard(board, wordNorm, special = null, forcedPath = null, options = {}) {
  if (!Array.isArray(board) || board.length === 0) return null;
  const minLength = Number.isFinite(options?.minWordLength)
    ? Math.max(1, Math.trunc(options.minWordLength))
    : getMinimumWordLength(special);
  if (!wordNorm || wordNorm.length < minLength) return null;
  const total = board.length;
  const size = Math.max(1, Math.round(Math.sqrt(total)));
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

export function findBestPathForWord(board, targetNorm, special = null) {
  return resolveWordOnBoard(board, targetNorm, special)?.path || null;
}

export function findBestPathForPreview(board, targetNorm, special = null) {
  return resolveWordOnBoard(board, targetNorm, special, null, { minWordLength: 1 })?.path || null;
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
        fakeTwinsTwinIndex:
          Number.isInteger(resolved.fakeTwinsTwinIndex) ? resolved.fakeTwinsTwinIndex : null,
        fakeTwinsResolvedLetter: resolved.fakeTwinsResolvedLetter ?? null,
        fakeTwinsUsesAlt: !!resolved.fakeTwinsUsesAlt,
      });
    }
  }
  return found;
}
