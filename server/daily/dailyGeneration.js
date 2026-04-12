import {
  applySeededBonuses,
  buildFakeTwinsGrid,
  FAKE_TWINS_MIN_WORD_LENGTH,
  FAKE_TWINS_TYPE,
  findBestMovableBonusWord,
  LETTER_BAG,
  MOVABLE_BONUS_KEYS,
  solveGrid,
} from "../../shared/gameLogic.js";

export const DAILY_GRID_SIZE = 4;
export const DAILY_DURATION_MS = 120 * 1000;
export const DAILY_MONSTROUS_MODE = "monstrous_grid";
export const DAILY_SPECIAL_MODE = "self_specials_3_words";
export const DAILY_FAKE_TWINS_MODE = "fake_twins_grid";

const DAILY_MONSTROUS_MIN_WORDS = 200;
const DAILY_MONSTROUS_MIN_TOTAL_SCORE = 4000;
const DAILY_MONSTROUS_MIN_LONG_LEN = 11;
const DAILY_MONSTROUS_MIN_LONG_WORDS = 3;
const DAILY_SPECIAL_MIN_WORDS = 120;
const DAILY_SPECIAL_MIN_LONG_LEN = 8;
const DAILY_FAKE_TWINS_MIN_WORDS = 120;
const DAILY_FAKE_TWINS_MIN_LONG_LEN = 8;
const DAILY_FAKE_TWINS_MIN_SPECIAL_WORDS = 8;
const MAX_GENERATION_ATTEMPTS = 240;
const FAKE_TWINS_PRIMARY_MAX_ATTEMPTS = 90;

function hashString(input) {
  const str = String(input ?? "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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

function randomLetterFromBag(rand) {
  const letter = LETTER_BAG[Math.floor(rand() * LETTER_BAG.length)];
  return letter === "Q" ? "Qu" : letter;
}

export function generateGridFromSeed(seed, size = DAILY_GRID_SIZE) {
  const rand = mulberry32(seed);
  const total = size * size;
  return Array(total)
    .fill(null)
    .map(() => ({ letter: randomLetterFromBag(rand), bonus: null }));
}

export function getGridLettersKey(grid) {
  if (!Array.isArray(grid)) return "";
  return grid.map((cell) => String(cell?.letter || "?")).join("|");
}

function summarizeSolvedGrid(solved, minLongWordLen = DAILY_MONSTROUS_MIN_LONG_LEN) {
  let maxLen = 0;
  let maxPts = 0;
  let totalPts = 0;
  let longWords = 0;
  for (const [word, data] of solved.entries()) {
    const len = word.length;
    const pts = Number(data?.pts) || 0;
    if (len > maxLen) maxLen = len;
    if (pts > maxPts) maxPts = pts;
    totalPts += pts;
    if (len >= minLongWordLen) longWords += 1;
  }
  return {
    words: solved.size,
    maxLen,
    maxPts,
    totalPts,
    longWords,
  };
}

function cloneGridWithoutBonuses(grid) {
  if (!Array.isArray(grid)) return [];
  return grid.map((cell) => ({
    letter: cell?.letter || "?",
    altLetter: cell?.altLetter || null,
    specialType: cell?.specialType || null,
    bonus: null,
  }));
}

function buildSpecial3WordsQuality(baseGrid, solved) {
  const bestMovableBonus =
    solved.size > 0 ? findBestMovableBonusWord(baseGrid, solved.keys()) : null;
  return bestMovableBonus
    ? {
        maxPts: Number(bestMovableBonus.pts) || 0,
        bestWord: bestMovableBonus.word || null,
        bestPath: Array.isArray(bestMovableBonus.path) ? bestMovableBonus.path : [],
        bestPlacements:
          bestMovableBonus.placements && typeof bestMovableBonus.placements === "object"
            ? bestMovableBonus.placements
            : null,
      }
    : null;
}

function compareDailyModeEntries(mode, a, b) {
  if (!a) return -1;
  if (!b) return 1;
  const aQuality = a?.gridQuality || {};
  const bQuality = b?.gridQuality || {};
  if (mode === DAILY_FAKE_TWINS_MODE) {
    const fakeTwinDiff = (aQuality.fakeTwinWords || 0) - (bQuality.fakeTwinWords || 0);
    if (fakeTwinDiff !== 0) return fakeTwinDiff;
  }
  const wordDiff = (a.wordCount || 0) - (b.wordCount || 0);
  if (wordDiff !== 0) return wordDiff;
  const lenDiff = (a.longestWordLen || 0) - (b.longestWordLen || 0);
  if (lenDiff !== 0) return lenDiff;
  const ptsDiff = (aQuality.totalPts || 0) - (bQuality.totalPts || 0);
  if (ptsDiff !== 0) return ptsDiff;
  return (aQuality.longWords || 0) - (bQuality.longWords || 0);
}

function buildDailyModeEntry(mode, seed, dictionary) {
  const baseGrid = generateGridFromSeed(seed, DAILY_GRID_SIZE);
  if (mode === DAILY_FAKE_TWINS_MODE) {
    const bonusGrid = applySeededBonuses(baseGrid, seed, MOVABLE_BONUS_KEYS);
    const fakeTwins = buildFakeTwinsGrid(bonusGrid, dictionary, {
      maxCellCandidates: 6,
      maxAltLetters: 6,
    });
    if (!Number.isInteger(fakeTwins?.twinIndex) || !fakeTwins?.altLetter) {
      return null;
    }
    const solved = fakeTwins?.solved || solveGrid(fakeTwins.grid, dictionary, {
      type: FAKE_TWINS_TYPE,
      minWordLength: FAKE_TWINS_MIN_WORD_LENGTH,
    });
    const summary = summarizeSolvedGrid(solved, DAILY_FAKE_TWINS_MIN_LONG_LEN);
    const fakeTwinWords = Array.from(solved.values()).filter((entry) => entry?.usedFakeTwins).length;
    const valid =
      summary.words < DAILY_FAKE_TWINS_MIN_WORDS ||
      summary.maxLen < DAILY_FAKE_TWINS_MIN_LONG_LEN ||
      fakeTwinWords < DAILY_FAKE_TWINS_MIN_SPECIAL_WORDS
        ? false
        : true;
    return {
      seed,
      gridSize: DAILY_GRID_SIZE,
      grid: fakeTwins.grid,
      wordCount: summary.words,
      longestWordLen: summary.maxLen,
      valid,
      gridQuality: {
        ...summary,
        fakeTwinWords,
        twinIndex: fakeTwins.twinIndex,
        altLetter: fakeTwins.altLetter,
      },
    };
  }
  if (mode === DAILY_MONSTROUS_MODE) {
    const grid = applySeededBonuses(baseGrid, seed, MOVABLE_BONUS_KEYS);
    const solved = solveGrid(grid, dictionary);
    const summary = summarizeSolvedGrid(solved, DAILY_MONSTROUS_MIN_LONG_LEN);
    const valid =
      summary.words < DAILY_MONSTROUS_MIN_WORDS ||
      summary.totalPts < DAILY_MONSTROUS_MIN_TOTAL_SCORE ||
      summary.maxLen < DAILY_MONSTROUS_MIN_LONG_LEN ||
      summary.longWords < DAILY_MONSTROUS_MIN_LONG_WORDS
        ? false
        : true;
    return {
      seed,
      gridSize: DAILY_GRID_SIZE,
      grid,
      wordCount: summary.words,
      longestWordLen: summary.maxLen,
      valid,
      gridQuality: {
        ...summary,
        special3Words: buildSpecial3WordsQuality(baseGrid, solved),
      },
    };
  }

  const solved = solveGrid(baseGrid, dictionary);
  const summary = summarizeSolvedGrid(solved, DAILY_SPECIAL_MIN_LONG_LEN);
  const valid =
    summary.words < DAILY_SPECIAL_MIN_WORDS ||
    summary.maxLen < DAILY_SPECIAL_MIN_LONG_LEN
      ? false
      : true;
  return {
    seed,
    gridSize: DAILY_GRID_SIZE,
    grid: baseGrid,
    wordCount: summary.words,
    longestWordLen: summary.maxLen,
    valid,
    gridQuality: {
      ...summary,
      special3Words: buildSpecial3WordsQuality(baseGrid, solved),
    },
  };
}

export function buildDailyModeGrid(
  dateId,
  mode,
  dictionary,
  { avoidGridKey = "", maxAttempts = MAX_GENERATION_ATTEMPTS } = {}
) {
  if (!dictionary || dictionary.size === 0) {
    throw new Error("daily_dictionary_missing");
  }
  const baseSeed = hashString(`${dateId}:${mode}`);
  let bestEntry = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const seed = baseSeed + attempt;
    const entry = buildDailyModeEntry(mode, seed, dictionary);
    if (!entry) continue;
    if (avoidGridKey && getGridLettersKey(entry.grid) === avoidGridKey) continue;
    if (entry.valid) {
      const { valid: _valid, ...readyEntry } = entry;
      return readyEntry;
    }
    if (!bestEntry || compareDailyModeEntries(mode, entry, bestEntry) > 0) {
      bestEntry = entry;
    }
  }
  if (bestEntry) {
    const { valid: _valid, ...fallbackEntry } = bestEntry;
    console.warn(
      `[daily] using fallback ${mode} grid for ${dateId} after ${maxAttempts} attempts`
    );
    return fallbackEntry;
  }
  throw new Error(`daily_${mode}_generation_failed`);
}

function buildFallbackFakeTwinsEntry(dateId, payload, dictionary) {
  if (!dictionary || dictionary.size === 0) return null;
  const candidateSources = [];
  if (Array.isArray(payload?.specialGrid) && payload.specialGrid.length > 0) {
    candidateSources.push({
      grid: payload.specialGrid,
      seed: payload?.specialSeed ?? null,
    });
  }
  if (Array.isArray(payload?.grid) && payload.grid.length > 0) {
    candidateSources.push({
      grid: payload.grid,
      seed: payload?.seed ?? null,
    });
  }

  for (const source of candidateSources) {
    const baseGrid = cloneGridWithoutBonuses(source.grid);
    const bonusSeed =
      Number.isFinite(Number(source.seed))
        ? Number(source.seed)
        : hashString(`${dateId}:${DAILY_FAKE_TWINS_MODE}:fallback`);
    const bonusGrid = applySeededBonuses(baseGrid, bonusSeed, MOVABLE_BONUS_KEYS);
    const fakeTwins = buildFakeTwinsGrid(bonusGrid, dictionary, {
      maxCellCandidates: 6,
      maxAltLetters: 6,
    });
    if (!Array.isArray(fakeTwins?.grid) || !Number.isInteger(fakeTwins?.twinIndex)) {
      continue;
    }
    const solved = fakeTwins?.solved || solveGrid(fakeTwins.grid, dictionary, {
      type: FAKE_TWINS_TYPE,
      minWordLength: FAKE_TWINS_MIN_WORD_LENGTH,
    });
    const summary = summarizeSolvedGrid(solved, DAILY_FAKE_TWINS_MIN_LONG_LEN);
    const fakeTwinWords = Array.from(solved.values()).filter((entry) => entry?.usedFakeTwins).length;
    if (
      summary.words < DAILY_FAKE_TWINS_MIN_WORDS ||
      summary.maxLen < DAILY_FAKE_TWINS_MIN_LONG_LEN ||
      fakeTwinWords < DAILY_FAKE_TWINS_MIN_SPECIAL_WORDS
    ) {
      continue;
    }
    return {
      seed: bonusSeed,
      gridSize: DAILY_GRID_SIZE,
      grid: fakeTwins.grid,
      wordCount: summary.words,
      longestWordLen: summary.maxLen,
      gridQuality: {
        ...summary,
        fakeTwinWords,
        twinIndex: fakeTwins.twinIndex,
        altLetter: fakeTwins.altLetter,
      },
    };
  }
  return null;
}

export function buildDailyPayload(dateId, dictionary) {
  const monstrous = buildDailyModeGrid(dateId, DAILY_MONSTROUS_MODE, dictionary);
  const special = buildDailyModeGrid(dateId, DAILY_SPECIAL_MODE, dictionary, {
    avoidGridKey: getGridLettersKey(monstrous.grid),
  });
  const fakeTwinsAvoidKey = getGridLettersKey(special.grid) || getGridLettersKey(monstrous.grid);
  let fakeTwins = null;
  try {
    fakeTwins = buildDailyModeGrid(dateId, DAILY_FAKE_TWINS_MODE, dictionary, {
      avoidGridKey: fakeTwinsAvoidKey,
      maxAttempts: FAKE_TWINS_PRIMARY_MAX_ATTEMPTS,
    });
  } catch (_) {
    fakeTwins = buildFallbackFakeTwinsEntry(
      dateId,
      {
        seed: monstrous.seed,
        grid: monstrous.grid,
        specialSeed: special.seed,
        specialGrid: special.grid,
      },
      dictionary
    );
  }
  if (!fakeTwins) {
    throw new Error(`daily_${DAILY_FAKE_TWINS_MODE}_generation_failed`);
  }
  return {
    dateId,
    durationMs: DAILY_DURATION_MS,
    generatedAt: Date.now(),
    seed: monstrous.seed,
    gridSize: monstrous.gridSize,
    grid: monstrous.grid,
    wordCount: monstrous.wordCount,
    longestWordLen: monstrous.longestWordLen,
    gridQuality: monstrous.gridQuality,
    specialSeed: special.seed,
    specialGridSize: special.gridSize,
    specialGrid: special.grid,
    specialWordCount: special.wordCount,
    specialLongestWordLen: special.longestWordLen,
    specialGridQuality: special.gridQuality,
    fakeTwinsSeed: fakeTwins.seed,
    fakeTwinsGridSize: fakeTwins.gridSize,
    fakeTwinsGrid: fakeTwins.grid,
    fakeTwinsWordCount: fakeTwins.wordCount,
    fakeTwinsLongestWordLen: fakeTwins.longestWordLen,
    fakeTwinsGridQuality: fakeTwins.gridQuality,
  };
}
