import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { parentPort } from "worker_threads";

import {
  applySeededBonuses,
  buildFakeTwinsGrid,
  FAKE_TWINS_MIN_WORD_LENGTH,
  FAKE_TWINS_TYPE,
  getFakeTwinsCompletionTarget,
  generateGrid,
  MOVABLE_BONUS_KEYS,
  OCID_TYPE,
  normalizeWord,
  solveGrid,
} from "../../shared/gameLogic.js";
import {
  FINALE_TILE_BONUS_MULTIPLIER,
  FINALE_TYPE,
} from "../../shared/finaleRules.js";
import {
  buildAnchoredGrid,
  buildAnchoredGridCandidate,
  buildRandomPath,
  MONSTROUS_ANCHOR_BUCKETS,
  pickWeightedBucket,
  pickUniqueLongestTarget,
  TARGET_LONG_ANCHOR_BUCKETS,
  tokenizeBoggleWord,
} from "./anchoredGeneration.js";
import {
  getOcidTargetCandidates,
  getRareBonusWordMetaMap,
} from "../stats/wordRarityService.js";
import {
  buildWordInsightSummary,
  pickWordThemeChallenge,
} from "../definitions/wordInsightService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_QUALITY_ATTEMPTS = 50;
const SPECIAL_QUALITY_ATTEMPTS = 220;
const TARGET_LONG_MIN_LEN = 10;
const TARGET_LONG_PREFERRED_LEN = 14;
const TARGET_LONG_BATCH_ATTEMPTS = 50;
const TARGET_LONG_BATCHES_PER_LEN = 2;
const RARE_WORD_BONUS_POINTS = 10;
const OCID_MIN_WORDS = 200;
const CLASSIC_BOGGLE_MIN_WORDS = 200;
const CLASSIC_BOGGLE_MIN_LONG_WORD_LEN = 8;
const CLASSIC_BOGGLE_MIN_LONG_WORD_COUNT = 3;
const MASSIVE_BOGGLE_ANCHOR_MIN_LEN = 12;
const BONUS_LETTER_MIN_WORDS = 30;
const BONUS_LETTER_SCORE = 20;
const MASSIVE_BOGGLE_TYPE = "massive_boggle";
const MASSIVE_BOGGLE_ANCHOR_BUCKETS = Object.freeze([
  { key: "12plus", weight: 1, minLen: MASSIVE_BOGGLE_ANCHOR_MIN_LEN },
]);
const TARGET_LONG_TOTAL_ATTEMPTS =
  TARGET_LONG_BATCH_ATTEMPTS *
  TARGET_LONG_BATCHES_PER_LEN *
  (TARGET_LONG_PREFERRED_LEN - TARGET_LONG_MIN_LEN + 1);
const TARGET_SCORE_MIN_PTS = 100;
const CULTURE_THEME_GENERATION_ENABLED =
  !/^(0|false|off|no)$/i.test(String(process.env.GOBBLE_CULTURE_THEME_GENERATION_ENABLED || "1"));
const CULTURE_THEME_MIN_WORDS = Math.max(
  2,
  Math.trunc(Number(process.env.GOBBLE_CULTURE_THEME_MIN_WORDS) || 10)
);
const CULTURE_THEME_MAX_WORDS = Math.max(
  CULTURE_THEME_MIN_WORDS,
  Math.trunc(Number(process.env.GOBBLE_CULTURE_THEME_MAX_WORDS) || 24)
);
const CULTURE_THEME_COMPLETION_RATIO = Math.min(
  1,
  Math.max(0.1, Number(process.env.GOBBLE_CULTURE_THEME_COMPLETION_RATIO) || 0.7)
);
const CULTURE_THEME_MAX_LOOKUPS = Math.max(
  50,
  Math.trunc(Number(process.env.GOBBLE_CULTURE_THEME_MAX_LOOKUPS) || 420)
);
const CULTURE_THEME_QUALITY_ATTEMPTS = Math.max(
  1,
  Math.trunc(Number(process.env.GOBBLE_CULTURE_THEME_QUALITY_ATTEMPTS) || 120)
);
const CULTURE_THEME_PREPARE_BUDGET_MS = Math.max(
  250,
  Math.trunc(Number(process.env.GOBBLE_CULTURE_THEME_PREPARE_BUDGET_MS) || 5000)
);

let dictionary = null;
try {
  const raw = readFileSync(path.join(__dirname, "../../public/dico.txt"), "utf8");
  dictionary = new Set(
    raw
      .split(/\r?\n/)
      .map((w) => normalizeWord(w.trim()))
      .filter(Boolean)
  );
} catch (err) {
  dictionary = null;
}

function normalizeLetterKey(letter) {
  if (!letter) return "";
  if (letter === "Qu") return "qu";
  return String(letter).toLowerCase();
}

function pickBonusLetter(grid, solved, minWords) {
  if (!grid || !solved || solved.size === 0) return null;
  const entries = [];
  const seen = new Set();
  for (const cell of grid) {
    const key = normalizeLetterKey(cell.letter);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    entries.push({ key, letter: cell.letter });
  }
  if (entries.length === 0) return null;
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }
  for (const entry of entries) {
    let count = 0;
    for (const word of solved.keys()) {
      if (word.includes(entry.key)) {
        count += 1;
        if (count >= minWords) break;
      }
    }
    if (count >= minWords) return entry.letter;
  }
  return null;
}

function analyzeGridQualityFromSolved(solved, minWords = 0, opts = {}) {
  const hasSolved = solved && solved.size > 0;
  let maxLen = 0;
  let maxPts = 0;
  let totalPts = 0;
  let longWords = 0;
  let fakeTwinWords = 0;
  const minLongWordLen = Math.max(0, opts?.minLongWordLen || 0);

  if (hasSolved) {
    for (const [word, data] of solved.entries()) {
      const len = word.length;
      const pts = data?.pts || 0;
      if (len > maxLen) maxLen = len;
      if (pts > maxPts) maxPts = pts;
      totalPts += pts;
      if (minLongWordLen > 0 && len >= minLongWordLen) {
        longWords++;
      }
      if (data?.usedFakeTwins) {
        fakeTwinWords++;
      }
    }
  }

  return {
    ok: minWords <= 0 || (hasSolved && solved.size >= minWords),
    words: hasSolved ? solved.size : 0,
    maxLen,
    maxPts,
    totalPts,
    longWords,
    fakeTwinWords,
  };
}

function serializeSolvedSolutions(solved) {
  if (!solved || typeof solved.entries !== "function") return [];
  return Array.from(solved.entries()).map(([word, data]) => ({
    word,
    pts: Number.isFinite(data?.pts) ? data.pts : 0,
    path: Array.isArray(data?.path) ? data.path : [],
    usedFakeTwins: !!data?.usedFakeTwins,
    rareBonusWord: !!data?.rareBonusWord,
    rareBonusPoints: Number.isFinite(data?.rareBonusPoints) ? data.rareBonusPoints : 0,
    rarityBucket: typeof data?.rarityBucket === "string" ? data.rarityBucket : "",
    rarityScore: Number.isFinite(data?.rarityScore) ? data.rarityScore : 0,
    fakeTwinsCompletionWord: !!data?.fakeTwinsCompletionWord,
    fakeTwinsBonusOnly: !!data?.fakeTwinsBonusOnly,
    fakeTwinsTwinIndex: Number.isInteger(data?.fakeTwinsTwinIndex)
      ? data.fakeTwinsTwinIndex
      : null,
    fakeTwinsResolvedLetter: data?.fakeTwinsResolvedLetter ?? null,
    fakeTwinsUsesAlt: !!data?.fakeTwinsUsesAlt,
  }));
}

function shouldPreferCultureThemeCandidate(roundPlan) {
  if (!CULTURE_THEME_GENERATION_ENABLED) return false;
  const type = String(roundPlan?.type || "");
  return type === "normal" && !roundPlan?.isSpecial;
}

function normalizeCultureThemeOptionList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function hashCultureThemeSeed(input) {
  const str = String(input ?? "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

async function buildCultureThemeChallengeForSolved(solved, options = {}) {
  if (!solved || typeof solved.keys !== "function" || solved.size < 12) return null;
  const summary = await buildWordInsightSummary(Array.from(solved.keys()), {
    maxLookups: CULTURE_THEME_MAX_LOOKUPS,
  });
  return pickWordThemeChallenge(summary, {
    minWords: CULTURE_THEME_MIN_WORDS,
    maxWords: CULTURE_THEME_MAX_WORDS,
    completionRatio: CULTURE_THEME_COMPLETION_RATIO,
    excludedThemes: normalizeCultureThemeOptionList(options.excludedThemes),
    themeUsageCounts: options.themeUsageCounts,
    selectionSeed: options.selectionSeed,
  });
}

function shouldApplyRareWordBonus(roundPlan) {
  const type = String(roundPlan?.type || "");
  return (
    type !== "target_long" &&
    type !== "target_score" &&
    type !== OCID_TYPE &&
    type !== "self_specials_3_words" &&
    type !== "speed" &&
    type !== MASSIVE_BOGGLE_TYPE
  );
}

function annotateRareBonusWords(solved, rareBonusWordMetaMap, roundPlan) {
  if (!shouldApplyRareWordBonus(roundPlan)) return solved;
  if (!(rareBonusWordMetaMap instanceof Map) || !rareBonusWordMetaMap.size) return solved;
  if (!solved || typeof solved.entries !== "function") return solved;
  for (const [word, data] of solved.entries()) {
    const meta = rareBonusWordMetaMap.get(normalizeWord(word));
    if (!meta) continue;
    data.rareBonusWord = true;
    data.rareBonusPoints = RARE_WORD_BONUS_POINTS;
    data.rarityBucket = meta.rarityBucket || "";
    data.rarityScore = Number(meta.rarityScore) || 0;
  }
  return solved;
}

function pickTargetLongLengthBucket() {
  return pickWeightedBucket(Math.random, TARGET_LONG_ANCHOR_BUCKETS)?.key || "14plus";
}

function pickTargetLongForMaxLenRange(solved, minLen, maxLen = Infinity) {
  const safeMinLen = Number(minLen);
  const safeMaxLen = Number(maxLen);
  if (!Number.isFinite(safeMinLen) || safeMinLen <= 0) return null;
  const longestUnique = pickTargetFromSolved(solved, "target_long", { minLongLen: 0 });
  if (!longestUnique?.word) return null;
  const length = Number(longestUnique.length);
  if (length < safeMinLen || length > safeMaxLen) return null;
  return longestUnique;
}

function pickTargetLongFromSolvedByBucket(solved, bucket) {
  if (bucket === "10-11") {
    return pickTargetLongForMaxLenRange(solved, 10, 11);
  }
  if (bucket === "12-13") {
    return pickTargetLongForMaxLenRange(solved, 12, 13);
  }
  if (bucket === "14plus") {
    return pickTargetFromSolved(solved, "target_long", { minLongLen: 14 });
  }
  return pickTargetLongForMaxLenRange(solved, TARGET_LONG_MIN_LEN);
}

function pickTargetFromSolved(solved, type, opts = {}) {
  if (!solved || solved.size === 0) return null;

  if (type === "target_long") {
    const minLongLen = Math.max(
      0,
      Number.isFinite(opts?.minLongLen) ? opts.minLongLen : TARGET_LONG_MIN_LEN
    );
    let maxLen = 0;
    for (const w of solved.keys()) {
      if (w.length > maxLen) maxLen = w.length;
    }
    if (maxLen < minLongLen) return null;
    const maxWords = [];
    for (const w of solved.keys()) {
      if (w.length === maxLen) maxWords.push(w);
      if (maxWords.length > 1) return null;
    }
    const word = maxWords[0];
    const path = solved.get(word)?.path || null;
    return { word, length: maxLen, path };
  }

  if (type === "target_score") {
    let maxPts = 0;
    for (const data of solved.values()) {
      const pts = data?.pts || 0;
      if (pts > maxPts) maxPts = pts;
    }
    if (maxPts < TARGET_SCORE_MIN_PTS) return null;
    const maxWords = [];
    for (const [w, data] of solved.entries()) {
      const pts = data?.pts || 0;
      if (pts === maxPts) maxWords.push(w);
      if (maxWords.length > 1) return null;
    }
    const word = maxWords[0];
    const path = solved.get(word)?.path || null;
    return { word, pts: maxPts, path };
  }

  return null;
}

function buildPreparedCandidate({
  grid,
  solved,
  roundPlan,
  roundNumber,
  effectiveMinWords,
  qualityOpts,
  targetWord = null,
  targetLength = null,
  targetPath = null,
  planExtras = null,
}) {
  const quality = analyzeGridQualityFromSolved(solved, effectiveMinWords, qualityOpts);
  quality.possibleScore = roundPlan?.fixedWordScore
    ? (quality.words || 0) * roundPlan.fixedWordScore
    : quality.totalPts;
  const minLongWords = roundPlan?.minLongWordCount || 0;
  let ok = quality.ok;
  if (roundPlan?.type === "monstrous") {
    const minTotal = roundPlan?.minTotalScore || 0;
    const minLen = roundPlan?.minLongWordLen || 0;
    ok =
      ok &&
      quality.possibleScore >= minTotal &&
      quality.maxLen >= minLen &&
      quality.longWords >= minLongWords;
  } else if (roundPlan?.type === FINALE_TYPE) {
    ok = ok && quality.possibleScore >= (roundPlan?.minTotalScore || 0);
  } else if (
    roundPlan?.type === "target_long" ||
    roundPlan?.type === "target_score" ||
    roundPlan?.type === OCID_TYPE
  ) {
    ok = ok && !!targetWord;
  } else if (roundPlan?.type === MASSIVE_BOGGLE_TYPE) {
    ok =
      ok &&
      quality.words >= Math.max(roundPlan?.minWords || 0, CLASSIC_BOGGLE_MIN_WORDS) &&
      quality.longWords >=
        Math.max(roundPlan?.minLongWordCount || 0, CLASSIC_BOGGLE_MIN_LONG_WORD_COUNT);
  }
  quality.ok = ok;
  const {
    ocidExcludedTargets,
    ocidTargetCandidates,
    rareBonusWordMetaMap,
    ...publicRoundPlan
  } = roundPlan && typeof roundPlan === "object" ? roundPlan : {};
  return {
    grid,
    quality,
    plan: { ...publicRoundPlan, ...(planExtras || null) },
    roundNumber,
    targetWord,
    targetLength,
    targetPath,
    solutions: serializeSolvedSolutions(solved),
  };
}

function shuffleArray(values) {
  const out = Array.isArray(values) ? [...values] : [];
  for (let idx = out.length - 1; idx > 0; idx -= 1) {
    const swapIdx = Math.floor(Math.random() * (idx + 1));
    [out[idx], out[swapIdx]] = [out[swapIdx], out[idx]];
  }
  return out;
}

function prepareAnchoredOcid({ roundPlan, roundNumber, size, maxAttemptsTotal, effectiveMinWords }) {
  if (!dictionary || roundPlan?.type !== OCID_TYPE) return null;
  const excludedTargets = new Set(
    Array.isArray(roundPlan?.ocidExcludedTargets)
      ? roundPlan.ocidExcludedTargets.map((word) => normalizeWord(word || "")).filter(Boolean)
      : []
  );
  const candidates = shuffleArray(roundPlan?.ocidTargetCandidates || []);
  if (!candidates.length) return null;
  const attemptsPerWord = Math.max(2, Math.ceil(maxAttemptsTotal / Math.max(1, candidates.length)));
  let bestCandidate = null;
  for (const target of candidates) {
    const word = normalizeWord(target?.word || "");
    if (excludedTargets.has(word)) continue;
    const tokens = tokenizeBoggleWord(word);
    if (!word || word.length > 13 || !tokens || tokens.length > size * size) continue;
    for (let attempt = 0; attempt < attemptsPerWord; attempt += 1) {
      const path = buildRandomPath(tokens.length, size, Math.random, 300);
      const grid = path ? buildAnchoredGrid(word, path, size, Math.random) : null;
      if (!grid?.length) continue;
      const solved = solveGrid(grid, dictionary);
      const solvedTarget = solved.get(word);
      if (!solvedTarget?.path) continue;
      const candidate = buildPreparedCandidate({
        grid,
        solved,
        roundPlan,
        roundNumber,
        effectiveMinWords: Math.max(effectiveMinWords, roundPlan?.minWords || OCID_MIN_WORDS),
        qualityOpts: {},
        targetWord: word,
        targetLength: word.length,
        targetPath: Array.isArray(solvedTarget.path) ? solvedTarget.path : path,
        planExtras: {
          ocidDefinition: String(target.definition || ""),
          ocidDefinitionSource: target.source || "",
          ocidDefinitionUrl: target.sourceUrl || "",
          ocidRarityBucket: target.rarityBucket || "",
          ocidRarityScore: Number(target.rarityScore) || 0,
          ocidPlayersFound: Number(target.playersFound) || 0,
        },
      });
      const score =
        (candidate.quality?.words || 0) +
        (candidate.quality?.possibleScore || 0) / 500 +
        (candidate.quality?.maxLen || 0);
      const bestScore =
        (bestCandidate?.quality?.words || 0) +
        (bestCandidate?.quality?.possibleScore || 0) / 500 +
        (bestCandidate?.quality?.maxLen || 0);
      if (!bestCandidate || score > bestScore) bestCandidate = candidate;
      if (candidate.quality?.ok) return candidate;
    }
  }
  return bestCandidate?.quality?.ok ? bestCandidate : null;
}

function prepareAnchoredTargetLong({ roundPlan, roundNumber, size, maxAttemptsTotal, effectiveMinWords }) {
  if (!dictionary || roundPlan?.type !== "target_long") return null;
  const qualityOpts = { minLongWordLen: roundPlan?.minLongWordLen || 0 };
  for (let attempt = 1; attempt <= maxAttemptsTotal; attempt += 1) {
    const anchor = buildAnchoredGridCandidate({
      dictionary,
      buckets: TARGET_LONG_ANCHOR_BUCKETS,
      size,
      rand: Math.random,
    });
    if (!anchor?.grid?.length || !anchor.word) continue;
    const solved = solveGrid(anchor.grid, dictionary);
    const target = pickUniqueLongestTarget(solved, anchor.word);
    if (!target?.word) continue;
    const candidate = buildPreparedCandidate({
      grid: anchor.grid,
      solved,
      roundPlan,
      roundNumber,
      effectiveMinWords,
      qualityOpts,
      targetWord: target.word,
      targetLength: target.length || target.word.length,
      targetPath: Array.isArray(target.path) ? target.path : null,
      planExtras: {
        targetLongBucket: anchor.bucket?.key || null,
        targetLongAnchorStrategy: "word_path",
      },
    });
    if (candidate.quality?.ok) return candidate;
  }
  return null;
}

function prepareAnchoredMassiveBoggle({
  roundPlan,
  roundNumber,
  size,
  maxAttemptsTotal,
  effectiveMinWords,
}) {
  if (!dictionary || roundPlan?.type !== MASSIVE_BOGGLE_TYPE) return null;
  const qualityOpts = {
    minLongWordLen: Math.max(
      roundPlan?.minLongWordLen || 0,
      CLASSIC_BOGGLE_MIN_LONG_WORD_LEN
    ),
  };
  const scoreConfig = {
    ...roundPlan,
    minWordLength: 3,
    classicBoggleScoring: true,
    disableBonuses: true,
  };
  let bestCandidate = null;

  for (let attempt = 1; attempt <= maxAttemptsTotal; attempt += 1) {
    const anchor = buildAnchoredGridCandidate({
      dictionary,
      buckets: MASSIVE_BOGGLE_ANCHOR_BUCKETS,
      size,
      rand: Math.random,
      maxPathRestarts: 300,
    });
    if (!anchor?.grid?.length || !anchor.word) continue;
    const solved = solveGrid(anchor.grid, dictionary, scoreConfig);
    const anchoredWord = solved.get(anchor.word);
    if (!anchoredWord?.path) continue;
    const candidate = buildPreparedCandidate({
      grid: anchor.grid,
      solved,
      roundPlan,
      roundNumber,
      effectiveMinWords: Math.max(effectiveMinWords, CLASSIC_BOGGLE_MIN_WORDS),
      qualityOpts,
      planExtras: {
        minWords: Math.max(roundPlan?.minWords || 0, CLASSIC_BOGGLE_MIN_WORDS),
        minLongWordLen: Math.max(
          roundPlan?.minLongWordLen || 0,
          CLASSIC_BOGGLE_MIN_LONG_WORD_LEN
        ),
        minLongWordCount: Math.max(
          roundPlan?.minLongWordCount || 0,
          CLASSIC_BOGGLE_MIN_LONG_WORD_COUNT
        ),
        minWordLength: 3,
        classicBoggleScoring: true,
        disableBonuses: true,
        bonusLetter: "",
        bonusLetterScore: 0,
      },
    });
    const score =
      (candidate.quality?.words || 0) +
      (candidate.quality?.possibleScore || 0) / 500 +
      (candidate.quality?.longWords || 0) * 10 +
      (candidate.quality?.maxLen || 0);
    const bestScore =
      (bestCandidate?.quality?.words || 0) +
      (bestCandidate?.quality?.possibleScore || 0) / 500 +
      (bestCandidate?.quality?.longWords || 0) * 10 +
      (bestCandidate?.quality?.maxLen || 0);
    if (!bestCandidate || score > bestScore) {
      bestCandidate = candidate;
    }
    if (candidate.quality?.ok) return candidate;
  }

  return bestCandidate?.quality?.ok ? bestCandidate : null;
}

function prepareAnchoredMonstrous({
  roundPlan,
  roundNumber,
  size,
  maxAttemptsTotal,
  effectiveMinWords,
  qualityOpts,
  rareBonusWordMetaMap = null,
}) {
  if (!dictionary || roundPlan?.type !== "monstrous") return null;
  const maxFillsPerAnchor = 10;
  const maxAnchors = Math.max(1, Math.ceil(maxAttemptsTotal / maxFillsPerAnchor));
  let bestCandidate = null;

  for (let anchorAttempt = 1; anchorAttempt <= maxAnchors; anchorAttempt += 1) {
    const anchor = buildAnchoredGridCandidate({
      dictionary,
      buckets: MONSTROUS_ANCHOR_BUCKETS,
      size,
      rand: Math.random,
    });
    const tokens = anchor?.word ? tokenizeBoggleWord(anchor.word) : null;
    if (!anchor?.word || !tokens || !Array.isArray(anchor.path)) continue;

    for (let fillAttempt = 1; fillAttempt <= maxFillsPerAnchor; fillAttempt += 1) {
      const plainGrid = buildAnchoredGrid(anchor.word, anchor.path, size, Math.random);
      if (!plainGrid?.length) continue;
      const grid = applySeededBonuses(
        plainGrid,
        Math.floor(Math.random() * 0xffffffff),
        MOVABLE_BONUS_KEYS
      );
      const solved = annotateRareBonusWords(
        solveGrid(grid, dictionary),
        rareBonusWordMetaMap,
        roundPlan
      );
      const candidate = buildPreparedCandidate({
        grid,
        solved,
        roundPlan,
        roundNumber,
        effectiveMinWords,
        qualityOpts,
        planExtras: {
          monstrousAnchorStrategy: "word_path",
          monstrousAnchorWord: anchor.word,
          monstrousAnchorPath: anchor.path,
        },
      });
      const score =
        (candidate.quality?.words || 0) +
        (candidate.quality?.possibleScore || 0) / 500 +
        (candidate.quality?.longWords || 0);
      const bestScore =
        (bestCandidate?.quality?.words || 0) +
        (bestCandidate?.quality?.possibleScore || 0) / 500 +
        (bestCandidate?.quality?.longWords || 0);
      if (!bestCandidate || score > bestScore) {
        bestCandidate = candidate;
      }
      if (candidate.quality?.ok) return candidate;
    }
  }

  return bestCandidate?.quality?.ok ? bestCandidate : null;
}

async function prepareNextGridJob({ roomConfig, roundPlan, roundNumber, cultureThemeOptions = null }) {
  const prepareStartedAt = Date.now();
  const minWords = roundPlan?.minWords ?? roomConfig?.minWords ?? 0;
  const maxAttempts = Math.max(
    1,
    roundPlan?.qualityAttempts || roomConfig?.qualityAttempts || MAX_QUALITY_ATTEMPTS
  );
  const needsBonusLetter = roundPlan?.type === "bonus_letter";
  const needsClassicBoggle = roundPlan?.type === MASSIVE_BOGGLE_TYPE;
  const needsFakeTwins = roundPlan?.type === FAKE_TWINS_TYPE;
  const needsFinaleScoring = roundPlan?.type === FINALE_TYPE;
  const finaleScoreConfig = needsFinaleScoring
    ? {
        type: FINALE_TYPE,
        tileBonusMultiplier:
          Number(roundPlan?.tileBonusMultiplier) || FINALE_TILE_BONUS_MULTIPLIER,
      }
    : null;
  const rareBonusWordMetaMap =
    roundPlan?.rareBonusWordMetaMap instanceof Map ? roundPlan.rareBonusWordMetaMap : null;
  const maxAttemptsBase = needsClassicBoggle
    ? Math.max(maxAttempts, SPECIAL_QUALITY_ATTEMPTS)
    : needsFakeTwins
    ? Math.max(maxAttempts, SPECIAL_QUALITY_ATTEMPTS)
    : maxAttempts;
  const cultureThemeDisabled = !!cultureThemeOptions?.disabled;
  const preferCultureThemeCandidate =
    !cultureThemeDisabled && shouldPreferCultureThemeCandidate(roundPlan);
  const cultureThemePrepareBudgetMs = preferCultureThemeCandidate
    ? CULTURE_THEME_PREPARE_BUDGET_MS
    : 0;
  let attemptsRun = 0;
  let cultureThemeChecks = 0;
  let cultureThemeMs = 0;
  let cultureThemeBudgetExceeded = false;
  const attachPrepareStats = (candidate) => {
    if (!candidate) return candidate;
    candidate.prepareStats = {
      attempts: attemptsRun,
      maxAttempts: maxAttemptsTotal,
      elapsedMs: Date.now() - prepareStartedAt,
      cultureThemeChecks,
      cultureThemeMs,
      cultureThemeBudgetMs: cultureThemePrepareBudgetMs,
      cultureThemeBudgetExceeded,
      cultureThemeFound: !!candidate.cultureThemeChallenge,
    };
    return candidate;
  };
  const maxAttemptsTotal =
    roundPlan?.type === "target_long"
      ? Math.max(maxAttemptsBase, TARGET_LONG_TOTAL_ATTEMPTS)
      : preferCultureThemeCandidate
      ? Math.max(maxAttemptsBase, CULTURE_THEME_QUALITY_ATTEMPTS)
      : maxAttemptsBase;
  const size = roomConfig?.gridSize || 4;
  const effectiveMinWords = dictionary
    ? needsClassicBoggle
      ? Math.max(minWords, CLASSIC_BOGGLE_MIN_WORDS)
      : minWords
    : 0;
  const qualityOpts = {
    minLongWordLen:
      roundPlan?.type === FAKE_TWINS_TYPE
        ? FAKE_TWINS_MIN_WORD_LENGTH
        : needsClassicBoggle
        ? Math.max(roundPlan?.minLongWordLen || 0, CLASSIC_BOGGLE_MIN_LONG_WORD_LEN)
        : roundPlan?.minLongWordLen || 0,
  };
  const isTargetLong = roundPlan?.type === "target_long";
  const targetLongBucket = isTargetLong ? pickTargetLongLengthBucket() : null;
  const isTargetLong11PlusMode = isTargetLong && targetLongBucket === "14plus";
  const targetLongMinLen = TARGET_LONG_MIN_LEN;
  const targetLongPreferredLen = Math.max(targetLongMinLen, TARGET_LONG_PREFERRED_LEN);
  const targetLongBatchSize = Math.max(1, Math.min(TARGET_LONG_BATCH_ATTEMPTS, maxAttemptsTotal));

  if (isTargetLong) {
    const anchored = prepareAnchoredTargetLong({
      roundPlan,
      roundNumber,
      size,
      maxAttemptsTotal,
      effectiveMinWords,
    });
    if (anchored?.grid?.length) return anchored;
  } else if (roundPlan?.type === OCID_TYPE) {
    const anchored = prepareAnchoredOcid({
      roundPlan,
      roundNumber,
      size,
      maxAttemptsTotal: Math.max(maxAttemptsTotal, SPECIAL_QUALITY_ATTEMPTS),
      effectiveMinWords,
    });
    if (anchored?.grid?.length) return anchored;
    return null;
  } else if (needsClassicBoggle) {
    const anchored = prepareAnchoredMassiveBoggle({
      roundPlan,
      roundNumber,
      size,
      maxAttemptsTotal: Math.max(maxAttemptsTotal, SPECIAL_QUALITY_ATTEMPTS),
      effectiveMinWords,
    });
    if (anchored?.grid?.length) return anchored;
  } else if (roundPlan?.type === "monstrous") {
    const anchored = prepareAnchoredMonstrous({
      roundPlan,
      roundNumber,
      size,
      maxAttemptsTotal,
      effectiveMinWords,
      qualityOpts,
      rareBonusWordMetaMap,
    });
    if (anchored?.grid?.length) return anchored;
  }

  let bestCandidate = null;
  let fallbackCandidate = null;
  let targetLongThreshold = targetLongPreferredLen;
  let targetLongAttemptsInBatch = 0;
  let targetLongBatchesAtLen = 0;
  let targetLongBestAtThreshold = null;

  for (let attempt = 1; attempt <= maxAttemptsTotal; attempt++) {
    attemptsRun = attempt;
    let grid = generateGrid(size);
    if (
      roundPlan?.type === "speed" ||
      roundPlan?.type === "target_long" ||
      roundPlan?.type === "bonus_letter" ||
      roundPlan?.type === MASSIVE_BOGGLE_TYPE ||
      roundPlan?.type === FAKE_TWINS_TYPE
    ) {
      grid = grid.map((cell) => ({ ...cell, bonus: null }));
    }

    let solved = null;
    let fakeTwinsCandidate = null;
    if (dictionary && needsFakeTwins) {
      fakeTwinsCandidate = buildFakeTwinsGrid(grid, dictionary, {
        maxCellCandidates: grid.length,
        maxAltLetters: 26,
        candidateSeed: attempt,
      });
      if (fakeTwinsCandidate?.grid?.length) {
        grid = fakeTwinsCandidate.grid;
      }
      solved = annotateRareBonusWords(
        fakeTwinsCandidate?.solved || null,
        rareBonusWordMetaMap,
        roundPlan
      );
    } else {
      solved = dictionary
        ? annotateRareBonusWords(
            solveGrid(
              grid,
              dictionary,
              needsClassicBoggle
                ? {
                    ...roundPlan,
                    minWordLength: 3,
                    classicBoggleScoring: true,
                    disableBonuses: true,
                  }
                : finaleScoreConfig
            ),
            rareBonusWordMetaMap,
            roundPlan
          )
        : null;
    }
    const quality = analyzeGridQualityFromSolved(solved, effectiveMinWords, qualityOpts);
    quality.possibleScore = roundPlan?.fixedWordScore
      ? (quality.words || 0) * roundPlan.fixedWordScore
      : quality.totalPts;

    const minLongWords = roundPlan?.minLongWordCount || 0;
    let ok = quality.ok;
    if (roundPlan?.type === "speed") {
      ok = ok && quality.words >= (roundPlan.minWords || 0);
    } else if (roundPlan?.type === "monstrous") {
      const minTotal = roundPlan?.minTotalScore || 0;
      const minLen = roundPlan?.minLongWordLen || 0;
      ok =
        ok &&
        quality.possibleScore >= minTotal &&
        quality.maxLen >= minLen &&
        quality.longWords >= minLongWords;
    } else if (needsFinaleScoring) {
      ok =
        ok &&
        !!dictionary &&
        quality.possibleScore >= (roundPlan?.minTotalScore || 0);
    } else if (needsClassicBoggle) {
      ok =
        ok &&
        !!dictionary &&
        quality.words >= CLASSIC_BOGGLE_MIN_WORDS &&
        quality.longWords >=
          (roundPlan?.minLongWordCount || CLASSIC_BOGGLE_MIN_LONG_WORD_COUNT);
    } else if (
      roundPlan?.type === "target_long" ||
      roundPlan?.type === "target_score" ||
      roundPlan?.type === "bonus_letter" ||
      roundPlan?.type === FAKE_TWINS_TYPE
    ) {
      ok = ok && !!dictionary;
    }
    if (needsFakeTwins) {
      ok =
        ok &&
        Number.isInteger(fakeTwinsCandidate?.twinIndex) &&
        !!fakeTwinsCandidate?.meetsTwinWordTarget;
      quality.fakeTwinWords = Number(fakeTwinsCandidate?.fakeTwinWords) || 0;
      quality.fakeTwinCompletionWords = Number(fakeTwinsCandidate?.fakeTwinCompletionWords) || 0;
      quality.fakeTwinCompletionTarget =
        Number(fakeTwinsCandidate?.fakeTwinCompletionTarget) ||
        getFakeTwinsCompletionTarget(quality.fakeTwinCompletionWords);
      quality.fakeTwinBonusWords = Number(fakeTwinsCandidate?.fakeTwinBonusWords) || 0;
      quality.fakeTwinUniquePaths = Number(fakeTwinsCandidate?.fakeTwinUniquePaths) || 0;
      quality.fakeTwinDuplicatePathWords =
        Number(fakeTwinsCandidate?.fakeTwinDuplicatePathWords) || 0;
      quality.fakeTwinPrimaryWords = Number(fakeTwinsCandidate?.primaryLetterWords) || 0;
      quality.fakeTwinAltWords = Number(fakeTwinsCandidate?.altLetterWords) || 0;
      quality.fakeTwinPrimaryCompletionWords =
        Number(fakeTwinsCandidate?.primaryCompletionWords) || 0;
      quality.fakeTwinAltCompletionWords = Number(fakeTwinsCandidate?.altCompletionWords) || 0;
      quality.fakeTwinTargetScore = Number(fakeTwinsCandidate?.targetScore) || 0;
    }
    quality.ok = ok;

    let targetWord = null;
    let targetLength = null;
    let targetPath = null;
    let bonusLetter = null;

    if (
      solved &&
      (roundPlan?.type === "target_long" || roundPlan?.type === "target_score")
    ) {
      if (isTargetLong) {
        const target = pickTargetLongFromSolvedByBucket(solved, targetLongBucket);
        if (target?.word) {
          targetWord = target.word;
          targetLength = target.length || target.word.length;
          targetPath = Array.isArray(target.path) ? target.path : null;
        }
      } else {
        const target = pickTargetFromSolved(solved, roundPlan.type, null);
        if (target?.word) {
          targetWord = target.word;
          targetLength = target.length || target.word.length;
          targetPath = Array.isArray(target.path) ? target.path : null;
        }
      }
      quality.ok = quality.ok && !!targetWord;
    }

    if (solved && needsBonusLetter) {
      const minLetterWords = roundPlan?.bonusLetterMinWords || BONUS_LETTER_MIN_WORDS;
      bonusLetter = pickBonusLetter(grid, solved, minLetterWords);
      quality.ok = quality.ok && !!bonusLetter;
    }

    const planForRound = {
      ...roundPlan,
      ...(bonusLetter
        ? {
            bonusLetter,
            bonusLetterScore: roundPlan?.bonusLetterScore || BONUS_LETTER_SCORE,
            disableBonuses: true,
          }
        : null),
      ...(needsClassicBoggle
        ? {
            minWords: Math.max(roundPlan?.minWords || 0, CLASSIC_BOGGLE_MIN_WORDS),
            minLongWordLen: Math.max(
              roundPlan?.minLongWordLen || 0,
              CLASSIC_BOGGLE_MIN_LONG_WORD_LEN
            ),
            minLongWordCount: Math.max(
              roundPlan?.minLongWordCount || 0,
              CLASSIC_BOGGLE_MIN_LONG_WORD_COUNT
            ),
            minWordLength: 3,
            classicBoggleScoring: true,
            disableBonuses: true,
            bonusLetter: "",
            bonusLetterScore: 0,
          }
        : null),
      ...(needsFakeTwins && Number.isInteger(fakeTwinsCandidate?.twinIndex)
        ? {
            minWordLength: FAKE_TWINS_MIN_WORD_LENGTH,
            twinIndex: fakeTwinsCandidate.twinIndex,
            altLetter: fakeTwinsCandidate.altLetter || null,
          }
        : null),
      ...(isTargetLong ? { targetLongBucket } : null),
    };

    const candidate = {
      grid,
      quality,
      plan: planForRound,
      roundNumber,
      targetWord,
      targetLength,
      targetPath,
      solutions: serializeSolvedSolutions(solved),
    };
    if (
      preferCultureThemeCandidate &&
      quality.ok &&
      solved &&
      (!cultureThemePrepareBudgetMs || Date.now() - prepareStartedAt < cultureThemePrepareBudgetMs)
    ) {
      const cultureThemeStartedAt = Date.now();
      cultureThemeChecks += 1;
      const cultureThemeChallenge = await buildCultureThemeChallengeForSolved(solved, {
        ...(cultureThemeOptions || {}),
        selectionSeed: hashCultureThemeSeed(
          `${roundNumber || 0}:${attempt}:${grid.map((cell) => cell?.letter || "").join("")}`
        ),
      });
      cultureThemeMs += Date.now() - cultureThemeStartedAt;
      if (cultureThemeChallenge) {
        candidate.cultureThemeChallenge = cultureThemeChallenge;
      }
    } else if (preferCultureThemeCandidate && quality.ok && solved && cultureThemePrepareBudgetMs) {
      cultureThemeBudgetExceeded = true;
    }
    const candidateHasRequiredTarget =
      roundPlan?.type === FAKE_TWINS_TYPE
        ? Number.isInteger(fakeTwinsCandidate?.twinIndex) && !!fakeTwinsCandidate?.altLetter
        : roundPlan?.type === "target_score" || roundPlan?.type === "target_long"
        ? !!targetWord
        : true;
    if (candidateHasRequiredTarget) {
      fallbackCandidate = candidate;
    }
    if (needsBonusLetter && !planForRound?.bonusLetter) {
      continue;
    }
    const currentScore =
      (quality?.words || 0) + (quality?.possibleScore || 0) / 500 + (quality?.longWords || 0);
    const bestScore =
      (bestCandidate?.quality?.words || 0) +
      (bestCandidate?.quality?.possibleScore || 0) / 500 +
      (bestCandidate?.quality?.longWords || 0);

    if (isTargetLong11PlusMode) {
      if (targetWord) {
        const candidateLen = Number.isFinite(targetLength) ? targetLength : 0;
        const bestLen = Number.isFinite(bestCandidate?.targetLength)
          ? bestCandidate.targetLength
          : 0;
        if (
          !bestCandidate ||
          candidateLen > bestLen ||
          (candidateLen === bestLen && currentScore > bestScore)
        ) {
          bestCandidate = candidate;
        }
        if (candidateLen >= targetLongThreshold) {
          const bestThresholdLen = Number.isFinite(targetLongBestAtThreshold?.targetLength)
            ? targetLongBestAtThreshold.targetLength
            : 0;
          const thresholdScore =
            (targetLongBestAtThreshold?.quality?.words || 0) +
            (targetLongBestAtThreshold?.quality?.possibleScore || 0) / 500 +
            (targetLongBestAtThreshold?.quality?.longWords || 0);
          if (
            !targetLongBestAtThreshold ||
            candidateLen > bestThresholdLen ||
            (candidateLen === bestThresholdLen && currentScore > thresholdScore)
          ) {
            targetLongBestAtThreshold = candidate;
          }
        }
      }
      targetLongAttemptsInBatch += 1;
      if (targetLongAttemptsInBatch >= targetLongBatchSize) {
        if (targetLongBestAtThreshold) {
          bestCandidate = targetLongBestAtThreshold;
          break;
        }
        targetLongAttemptsInBatch = 0;
        targetLongBatchesAtLen += 1;
        if (targetLongBatchesAtLen >= TARGET_LONG_BATCHES_PER_LEN) {
          if (targetLongThreshold > targetLongMinLen) {
            targetLongThreshold -= 1;
            targetLongBatchesAtLen = 0;
            targetLongBestAtThreshold = null;
          }
        }
      }
    } else if (isTargetLong) {
      if (targetWord) {
        if (!bestCandidate || currentScore > bestScore) {
          bestCandidate = candidate;
        }
        if (quality.ok) {
          bestCandidate = candidate;
          break;
        }
      }
    } else {
      if (candidateHasRequiredTarget && (!bestCandidate || currentScore > bestScore)) {
        bestCandidate = candidate;
      }

      if (quality.ok) {
        if (preferCultureThemeCandidate && !candidate.cultureThemeChallenge) {
          if (
            candidateHasRequiredTarget &&
            cultureThemePrepareBudgetMs &&
            Date.now() - prepareStartedAt >= cultureThemePrepareBudgetMs
          ) {
            cultureThemeBudgetExceeded = true;
            bestCandidate = candidate;
            break;
          }
          continue;
        }
        bestCandidate = candidate;
        break;
      }
    }
  }

  if (!bestCandidate && fallbackCandidate) {
    bestCandidate = fallbackCandidate;
  }

  return attachPrepareStats(bestCandidate);
}

function analyzeGridJob({ grid, roundPlan, roomConfig, scoreConfig }) {
  if (!Array.isArray(grid) || grid.length === 0) {
    return { quality: null };
  }
  const minWords = roundPlan?.minWords ?? roomConfig?.minWords ?? 0;
  const effectiveMinWords = dictionary ? minWords : 0;
  const qualityOpts = { minLongWordLen: roundPlan?.minLongWordLen || 0 };
  const effectiveScoreConfig =
    scoreConfig ||
    (roundPlan?.type === MASSIVE_BOGGLE_TYPE
      ? {
          ...roundPlan,
          minWordLength: 3,
          classicBoggleScoring: true,
          disableBonuses: true,
        }
      : roundPlan?.type === FINALE_TYPE
      ? {
          type: FINALE_TYPE,
          tileBonusMultiplier:
            Number(roundPlan?.tileBonusMultiplier) || FINALE_TILE_BONUS_MULTIPLIER,
        }
      : null);
  const solved = dictionary ? solveGrid(grid, dictionary, effectiveScoreConfig) : null;
  const quality = analyzeGridQualityFromSolved(solved, effectiveMinWords, qualityOpts);
  quality.possibleScore = roundPlan?.fixedWordScore
    ? (quality.words || 0) * roundPlan.fixedWordScore
    : quality.totalPts;
  if (roundPlan?.type === FINALE_TYPE) {
    quality.ok =
      quality.ok && quality.possibleScore >= (roundPlan?.minTotalScore || 0);
  }
  return { quality };
}

function respond(message) {
  if (!parentPort) return;
  parentPort.postMessage(message);
}

if (parentPort) {
  parentPort.on("message", async (message) => {
    const { id, type, payload } = message || {};
    if (!id) return;

    try {
      if (type === "prepareNextGrid") {
        const nextPayload = payload || {};
        if (nextPayload?.roundPlan?.type === OCID_TYPE) {
          const ocidTargetCandidates = await getOcidTargetCandidates({ dictionary });
          nextPayload.roundPlan = {
            ...nextPayload.roundPlan,
            ocidTargetCandidates,
          };
        }
        if (shouldApplyRareWordBonus(nextPayload?.roundPlan)) {
          const rareBonusWordMetaMap = await getRareBonusWordMetaMap();
          nextPayload.roundPlan = {
            ...nextPayload.roundPlan,
            rareBonusWordMetaMap,
          };
        }
        const result = await prepareNextGridJob(nextPayload);
        respond({ id, ok: true, result });
        return;
      }
      if (type === "analyzeGrid") {
        const result = analyzeGridJob(payload || {});
        respond({ id, ok: true, result });
        return;
      }

      respond({ id, ok: false, error: "unknown_type" });
    } catch (err) {
      respond({ id, ok: false, error: err?.message || String(err) });
    }
  });
}
