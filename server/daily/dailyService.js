import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import { DAILY_GENERATION_VERSION } from "./dailyGeneration.js";
import {
  buildPathWordVariants,
  buildFakeTwinsGrid,
  FAKE_TWINS_COMPLETION_BONUS,
  FAKE_TWINS_MIN_WORD_LENGTH,
  FAKE_TWINS_TYPE,
  LETTER_BAG,
  normalizeWord,
  scoreWordOnGrid,
  scoreWordOnGridWithPath,
  solveGrid,
} from "../../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : path.join(__dirname, "../data");
const DAILY_DIR = path.join(DATA_DIR, "daily");
const MIN_PALIER_SCORE = 2000;
const PALIER_STEP = 500;
const LOCK_STALE_MS = 20 * 60 * 1000;
const LOCK_LEGACY_STALE_MS = 2 * 60 * 1000;
const DAILY_RETENTION_DAYS = 180;
export const DAILY_SPECIAL_MODE = "self_specials_3_words";
export const DAILY_MONSTROUS_MODE = "monstrous_grid";
export const DAILY_FAKE_TWINS_MODE = "fake_twins_grid";
const DAILY_SPECIAL_BONUS_KEYS = Object.freeze(["L2", "L3", "M2", "M3"]);
const MOVABLE_BONUS_KEYS = Object.freeze(["L2", "L3", "M2", "M3"]);
const DAILY_SPECIAL_WORD_TARGET = 3;
const DAILY_GRID_SIZE = 4;
const DAILY_DURATION_MS = 120 * 1000;
const DAILY_MONSTROUS_MIN_WORDS = 200;
const DAILY_MONSTROUS_MIN_LONG_LEN = 10;
const DAILY_MONSTROUS_MIN_LONG_WORDS = 3;
const DAILY_SPECIAL_MIN_WORDS = 140;
const DAILY_SPECIAL_MIN_LONG_LEN = 8;
const DAILY_SPECIAL_MIN_LONG_COUNT = 3;
const DAILY_FAKE_TWINS_MIN_WORDS = 120;
const DAILY_FAKE_TWINS_MIN_LONG_LEN = 8;
const DAILY_GENERATION_MAX_ATTEMPTS = 240;
const DAILY_FAKE_TWINS_PRIMARY_MAX_ATTEMPTS = 90;

const gridCache = new Map();
const resultsCache = new Map();
const resultsWriteChains = new Map();
const activeGenerators = new Set();
let championCache = null;
let lastChampionDateId = null;
let lastRetentionSweepDateId = null;
let retentionSweepPromise = null;
let dailyDictionaryCache = null;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildDateId(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function getParisDateId(date = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value || 0);
  const month = Number(parts.find((p) => p.type === "month")?.value || 0);
  const day = Number(parts.find((p) => p.type === "day")?.value || 0);
  return buildDateId(year, month, day);
}

export function addDaysToDateId(dateId, deltaDays) {
  const match = String(dateId || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateId;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const base = new Date(Date.UTC(year, month, day));
  base.setUTCDate(base.getUTCDate() + Number(deltaDays || 0));
  return buildDateId(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

function dailyGridPath(dateId) {
  return path.join(DAILY_DIR, `daily-${dateId}.json`);
}

function dailyResultsPath(dateId) {
  return path.join(DAILY_DIR, `results-${dateId}.json`);
}

function dailyResultsBackupPath(dateId) {
  return path.join(DAILY_DIR, `results-${dateId}.json.bak`);
}

function dailyLockPath(dateId) {
  return path.join(DAILY_DIR, `.gen-${dateId}.lock`);
}

function dailyChampionPath() {
  return path.join(DAILY_DIR, "champion.json");
}

async function ensureDailyDir() {
  await fs.mkdir(DAILY_DIR, { recursive: true });
}

function extractDailyStorageDateId(fileName) {
  const match = String(fileName || "").match(
    /^(?:daily|results)-(\d{4}-\d{2}-\d{2})\.json$|^\.gen-(\d{4}-\d{2}-\d{2})\.lock$/
  );
  return match?.[1] || match?.[2] || null;
}

async function sweepExpiredDailyStorage(todayDateId = getParisDateId()) {
  const cutoffDateId = addDaysToDateId(todayDateId, -DAILY_RETENTION_DAYS);
  let names = [];
  try {
    names = await fs.readdir(DAILY_DIR);
  } catch (_) {
    lastRetentionSweepDateId = todayDateId;
    return;
  }

  await Promise.all(
    names.map(async (name) => {
      const dateId = extractDailyStorageDateId(name);
      if (!dateId || dateId >= cutoffDateId) return;
      const filePath = path.join(DAILY_DIR, name);
      try {
        await fs.unlink(filePath);
      } catch (_) {
        return;
      }
      if (name.startsWith("daily-")) {
        gridCache.delete(dateId);
      } else if (name.startsWith("results-")) {
        resultsCache.delete(dateId);
      } else if (name.startsWith(".gen-")) {
        activeGenerators.delete(dateId);
      }
    })
  );

  lastRetentionSweepDateId = todayDateId;
}

async function ensureDailyStorage() {
  await ensureDailyDir();
  const todayDateId = getParisDateId();
  if (lastRetentionSweepDateId === todayDateId) return;
  if (!retentionSweepPromise) {
    retentionSweepPromise = sweepExpiredDailyStorage(todayDateId).finally(() => {
      retentionSweepPromise = null;
    });
  }
  await retentionSweepPromise;
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
}

async function isStaleFutureDailyGrid(dateId, filePath) {
  const safeDateId = String(dateId || "").trim();
  if (!safeDateId || safeDateId <= getParisDateId()) return false;
  const payload = await readJsonFile(filePath);
  return payload?.generationVersion !== DAILY_GENERATION_VERSION;
}

function normalizeDailyResultsPayload(dateId, raw) {
  const safe = raw && typeof raw === "object" ? raw : null;
  return {
    dateId,
    results: Array.isArray(safe?.results) ? safe.results : [],
    attempts: safe?.attempts && typeof safe.attempts === "object" ? safe.attempts : {},
  };
}

function cloneDailyResultsPayload(payload, dateId) {
  const normalized = normalizeDailyResultsPayload(dateId, payload);
  return {
    dateId,
    results: normalized.results.map((entry) => ({
      ...entry,
      words: Array.isArray(entry?.words) ? [...entry.words] : [],
      wordSubmissions: Array.isArray(entry?.wordSubmissions)
        ? entry.wordSubmissions.map((item) => ({
            ...item,
            path: Array.isArray(item?.path) ? [...item.path] : [],
          }))
        : [],
    })),
    attempts: Object.fromEntries(
      Object.entries(normalized.attempts).map(([installId, attempt]) => [
        installId,
        attempt && typeof attempt === "object" ? { ...attempt } : attempt,
      ])
    ),
  };
}

function buildDailyAttemptKey(installId, mode) {
  const safeInstallId = String(installId || "").trim();
  const safeMode = normalizeDailyMode(mode);
  if (!safeInstallId) return "";
  return `${safeInstallId}::${safeMode}`;
}

function getDailyAttemptEntry(attempts, installId, mode) {
  const safeAttempts = attempts && typeof attempts === "object" ? attempts : {};
  const attemptKey = buildDailyAttemptKey(installId, mode);
  const keyedAttempt =
    attemptKey && safeAttempts[attemptKey] && typeof safeAttempts[attemptKey] === "object"
      ? safeAttempts[attemptKey]
      : null;
  if (keyedAttempt) return keyedAttempt;
  const legacyKey = String(installId || "").trim();
  const legacyAttempt =
    legacyKey && safeAttempts[legacyKey] && typeof safeAttempts[legacyKey] === "object"
      ? safeAttempts[legacyKey]
      : null;
  if (!legacyAttempt) return null;
  return normalizeDailyMode(legacyAttempt?.mode) === normalizeDailyMode(mode)
    ? legacyAttempt
    : null;
}

function setDailyAttemptEntry(attempts, installId, mode, payload) {
  const safeAttempts = attempts && typeof attempts === "object" ? attempts : {};
  const attemptKey = buildDailyAttemptKey(installId, mode);
  if (!attemptKey) return safeAttempts;
  safeAttempts[attemptKey] = payload && typeof payload === "object" ? { ...payload } : payload;
  const legacyKey = String(installId || "").trim();
  if (
    legacyKey &&
    safeAttempts[legacyKey] &&
    normalizeDailyMode(safeAttempts[legacyKey]?.mode) === normalizeDailyMode(mode)
  ) {
    delete safeAttempts[legacyKey];
  }
  return safeAttempts;
}

function clearDailyAttemptEntry(attempts, installId, mode) {
  const safeAttempts = attempts && typeof attempts === "object" ? attempts : {};
  const attemptKey = buildDailyAttemptKey(installId, mode);
  if (attemptKey && Object.prototype.hasOwnProperty.call(safeAttempts, attemptKey)) {
    delete safeAttempts[attemptKey];
  }
  const legacyKey = String(installId || "").trim();
  if (
    legacyKey &&
    safeAttempts[legacyKey] &&
    normalizeDailyMode(safeAttempts[legacyKey]?.mode) === normalizeDailyMode(mode)
  ) {
    delete safeAttempts[legacyKey];
  }
  return safeAttempts;
}

async function withDailyResultsLock(dateId, task) {
  const safeDateId = String(dateId || "").trim();
  const previous = resultsWriteChains.get(safeDateId) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => task());
  resultsWriteChains.set(
    safeDateId,
    current.finally(() => {
      if (resultsWriteChains.get(safeDateId) === current) {
        resultsWriteChains.delete(safeDateId);
      }
    })
  );
  return await current;
}

async function loadDailyDictionary() {
  if (dailyDictionaryCache) return dailyDictionaryCache;
  try {
    const raw = await fs.readFile(path.join(__dirname, "../../public/dico.txt"), "utf8");
    dailyDictionaryCache = new Set(
      raw
        .split(/\r?\n/)
        .map((word) => normalizeWord(word.trim()))
        .filter(Boolean)
    );
  } catch (_) {
    dailyDictionaryCache = null;
  }
  return dailyDictionaryCache;
}

async function atomicWriteJson(filePath, payload) {
  const json = JSON.stringify(payload, null, 2);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, json, "utf8");
  try {
    await fs.rename(tmpPath, filePath);
  } catch (_) {
    try {
      await fs.unlink(filePath);
    } catch (_) {}
    await fs.rename(tmpPath, filePath);
  }
}

async function getFileStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (_) {
    return null;
  }
}

async function readDailyLockInfo(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const text = String(raw || "").trim();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        return {
          startedAt: Number(parsed.startedAt) || 0,
          pid: Number.isInteger(Number(parsed.pid)) && Number(parsed.pid) > 0 ? Number(parsed.pid) : null,
          dateId: typeof parsed.dateId === "string" ? parsed.dateId : null,
          legacy: false,
        };
      }
    } catch (_) {}
    const legacyStartedAt = Number(text);
    return {
      startedAt: Number.isFinite(legacyStartedAt) && legacyStartedAt > 0 ? legacyStartedAt : 0,
      pid: null,
      dateId: null,
      legacy: true,
    };
  } catch (_) {
    return null;
  }
}

function isProcessAlive(pid) {
  const safePid = Number(pid);
  if (!Number.isInteger(safePid) || safePid <= 0) return false;
  try {
    process.kill(safePid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

async function loadDailyGrid(dateId) {
  await ensureDailyStorage();
  const filePath = dailyGridPath(dateId);
  const cached = gridCache.get(dateId);
  const stat = await getFileStat(filePath);
  if (!stat) {
    gridCache.delete(dateId);
    return null;
  }
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.data;
  }
  const data = await readJsonFile(filePath);
  if (!data) return null;
  const migrated = await migrateLegacyDailyGridIfNeeded(dateId, data);
  if (migrated !== data) {
    return migrated;
  }
  gridCache.set(dateId, { data, mtimeMs: stat.mtimeMs });
  return data;
}

async function loadDailyResults(dateId, { strict = false } = {}) {
  await ensureDailyStorage();
  const filePath = dailyResultsPath(dateId);
  const backupPath = dailyResultsBackupPath(dateId);
  const cached = resultsCache.get(dateId);
  const stat = await getFileStat(filePath);
  if (!stat) {
    const backup = await readJsonFile(backupPath);
    if (backup && typeof backup === "object") {
      const payload = normalizeDailyResultsPayload(dateId, backup);
      resultsCache.set(dateId, { data: payload, mtimeMs: 0 });
      console.warn(`[daily] recovered missing results file from backup date=${dateId}`);
      return payload;
    }
    resultsCache.delete(dateId);
    return { dateId, results: [], attempts: {} };
  }
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.data;
  }
  const data = await readJsonFile(filePath);
  let payload = null;
  if (data && typeof data === "object") {
    payload = normalizeDailyResultsPayload(dateId, data);
  } else {
    const backup = await readJsonFile(backupPath);
    if (backup && typeof backup === "object") {
      payload = normalizeDailyResultsPayload(dateId, backup);
      console.warn(`[daily] recovered unreadable results file from backup date=${dateId}`);
    } else if (cached?.data) {
      payload = cloneDailyResultsPayload(cached.data, dateId);
      console.warn(`[daily] reusing cached results after unreadable file date=${dateId}`);
    } else {
      console.warn(`[daily] results file unreadable with no recovery source date=${dateId}`);
      if (strict) {
        throw new Error(`daily_results_unreadable:${dateId}`);
      }
      payload = { dateId, results: [], attempts: {} };
    }
  }
  resultsCache.set(dateId, { data: payload, mtimeMs: stat.mtimeMs });
  return payload;
}

async function saveDailyResults(dateId, payload) {
  const filePath = dailyResultsPath(dateId);
  const backupPath = dailyResultsBackupPath(dateId);
  await ensureDailyStorage();
  const currentPayload = await readJsonFile(filePath);
  if (currentPayload && typeof currentPayload === "object") {
    await atomicWriteJson(backupPath, currentPayload).catch(() => {});
  } else {
    const cached = resultsCache.get(dateId)?.data || null;
    if (cached) {
      await atomicWriteJson(backupPath, cached).catch(() => {});
    }
  }
  await atomicWriteJson(filePath, payload);
  const stat = await getFileStat(filePath);
  if (stat) {
    resultsCache.set(dateId, { data: payload, mtimeMs: stat.mtimeMs });
  }
}

function sortResults(results) {
  return [...results].sort((a, b) => {
    const diff = (b?.score || 0) - (a?.score || 0);
    if (diff !== 0) return diff;
    const at = Number(a?.submittedAt) || 0;
    const bt = Number(b?.submittedAt) || 0;
    if (at !== bt) return at - bt;
    const ad = Number(a?.durationMs);
    const bd = Number(b?.durationMs);
    if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return ad - bd;
    return String(a?.pseudo || "").localeCompare(String(b?.pseudo || ""));
  });
}

function buildPalierEntries(maxScore) {
  const maxTarget = Math.max(
    MIN_PALIER_SCORE,
    Math.ceil(Math.max(0, maxScore) / PALIER_STEP) * PALIER_STEP
  );
  const entries = [];
  for (let score = PALIER_STEP; score <= maxTarget; score += PALIER_STEP) {
    entries.push({
      nick: `Palier ${score}`,
      score,
      rightLabel: `${score} pts`,
      isPalier: true,
      playerKey: `palier-${score}`,
    });
  }
  return entries;
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

function cloneGridWithBonuses(grid) {
  if (!Array.isArray(grid)) return [];
  return grid.map((cell) => ({
    letter: cell?.letter || "?",
    altLetter: cell?.altLetter || null,
    specialType: cell?.specialType || null,
    bonus: cell?.bonus || null,
  }));
}

function hasAnyGridBonus(grid) {
  return Array.isArray(grid) && grid.some((cell) => typeof cell?.bonus === "string" && cell.bonus);
}

function summarizeSolvedGrid(solved, minLongWordLen = DAILY_SPECIAL_MIN_LONG_LEN) {
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
  let a = seed >>> 0;
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

function generateGridFromSeed(seed, size = DAILY_GRID_SIZE) {
  const rand = mulberry32(seed);
  const total = size * size;
  return Array(total)
    .fill(null)
    .map(() => ({ letter: randomLetterFromBag(rand), bonus: null }));
}

function getGridLettersKey(grid) {
  return cloneGridWithoutBonuses(grid)
    .map((cell) => String(cell?.letter || "").toLowerCase())
    .join("|");
}

function applySeededBonuses(grid, seed, bonusKeys = MOVABLE_BONUS_KEYS) {
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

function findBestMovableBonusWord(board, wordsIterable) {
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
    for (let i = 0; i < DAILY_SPECIAL_BONUS_KEYS.length && i < scored.path.length; i += 1) {
      candidate.placements[DAILY_SPECIAL_BONUS_KEYS[i]] = scored.path[i];
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

function compareDailyModeEntries(mode, a, b) {
  if (!a) return -1;
  if (!b) return 1;
  const aQuality = a?.gridQuality || {};
  const bQuality = b?.gridQuality || {};
  if (mode === DAILY_FAKE_TWINS_MODE) {
    const targetDiff = (aQuality.fakeTwinTargetScore || 0) - (bQuality.fakeTwinTargetScore || 0);
    if (targetDiff !== 0) return targetDiff;
    const validDiff =
      (aQuality.meetsTwinWordTarget ? 1 : 0) - (bQuality.meetsTwinWordTarget ? 1 : 0);
    if (validDiff !== 0) return validDiff;
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

function buildDailyModeGrid(dateId, mode, dictionary, { avoidGridKey = null, maxAttempts = DAILY_GENERATION_MAX_ATTEMPTS } = {}) {
  const safeMode = normalizeDailyMode(mode);
  const baseSeed = hashString(`${dateId}:${safeMode}`);
  let bestEntry = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const seed = baseSeed + attempt;
    let grid = generateGridFromSeed(seed, DAILY_GRID_SIZE);
    let fakeTwinsStats = null;
    if (safeMode === DAILY_MONSTROUS_MODE) {
      grid = applySeededBonuses(grid, seed, MOVABLE_BONUS_KEYS);
    }
    if (safeMode === DAILY_FAKE_TWINS_MODE) {
      fakeTwinsStats = buildFakeTwinsGrid(grid, dictionary, {
        maxCellCandidates: grid.length,
        maxAltLetters: 26,
        candidateSeed: seed,
      });
      if (!Number.isInteger(fakeTwinsStats?.twinIndex) || !fakeTwinsStats?.altLetter) continue;
      grid = fakeTwinsStats.grid;
    }
    const lettersKey = getGridLettersKey(grid);
    if (avoidGridKey && lettersKey === avoidGridKey) continue;
    const scoreConfig =
      safeMode === DAILY_FAKE_TWINS_MODE
        ? { type: FAKE_TWINS_TYPE, minWordLength: FAKE_TWINS_MIN_WORD_LENGTH, disableBonuses: true }
        : null;
    const scoringGrid = safeMode === DAILY_SPECIAL_MODE ? cloneGridWithoutBonuses(grid) : grid;
    const solved = solveGrid(scoringGrid, dictionary, scoreConfig);
    const quality = summarizeSolvedGrid(solved);
    const words = Number(quality.words) || 0;
    const maxLen = Number(quality.maxLen) || 0;
    const longWords = Number(quality.longWords) || 0;
    const fakeTwinWords =
      safeMode === DAILY_FAKE_TWINS_MODE
        ? Number(fakeTwinsStats?.fakeTwinWords) || 0
        : Array.from(solved.values()).filter((entry) => entry?.usedFakeTwins).length;
    const valid =
      safeMode === DAILY_SPECIAL_MODE
        ? words >= DAILY_SPECIAL_MIN_WORDS &&
          maxLen >= DAILY_SPECIAL_MIN_LONG_LEN &&
          longWords >= DAILY_SPECIAL_MIN_LONG_COUNT
        : safeMode === DAILY_FAKE_TWINS_MODE
        ? words >= DAILY_FAKE_TWINS_MIN_WORDS &&
          maxLen >= DAILY_FAKE_TWINS_MIN_LONG_LEN &&
          !!fakeTwinsStats?.meetsTwinWordTarget
      : words >= DAILY_MONSTROUS_MIN_WORDS &&
        maxLen >= DAILY_MONSTROUS_MIN_LONG_LEN &&
        longWords >= DAILY_MONSTROUS_MIN_LONG_WORDS;
    const entry = {
      mode: safeMode,
      seed,
      gridSize: DAILY_GRID_SIZE,
      grid,
      wordCount: words,
      longestWordLen: maxLen,
      gridQuality:
        safeMode === DAILY_FAKE_TWINS_MODE
          ? {
              ...quality,
              fakeTwinWords,
              fakeTwinUniquePaths: Number(fakeTwinsStats?.fakeTwinUniquePaths) || 0,
              fakeTwinDuplicatePathWords: Number(fakeTwinsStats?.fakeTwinDuplicatePathWords) || 0,
              twinIndex: fakeTwinsStats?.twinIndex ?? null,
              altLetter: fakeTwinsStats?.altLetter ?? null,
              primaryLetterWords: Number(fakeTwinsStats?.primaryLetterWords) || 0,
              altLetterWords: Number(fakeTwinsStats?.altLetterWords) || 0,
              meetsTwinWordTarget: !!fakeTwinsStats?.meetsTwinWordTarget,
              fakeTwinTargetScore: Number(fakeTwinsStats?.targetScore) || 0,
            }
          : quality,
    };
    if (valid) return entry;
    if (!bestEntry || compareDailyModeEntries(safeMode, entry, bestEntry) > 0) {
      bestEntry = entry;
    }
  }
  if (bestEntry) {
    if (safeMode === DAILY_FAKE_TWINS_MODE) {
      throw new Error(`daily_${safeMode}_target_not_met`);
    }
    console.warn(
      `[daily] using fallback ${safeMode} grid for ${dateId} after ${maxAttempts} attempts`
    );
    return bestEntry;
  }
  throw new Error(`daily_${safeMode}_generation_failed`);
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
      Number.isFinite(Number(payload?.fakeTwinsSeed))
        ? Number(payload.fakeTwinsSeed)
        : Number.isFinite(Number(source.seed))
        ? Number(source.seed)
        : hashString(`${dateId}:${DAILY_FAKE_TWINS_MODE}:fallback`);
    const fakeTwins = buildFakeTwinsGrid(baseGrid, dictionary, {
      maxCellCandidates: baseGrid.length,
      maxAltLetters: 26,
      candidateSeed: bonusSeed,
    });
    if (!Array.isArray(fakeTwins?.grid) || !Number.isInteger(fakeTwins?.twinIndex)) {
      continue;
    }
    const solved = fakeTwins?.solved || solveGrid(fakeTwins.grid, dictionary, {
      type: FAKE_TWINS_TYPE,
      minWordLength: FAKE_TWINS_MIN_WORD_LENGTH,
      disableBonuses: true,
    });
    const quality = summarizeSolvedGrid(solved);
    const fakeTwinWords = Number(fakeTwins?.fakeTwinWords) || 0;
    if (
      (Number(quality.words) || 0) < DAILY_FAKE_TWINS_MIN_WORDS ||
      (Number(quality.maxLen) || 0) < DAILY_FAKE_TWINS_MIN_LONG_LEN ||
      !fakeTwins?.meetsTwinWordTarget
    ) {
      continue;
    }
    return {
      mode: DAILY_FAKE_TWINS_MODE,
      seed: bonusSeed,
      gridSize: DAILY_GRID_SIZE,
      grid: fakeTwins.grid,
      wordCount: quality.words,
      longestWordLen: quality.maxLen,
      gridQuality: {
        ...quality,
        fakeTwinWords,
        fakeTwinUniquePaths: Number(fakeTwins?.fakeTwinUniquePaths) || 0,
        fakeTwinDuplicatePathWords: Number(fakeTwins?.fakeTwinDuplicatePathWords) || 0,
        twinIndex: fakeTwins.twinIndex,
        altLetter: fakeTwins.altLetter,
        primaryLetterWords: Number(fakeTwins?.primaryLetterWords) || 0,
        altLetterWords: Number(fakeTwins?.altLetterWords) || 0,
        meetsTwinWordTarget: !!fakeTwins?.meetsTwinWordTarget,
        fakeTwinTargetScore: Number(fakeTwins?.targetScore) || 0,
      },
    };
  }
  return null;
}

async function migrateLegacyDailyGridIfNeeded(dateId, payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (!Array.isArray(payload.grid) || payload.grid.length === 0) return payload;
  const monstrousLettersKey = getGridLettersKey(cloneGridWithoutBonuses(payload.grid));
  const specialLettersKey =
    Array.isArray(payload.specialGrid) && payload.specialGrid.length > 0
      ? getGridLettersKey(cloneGridWithoutBonuses(payload.specialGrid))
      : null;
  const fakeTwinsLettersKey =
    Array.isArray(payload.fakeTwinsGrid) && payload.fakeTwinsGrid.length > 0
      ? getGridLettersKey(cloneGridWithoutBonuses(payload.fakeTwinsGrid))
      : null;
  const needsMonstrousBonusRepair =
    !hasAnyGridBonus(payload.grid) && Number.isFinite(payload.seed);
  const needsFakeTwinsBonusRepair =
    Array.isArray(payload.fakeTwinsGrid) &&
    payload.fakeTwinsGrid.length > 0 &&
    !hasAnyGridBonus(payload.fakeTwinsGrid) &&
    Number.isFinite(payload.fakeTwinsSeed);
  const needsSpecialGrid =
    !Array.isArray(payload.specialGrid) ||
    payload.specialGrid.length === 0 ||
    specialLettersKey === monstrousLettersKey;
  const needsFakeTwinsGrid =
    !Array.isArray(payload.fakeTwinsGrid) ||
    payload.fakeTwinsGrid.length === 0 ||
    fakeTwinsLettersKey === monstrousLettersKey;
  const needsDurationRepair =
    !Number.isFinite(Number(payload.durationMs)) || Number(payload.durationMs) !== DAILY_DURATION_MS;
  if (
    !needsMonstrousBonusRepair &&
    !needsFakeTwinsBonusRepair &&
    !needsSpecialGrid &&
    !needsFakeTwinsGrid &&
    !needsDurationRepair
  ) {
    return payload;
  }

  const migratedGrid = needsMonstrousBonusRepair
    ? applySeededBonuses(payload.grid, payload.seed, MOVABLE_BONUS_KEYS)
    : cloneGridWithBonuses(payload.grid);
  const dictionary = await loadDailyDictionary();
  let gridQuality =
    payload.gridQuality && typeof payload.gridQuality === "object"
      ? { ...payload.gridQuality }
      : {};
  if (dictionary && dictionary.size > 0) {
    const monstrousSolved = solveGrid(migratedGrid, dictionary);
    const baseGrid = cloneGridWithoutBonuses(migratedGrid);
    const bestMovableBonus =
      monstrousSolved.size > 0 ? findBestMovableBonusWord(baseGrid, monstrousSolved.keys()) : null;
    gridQuality = {
      ...gridQuality,
      ...summarizeSolvedGrid(monstrousSolved, DAILY_MONSTROUS_MIN_LONG_LEN),
      special3Words: bestMovableBonus
        ? {
            maxPts: Number(bestMovableBonus.pts) || 0,
            bestWord: bestMovableBonus.word || null,
            bestPath: Array.isArray(bestMovableBonus.path) ? bestMovableBonus.path : [],
            bestPlacements:
              bestMovableBonus.placements && typeof bestMovableBonus.placements === "object"
                ? bestMovableBonus.placements
                : null,
          }
        : null,
    };
  }

  let specialEntry = null;
  if (needsSpecialGrid && dictionary && dictionary.size > 0) {
    try {
      specialEntry = buildDailyModeGrid(dateId, DAILY_SPECIAL_MODE, dictionary, {
        avoidGridKey: getGridLettersKey(cloneGridWithoutBonuses(migratedGrid)),
      });
    } catch (_) {
      specialEntry = null;
    }
  }
  let fakeTwinsEntry = null;
  if (needsFakeTwinsGrid && dictionary && dictionary.size > 0) {
    try {
      fakeTwinsEntry = buildDailyModeGrid(dateId, DAILY_FAKE_TWINS_MODE, dictionary, {
        avoidGridKey: getGridLettersKey(cloneGridWithoutBonuses(migratedGrid)),
        maxAttempts: DAILY_FAKE_TWINS_PRIMARY_MAX_ATTEMPTS,
      });
    } catch (_) {
      fakeTwinsEntry = buildFallbackFakeTwinsEntry(dateId, payload, dictionary);
    }
    if (!fakeTwinsEntry) {
      console.warn(`[daily] unable to complete fake_twins grid for ${dateId}`);
    }
  }
  const migratedFakeTwinsGrid =
    fakeTwinsEntry?.grid ??
    (needsFakeTwinsBonusRepair
      ? applySeededBonuses(payload.fakeTwinsGrid, payload.fakeTwinsSeed, MOVABLE_BONUS_KEYS)
      : payload.fakeTwinsGrid ?? null);
  let migratedFakeTwinsGridQuality = fakeTwinsEntry?.gridQuality ?? payload.fakeTwinsGridQuality ?? null;
  if (
    !fakeTwinsEntry &&
    needsFakeTwinsBonusRepair &&
    Array.isArray(migratedFakeTwinsGrid) &&
    dictionary &&
    dictionary.size > 0
  ) {
    const fakeTwinsSolved = solveGrid(migratedFakeTwinsGrid, dictionary, {
      type: FAKE_TWINS_TYPE,
      minWordLength: FAKE_TWINS_MIN_WORD_LENGTH,
      disableBonuses: true,
    });
    const fakeTwinWords = Array.from(fakeTwinsSolved.values()).filter(
      (entry) => entry?.usedFakeTwins
    ).length;
    migratedFakeTwinsGridQuality = {
      ...(payload.fakeTwinsGridQuality && typeof payload.fakeTwinsGridQuality === "object"
        ? payload.fakeTwinsGridQuality
        : {}),
      ...summarizeSolvedGrid(fakeTwinsSolved),
      fakeTwinWords,
    };
  }

  const migrated = {
    ...payload,
    durationMs: DAILY_DURATION_MS,
    grid: migratedGrid,
    gridQuality,
    specialSeed: specialEntry?.seed ?? payload.specialSeed ?? null,
    specialGridSize: specialEntry?.gridSize ?? payload.specialGridSize ?? payload.gridSize ?? 4,
    specialGrid: specialEntry?.grid ?? payload.specialGrid ?? null,
    specialWordCount: specialEntry?.wordCount ?? payload.specialWordCount ?? null,
    specialLongestWordLen:
      specialEntry?.longestWordLen ?? payload.specialLongestWordLen ?? null,
    specialGridQuality: specialEntry?.gridQuality ?? payload.specialGridQuality ?? null,
    fakeTwinsSeed: fakeTwinsEntry?.seed ?? payload.fakeTwinsSeed ?? null,
    fakeTwinsGridSize:
      fakeTwinsEntry?.gridSize ?? payload.fakeTwinsGridSize ?? payload.gridSize ?? 4,
    fakeTwinsGrid: migratedFakeTwinsGrid,
    fakeTwinsWordCount: fakeTwinsEntry?.wordCount ?? payload.fakeTwinsWordCount ?? null,
    fakeTwinsLongestWordLen:
      fakeTwinsEntry?.longestWordLen ?? payload.fakeTwinsLongestWordLen ?? null,
    fakeTwinsGridQuality: migratedFakeTwinsGridQuality,
  };

  try {
    const filePath = dailyGridPath(dateId);
    await atomicWriteJson(filePath, migrated);
    const stat = await getFileStat(filePath);
    if (stat) {
      gridCache.set(dateId, { data: migrated, mtimeMs: stat.mtimeMs });
    }
    console.log(
      `[daily] migrated ${dateId} special=${specialEntry ? "yes" : "no"} fake_twins=${
        fakeTwinsEntry ? "yes" : Array.isArray(migrated.fakeTwinsGrid) && migrated.fakeTwinsGrid.length > 0 ? "kept" : "no"
      }`
    );
  } catch (_) {}

  return migrated;
}

function normalizeDailyMode(rawMode) {
  const safeMode = String(rawMode || "").trim();
  if (safeMode === DAILY_SPECIAL_MODE) return DAILY_SPECIAL_MODE;
  if (safeMode === DAILY_FAKE_TWINS_MODE) return DAILY_FAKE_TWINS_MODE;
  return DAILY_MONSTROUS_MODE;
}

function getDailyModeGridEntry(payload, mode = DAILY_MONSTROUS_MODE) {
  const safeMode = normalizeDailyMode(mode);
  if (safeMode === DAILY_SPECIAL_MODE) {
    if (Array.isArray(payload?.specialGrid) && payload.specialGrid.length > 0) {
      return {
        mode: safeMode,
        seed: payload?.specialSeed ?? payload?.seed ?? null,
        gridSize: payload?.specialGridSize ?? payload?.gridSize ?? 4,
        grid: payload.specialGrid,
        wordCount: payload?.specialWordCount ?? null,
        longestWordLen: payload?.specialLongestWordLen ?? null,
        gridQuality: payload?.specialGridQuality ?? null,
      };
    }
    return {
      mode: safeMode,
      seed: payload?.specialSeed ?? null,
      gridSize: payload?.specialGridSize ?? payload?.gridSize ?? 4,
      grid: [],
      wordCount: payload?.specialWordCount ?? null,
      longestWordLen: payload?.specialLongestWordLen ?? null,
      gridQuality: payload?.specialGridQuality ?? null,
    };
  }
  if (safeMode === DAILY_FAKE_TWINS_MODE) {
    if (Array.isArray(payload?.fakeTwinsGrid) && payload.fakeTwinsGrid.length > 0) {
      return {
        mode: safeMode,
        seed: payload?.fakeTwinsSeed ?? payload?.seed ?? null,
        gridSize: payload?.fakeTwinsGridSize ?? payload?.gridSize ?? 4,
        grid: payload.fakeTwinsGrid,
        wordCount: payload?.fakeTwinsWordCount ?? null,
        longestWordLen: payload?.fakeTwinsLongestWordLen ?? null,
        gridQuality: payload?.fakeTwinsGridQuality ?? null,
      };
    }
    return {
      mode: safeMode,
      seed: payload?.fakeTwinsSeed ?? null,
      gridSize: payload?.fakeTwinsGridSize ?? payload?.gridSize ?? 4,
      grid: [],
      wordCount: payload?.fakeTwinsWordCount ?? null,
      longestWordLen: payload?.fakeTwinsLongestWordLen ?? null,
      gridQuality: payload?.fakeTwinsGridQuality ?? null,
    };
  }
  return {
    mode: safeMode,
    seed: payload?.seed ?? null,
    gridSize: payload?.gridSize ?? 4,
    grid: Array.isArray(payload?.grid) ? payload.grid : [],
    wordCount: payload?.wordCount ?? null,
    longestWordLen: payload?.longestWordLen ?? null,
    gridQuality: payload?.gridQuality ?? null,
  };
}

function hasDailyModeGrid(payload, mode = DAILY_MONSTROUS_MODE) {
  const entry = getDailyModeGridEntry(payload, mode);
  return Array.isArray(entry?.grid) && entry.grid.length > 0;
}

function normalizeDailySpecialPlacements(rawPlacements, totalCells) {
  const placements = {};
  const occupied = new Set();
  const source =
    rawPlacements && typeof rawPlacements === "object" && !Array.isArray(rawPlacements)
      ? rawPlacements
      : {};
  for (const bonus of DAILY_SPECIAL_BONUS_KEYS) {
    const idx = Number(source?.[bonus]);
    if (!Number.isInteger(idx)) continue;
    if (idx < 0 || idx >= totalCells) continue;
    if (occupied.has(idx)) continue;
    occupied.add(idx);
    placements[bonus] = idx;
  }
  return placements;
}

function applyDailySpecialPlacements(grid, placements) {
  const base = cloneGridWithoutBonuses(grid);
  const total = base.length;
  const safePlacements = normalizeDailySpecialPlacements(placements, total);
  for (const bonus of DAILY_SPECIAL_BONUS_KEYS) {
    const idx = safePlacements[bonus];
    if (!Number.isInteger(idx) || !base[idx]) continue;
    base[idx] = { ...base[idx], bonus };
  }
  return { board: base, placements: safePlacements };
}

function normalizeDailyWordSubmissions(raw, limit = DAILY_SPECIAL_WORD_TARGET) {
  if (!Array.isArray(raw)) return [];
  const hasExplicitLimit = Number.isFinite(limit);
  const safeLimit = hasExplicitLimit
    ? Math.max(1, Math.round(limit || DAILY_SPECIAL_WORD_TARGET))
    : Number.POSITIVE_INFINITY;
  const out = [];
  for (let i = 0; i < raw.length && out.length < safeLimit; i += 1) {
    const entry = raw[i];
    if (!entry || typeof entry !== "object") continue;
    const word = normalizeWord(String(entry.word || ""));
    if (!word || word.length < 2) continue;
    const path = Array.isArray(entry.path)
      ? entry.path
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0)
      : null;
    out.push({ word, path });
  }
  return out;
}

function normalizeDailyStoredWords(raw) {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((word) => normalizeWord(String(word || "")))
        .filter((word) => word && word.length >= 2)
    )
  );
}

function getDailySpecialWordStartTile(path) {
  const first = Array.isArray(path) ? Number(path[0]) : NaN;
  return Number.isInteger(first) && first >= 0 ? first : null;
}

function buildDailyHistoryWordPool(gridEntry, dictionary) {
  if (!dictionary || dictionary.size === 0) return [];
  if (!gridEntry || !Array.isArray(gridEntry?.grid) || gridEntry.grid.length === 0) return [];
  const scoreConfig =
    gridEntry?.mode === DAILY_FAKE_TWINS_MODE
      ? { type: FAKE_TWINS_TYPE, minWordLength: FAKE_TWINS_MIN_WORD_LENGTH, disableBonuses: true }
      : null;
  const scoringGrid =
    gridEntry?.mode === DAILY_SPECIAL_MODE
      ? cloneGridWithoutBonuses(gridEntry.grid)
      : cloneGridWithBonuses(gridEntry.grid);
  const solved = solveGrid(scoringGrid, dictionary, scoreConfig);
  return Array.from(solved.keys()).sort((a, b) => {
    const lenDiff = String(b || "").length - String(a || "").length;
    if (lenDiff !== 0) return lenDiff;
    return String(a || "").localeCompare(String(b || ""), "fr", { sensitivity: "base" });
  });
}

function computeDailyGobbles({ bestWordPts, longestWordLen }, maxWordPts, maxWordLen) {
  let gobbles = 0;
  if (
    Number.isFinite(maxWordPts) &&
    maxWordPts > 0 &&
    Number.isFinite(bestWordPts) &&
    bestWordPts >= maxWordPts
  ) {
    gobbles += 1;
  }
  if (
    Number.isFinite(maxWordLen) &&
    maxWordLen > 0 &&
    Number.isFinite(longestWordLen) &&
    longestWordLen >= maxWordLen
  ) {
    gobbles += 1;
  }
  return gobbles;
}

function resolveDailyModeThresholds(mode, thresholdsByMode = {}) {
  const safeMode = normalizeDailyMode(mode);
  const nestedThresholds =
    thresholdsByMode?.[safeMode] && typeof thresholdsByMode[safeMode] === "object"
      ? thresholdsByMode[safeMode]
      : null;
  const directThresholds =
    thresholdsByMode &&
    typeof thresholdsByMode === "object" &&
    (Number.isFinite(thresholdsByMode.maxWordPts) ||
      Number.isFinite(thresholdsByMode.maxWordLen) ||
      Number.isFinite(thresholdsByMode.maxWordPtsSpecial))
      ? thresholdsByMode
      : null;
  const baseThresholds = nestedThresholds || directThresholds || {};
  return {
    maxWordPts:
      safeMode === DAILY_SPECIAL_MODE && Number.isFinite(baseThresholds.maxWordPtsSpecial)
        ? baseThresholds.maxWordPtsSpecial
        : baseThresholds.maxWordPts,
    maxWordLen: baseThresholds.maxWordLen,
  };
}

function getDailyGridThresholds(gridEntry = null) {
  const gridQuality = gridEntry?.gridQuality || null;
  const maxWordPts = Number.isFinite(gridQuality?.maxPts) ? gridQuality.maxPts : null;
  const maxWordLen = Number.isFinite(gridQuality?.maxLen)
    ? gridQuality.maxLen
    : Number.isFinite(gridEntry?.longestWordLen)
    ? gridEntry.longestWordLen
    : null;
  const maxWordPtsSpecial = Number.isFinite(gridQuality?.special3Words?.maxPts)
    ? gridQuality.special3Words.maxPts
    : null;
  return { maxWordPts, maxWordLen, maxWordPtsSpecial };
}

function getDailyThresholdsByMode(payload = null) {
  return {
    [DAILY_MONSTROUS_MODE]: getDailyGridThresholds(
      getDailyModeGridEntry(payload, DAILY_MONSTROUS_MODE)
    ),
    [DAILY_SPECIAL_MODE]: getDailyGridThresholds(
      getDailyModeGridEntry(payload, DAILY_SPECIAL_MODE)
    ),
    [DAILY_FAKE_TWINS_MODE]: getDailyGridThresholds(
      getDailyModeGridEntry(payload, DAILY_FAKE_TWINS_MODE)
    ),
  };
}

function buildDailyBoardEntries(results, thresholdsByMode = {}) {
  const sorted = sortResults(results);
  const maxScore = sorted.length ? Number(sorted[0]?.score) || 0 : 0;
  const palierEntries = buildPalierEntries(maxScore);
  const playerEntries = sorted.map((entry) => {
    const modeThresholds = resolveDailyModeThresholds(entry?.mode, thresholdsByMode);
    return {
      nick: entry.pseudo || entry.nick || "Joueur",
      score: Number(entry.score) || 0,
      wordsCount: Number.isFinite(entry.wordCount) ? entry.wordCount : null,
      installId: entry.installId || null,
      submittedAt: entry.submittedAt || null,
      mode: normalizeDailyMode(entry?.mode),
      gobbles: Number.isFinite(entry.gobbles)
        ? entry.gobbles
        : computeDailyGobbles(
            {
              bestWordPts: Number.isFinite(entry.bestWordPts) ? entry.bestWordPts : null,
              longestWordLen: Number.isFinite(entry.longestWordLen)
                ? entry.longestWordLen
                : null,
            },
            modeThresholds.maxWordPts,
            modeThresholds.maxWordLen
          ),
      isPalier: false,
    };
  });
  const merged = [...playerEntries, ...palierEntries];
  merged.sort((a, b) => {
    const diff = (b?.score || 0) - (a?.score || 0);
    if (diff !== 0) return diff;
    const aPalier = a?.isPalier ? 1 : 0;
    const bPalier = b?.isPalier ? 1 : 0;
    if (aPalier !== bPalier) return aPalier - bPalier;
    const at = Number(a?.submittedAt) || 0;
    const bt = Number(b?.submittedAt) || 0;
    if (at !== bt) return at - bt;
    return String(a?.nick || "").localeCompare(String(b?.nick || ""));
  });
  return merged;
}

export async function ensureDaily(dateId) {
  if (!dateId) return { ready: false };
  await ensureDailyDir();
  const gridPath = dailyGridPath(dateId);
  const stat = await getFileStat(gridPath);
  if (stat) {
    if (!(await isStaleFutureDailyGrid(dateId, gridPath))) {
      return { ready: true };
    }
    console.warn(
      `[daily] regenerating stale future grid date=${dateId} targetVersion=${DAILY_GENERATION_VERSION}`
    );
    await fs.unlink(gridPath).catch(() => {});
    gridCache.delete(dateId);
  }

  const lockPath = dailyLockPath(dateId);
  const lockStat = await getFileStat(lockPath);
  if (lockStat) {
    const lockInfo = await readDailyLockInfo(lockPath);
    const startedAt =
      Number(lockInfo?.startedAt) > 0 ? Number(lockInfo.startedAt) : Number(lockStat.mtimeMs) || 0;
    const ageMs = Math.max(0, Date.now() - startedAt);
    const pid = lockInfo?.pid || null;
    const pidAlive = pid ? isProcessAlive(pid) : false;
    const legacyLock = !!lockInfo?.legacy || !pid;
    const shouldKeepLock =
      (pidAlive && ageMs < LOCK_STALE_MS) || (legacyLock && ageMs < LOCK_LEGACY_STALE_MS);
    if (shouldKeepLock) {
      return { ready: false };
    }
    console.warn(
      `[daily] clearing stale lock date=${dateId} ageMs=${ageMs} pid=${pid || "none"} alive=${
        pidAlive ? "yes" : "no"
      } legacy=${legacyLock ? "yes" : "no"}`
    );
    await fs.unlink(lockPath).catch(() => {});
  }

  spawnDailyGenerator(dateId);
  return { ready: false };
}

function spawnDailyGenerator(dateId) {
  if (!dateId) return;
  if (activeGenerators.has(dateId)) return;
  activeGenerators.add(dateId);
  const lockPath = dailyLockPath(dateId);

  const scriptPath = path.join(__dirname, "../../scripts/daily_gen.js");
  const nodeBin = process.execPath;
  const args = [scriptPath, "--date", dateId];
  const startedAt = Date.now();

  let child = null;
  if (process.platform === "linux") {
    try {
      child = spawn("nice", ["-n", "10", nodeBin, ...args], {
        detached: true,
        stdio: "ignore",
      });
    } catch (_) {
      child = null;
    }
  }
  if (!child) {
    child = spawn(nodeBin, args, { detached: true, stdio: "ignore" });
  }

  ensureDailyDir()
    .then(() =>
      fs.writeFile(
        lockPath,
        JSON.stringify({
          dateId,
          startedAt,
          pid: Number.isInteger(Number(child?.pid)) ? Number(child.pid) : null,
        }),
        "utf8"
      )
    )
    .catch(() => {});

  child.on("exit", () => {
    activeGenerators.delete(dateId);
    fs.unlink(lockPath).catch(() => {});
  });
  child.on("error", () => {
    activeGenerators.delete(dateId);
    fs.unlink(lockPath).catch(() => {});
  });
  child.unref();
}

export async function getDailyStatus(dateId, installId) {
  const safeDateId = dateId || getParisDateId();
  await ensureDaily(safeDateId);
  const gridPayload = await loadDailyGrid(safeDateId);
  const ready =
    !!gridPayload &&
    hasDailyModeGrid(gridPayload, DAILY_MONSTROUS_MODE) &&
    hasDailyModeGrid(gridPayload, DAILY_SPECIAL_MODE) &&
    hasDailyModeGrid(gridPayload, DAILY_FAKE_TWINS_MODE);
  let hasPlayed = false;
  let hasPlayedMonstrous = false;
  let hasPlayedSpecial = false;
  let hasPlayedFakeTwins = false;
  let myResult = null;
  let myMonstrousResult = null;
  let mySpecialResult = null;
  let myFakeTwinsResult = null;
  if (installId) {
    const resultsPayload = await loadDailyResults(safeDateId);
    const results = Array.isArray(resultsPayload?.results) ? resultsPayload.results : [];
    myMonstrousResult =
      results.find(
        (entry) =>
          entry.installId === installId &&
          normalizeDailyMode(entry?.mode) === DAILY_MONSTROUS_MODE
      ) || null;
    mySpecialResult =
      results.find(
        (entry) =>
          entry.installId === installId &&
          normalizeDailyMode(entry?.mode) === DAILY_SPECIAL_MODE
      ) || null;
    myFakeTwinsResult =
      results.find(
        (entry) =>
          entry.installId === installId &&
          normalizeDailyMode(entry?.mode) === DAILY_FAKE_TWINS_MODE
      ) || null;
    myResult = myMonstrousResult;
    const attempts = resultsPayload?.attempts || {};
    const monstrousAttempt = getDailyAttemptEntry(
      attempts,
      installId,
      DAILY_MONSTROUS_MODE
    );
    const specialAttempt = getDailyAttemptEntry(attempts, installId, DAILY_SPECIAL_MODE);
    const fakeTwinsAttempt = getDailyAttemptEntry(
      attempts,
      installId,
      DAILY_FAKE_TWINS_MODE
    );
    hasPlayedMonstrous = !!myMonstrousResult || !!monstrousAttempt;
    hasPlayedSpecial = !!mySpecialResult || !!specialAttempt;
    hasPlayedFakeTwins = !!myFakeTwinsResult || !!fakeTwinsAttempt;
    hasPlayed = hasPlayedMonstrous;
  }
  return {
    dateId: safeDateId,
    ready,
    hasPlayed,
    hasPlayedMonstrous,
    hasPlayedSpecial,
    hasPlayedFakeTwins,
    myResult,
    myMonstrousResult,
    mySpecialResult,
    myFakeTwinsResult,
    champion: championCache,
  };
}

export async function getDailyBoard(dateId) {
  const safeDateId = dateId || getParisDateId();
  await ensureDaily(safeDateId);
  const gridPayload = await loadDailyGrid(safeDateId);
  const thresholdsByMode = getDailyThresholdsByMode(gridPayload);
  const ready =
    !!gridPayload &&
    hasDailyModeGrid(gridPayload, DAILY_MONSTROUS_MODE) &&
    hasDailyModeGrid(gridPayload, DAILY_SPECIAL_MODE) &&
    hasDailyModeGrid(gridPayload, DAILY_FAKE_TWINS_MODE);
  const resultsPayload = await loadDailyResults(safeDateId);
  const results = Array.isArray(resultsPayload?.results) ? resultsPayload.results : [];
  return {
    dateId: safeDateId,
    ready,
    entries: buildDailyBoardEntries(results, thresholdsByMode),
    totalPlayers: results.length,
  };
}

export async function getDailyResultsSnapshot(dateId) {
  const safeDateId = dateId || getParisDateId();
  const payload = await loadDailyResults(safeDateId);
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return {
    dateId: safeDateId,
    results: sortResults(results).map((entry) => ({
      installId: entry?.installId || null,
      mode: normalizeDailyMode(entry?.mode),
      nick: entry?.pseudo || entry?.nick || "Joueur",
      score: Number(entry?.score) || 0,
      wordCount: Number.isFinite(entry?.wordCount) ? entry.wordCount : null,
      gobbles: Number.isFinite(entry?.gobbles) ? entry.gobbles : 0,
      submittedAt: Number(entry?.submittedAt) || 0,
    })),
  };
}

export async function getDailyHistory({ days = 7, installId = null, dictionary = null } = {}) {
  const safeDays = Math.min(30, Math.max(1, Math.round(days || 7)));
  const todayId = getParisDateId();
  const history = [];
  const crownsMap = new Map();
  const safeInstallId = String(installId || "").trim() || null;

  for (let offset = 0; offset < safeDays; offset += 1) {
    const dateId = addDaysToDateId(todayId, -offset);
    const gridPayload = await loadDailyGrid(dateId);
    const thresholdsByMode = getDailyThresholdsByMode(gridPayload);
    const resultsPayload = await loadDailyResults(dateId);
    const results = Array.isArray(resultsPayload?.results) ? resultsPayload.results : [];
    const boardEntries = buildDailyBoardEntries(results, thresholdsByMode).filter(
      (entry) => !entry?.isPalier
    );
    const myResults = safeInstallId
      ? results.filter((entry) => entry?.installId === safeInstallId)
      : [];
    const myWordsByMode = {
      [DAILY_MONSTROUS_MODE]: normalizeDailyStoredWords(
        myResults.find((entry) => normalizeDailyMode(entry?.mode) === DAILY_MONSTROUS_MODE)?.words
      ),
      [DAILY_SPECIAL_MODE]: normalizeDailyStoredWords(
        myResults.find((entry) => normalizeDailyMode(entry?.mode) === DAILY_SPECIAL_MODE)?.words
      ),
      [DAILY_FAKE_TWINS_MODE]: normalizeDailyStoredWords(
        myResults.find((entry) => normalizeDailyMode(entry?.mode) === DAILY_FAKE_TWINS_MODE)?.words
      ),
    };
    history.push({
      dateId,
      entries: boardEntries,
      totalPlayers: results.length,
      findableWordsByMode: {
        [DAILY_MONSTROUS_MODE]: buildDailyHistoryWordPool(
          getDailyModeGridEntry(gridPayload, DAILY_MONSTROUS_MODE),
          dictionary
        ),
        [DAILY_SPECIAL_MODE]: buildDailyHistoryWordPool(
          getDailyModeGridEntry(gridPayload, DAILY_SPECIAL_MODE),
          dictionary
        ),
        [DAILY_FAKE_TWINS_MODE]: buildDailyHistoryWordPool(
          getDailyModeGridEntry(gridPayload, DAILY_FAKE_TWINS_MODE),
          dictionary
        ),
      },
      myWordsByMode,
    });
    const winner = boardEntries[0];
    const winnerNick = winner?.nick;
    if (winnerNick) {
      const current = crownsMap.get(winnerNick) || { nick: winnerNick, crowns: 0 };
      current.crowns += 1;
      crownsMap.set(winnerNick, current);
    }
  }

  const crownTotals = Array.from(crownsMap.values()).sort((a, b) => {
    const diff = (b.crowns || 0) - (a.crowns || 0);
    if (diff !== 0) return diff;
    return String(a.nick || "").localeCompare(String(b.nick || ""));
  });

  return { days: history, crownTotals };
}

export async function startDailyAttempt(
  dateId,
  installId,
  pseudo,
  { dailyMode = null } = {}
) {
  const safeDateId = dateId || getParisDateId();
  const safeMode = normalizeDailyMode(dailyMode);
  const gridPayload = await loadDailyGrid(safeDateId);
  if (!gridPayload) {
    return { ok: false, error: "not_ready", dateId: safeDateId };
  }
  const gridEntry = getDailyModeGridEntry(gridPayload, safeMode);
  if (!Array.isArray(gridEntry?.grid) || gridEntry.grid.length === 0) {
    return { ok: false, error: "bad_grid", dateId: safeDateId };
  }
  let startState = null;
  try {
    startState = await withDailyResultsLock(safeDateId, async () => {
      const resultsPayload = cloneDailyResultsPayload(
        await loadDailyResults(safeDateId, { strict: true }),
        safeDateId
      );
      const results = resultsPayload.results;
      if (
        results.find(
          (entry) =>
            entry.installId === installId && normalizeDailyMode(entry?.mode) === safeMode
        )
      ) {
        return { ok: false, error: "already_played", dateId: safeDateId };
      }
      const attempts = resultsPayload.attempts;
      if (getDailyAttemptEntry(attempts, installId, safeMode)) {
        return { ok: false, error: "already_played", dateId: safeDateId };
      }
      setDailyAttemptEntry(attempts, installId, safeMode, {
        pseudo: String(pseudo || "").trim().slice(0, 32),
        startedAt: Date.now(),
        mode: safeMode,
      });
      await saveDailyResults(safeDateId, {
        dateId: safeDateId,
        results,
        attempts,
      });
      return { ok: true };
    });
  } catch (err) {
    console.warn(`[daily] start attempt failed to load results date=${safeDateId}`, err);
    return { ok: false, error: "results_unavailable", dateId: safeDateId };
  }
  if (!startState?.ok) {
    return startState || { ok: false, error: "results_unavailable", dateId: safeDateId };
  }
  const playGrid =
    safeMode === DAILY_SPECIAL_MODE
      ? cloneGridWithoutBonuses(gridEntry.grid)
      : cloneGridWithBonuses(gridEntry.grid);
  return {
    ok: true,
    dateId: safeDateId,
    mode: safeMode,
    specialTiles: DAILY_SPECIAL_BONUS_KEYS,
    grid: playGrid,
    gridSize: gridEntry.gridSize || 4,
    seed: gridEntry.seed,
    gridQuality: gridEntry.gridQuality || null,
    durationMs: Number.isFinite(Number(gridPayload.durationMs))
      ? Math.max(0, Math.round(Number(gridPayload.durationMs)))
      : DAILY_DURATION_MS,
  };
}

export async function submitDailyResult({
  dateId,
  installId,
  pseudo,
  foundWords,
  wordSubmissions,
  specialPlacements,
  dailyMode,
  durationMs,
  dictionary,
}) {
  const safeDateId = dateId || getParisDateId();
  const safeMode = normalizeDailyMode(dailyMode);
  const gridPayload = await loadDailyGrid(safeDateId);
  if (!gridPayload) return { ok: false, error: "not_ready", dateId: safeDateId };
  const gridEntry = getDailyModeGridEntry(gridPayload, safeMode);
  if (!Array.isArray(gridEntry?.grid) || gridEntry.grid.length === 0) {
    return { ok: false, error: "bad_grid", dateId: safeDateId };
  }
  if (!dictionary || dictionary.size === 0) {
    return { ok: false, error: "no_dictionary", dateId: safeDateId };
  }

  const baseGrid = cloneGridWithBonuses(gridEntry.grid);
  const scoreConfig =
    safeMode === DAILY_FAKE_TWINS_MODE
      ? { type: FAKE_TWINS_TYPE, minWordLength: FAKE_TWINS_MIN_WORD_LENGTH, disableBonuses: true }
      : null;
  const scoringGrid =
    safeMode === DAILY_SPECIAL_MODE
      ? applyDailySpecialPlacements(cloneGridWithoutBonuses(baseGrid), specialPlacements).board
      : safeMode === DAILY_FAKE_TWINS_MODE
      ? cloneGridWithoutBonuses(baseGrid)
      : baseGrid;
  const solved = solveGrid(scoringGrid, dictionary, scoreConfig);
  const submittedWords = normalizeDailyWordSubmissions(
    wordSubmissions,
    safeMode === DAILY_SPECIAL_MODE ? DAILY_SPECIAL_WORD_TARGET : null
  );
  let score = 0;
  let wordCount = 0;
  let longestWordLen = 0;
  let bestWordPts = 0;
  const validatedWords = [];
  const thresholdsByMode = getDailyThresholdsByMode(gridPayload);
  let { maxWordPts, maxWordLen, maxWordPtsSpecial } =
    thresholdsByMode[safeMode] || getDailyGridThresholds(gridEntry);
  if (!Number.isFinite(maxWordPts) || !Number.isFinite(maxWordLen)) {
    let fallbackMaxPts = 0;
    let fallbackMaxLen = 0;
    for (const [word, data] of solved.entries()) {
      const len = word.length;
      const pts = data?.pts || 0;
      if (len > fallbackMaxLen) fallbackMaxLen = len;
      if (pts > fallbackMaxPts) fallbackMaxPts = pts;
    }
    if (!Number.isFinite(maxWordPts)) maxWordPts = fallbackMaxPts;
    if (!Number.isFinite(maxWordLen)) maxWordLen = fallbackMaxLen;
  }
  if (submittedWords.length > 0) {
    const seen = new Set();
    const seenStartTiles = new Set();
    for (const item of submittedWords) {
      const word = item.word;
      if (!word || seen.has(word)) continue;
      const submittedStartTile = getDailySpecialWordStartTile(item.path);
      if (
        safeMode === DAILY_SPECIAL_MODE &&
        submittedStartTile != null &&
        seenStartTiles.has(submittedStartTile)
      ) {
        continue;
      }
      if (!dictionary.has(word)) continue;
      const scored =
        Array.isArray(item.path) && item.path.length > 0
          ? scoreWordOnGridWithPath(word, scoringGrid, item.path, scoreConfig)
          : scoreWordOnGrid(word, scoringGrid, scoreConfig);
      if (!scored) continue;
      const scoredStartTile = getDailySpecialWordStartTile(scored.path);
      if (
        safeMode === DAILY_SPECIAL_MODE &&
        scoredStartTile != null &&
        seenStartTiles.has(scoredStartTile)
      ) {
        continue;
      }
      seen.add(word);
      if (safeMode === DAILY_SPECIAL_MODE && scoredStartTile != null) {
        seenStartTiles.add(scoredStartTile);
      }
      validatedWords.push(word);
      score += scored.pts || 0;
      wordCount += 1;
      if ((scored?.pts || 0) > bestWordPts) bestWordPts = scored?.pts || 0;
      if (word.length > longestWordLen) longestWordLen = word.length;
      if (safeMode === DAILY_FAKE_TWINS_MODE) {
        const variants = buildPathWordVariants(scoringGrid, scored.path, scoreConfig);
        for (const variant of variants) {
          const variantWord = normalizeWord(variant?.raw || "");
          if (!variantWord || variantWord === word || seen.has(variantWord)) continue;
          if (!dictionary.has(variantWord)) continue;
          const variantScored = scoreWordOnGridWithPath(
            variantWord,
            scoringGrid,
            scored.path,
            scoreConfig
          );
          if (!variantScored) continue;
          seen.add(variantWord);
          validatedWords.push(variantWord);
          score += variantScored.pts || 0;
          wordCount += 1;
          if ((variantScored?.pts || 0) > bestWordPts) bestWordPts = variantScored?.pts || 0;
          if (variantWord.length > longestWordLen) longestWordLen = variantWord.length;
        }
      }
    }
  } else {
    const wordsRaw = Array.isArray(foundWords) ? foundWords : [];
    const uniqueWords = Array.from(
      new Set(
        wordsRaw
          .map((word) => normalizeWord(String(word || "")))
        .filter((word) => word && word.length >= 2)
      )
    );
    const seenStartTiles = new Set();
    for (const word of uniqueWords) {
      const data = solved.get(word);
      if (!data) continue;
      const startTile = getDailySpecialWordStartTile(data.path);
      if (
        safeMode === DAILY_SPECIAL_MODE &&
        startTile != null &&
        seenStartTiles.has(startTile)
      ) {
        continue;
      }
      if (safeMode === DAILY_SPECIAL_MODE && startTile != null) {
        seenStartTiles.add(startTile);
      }
      validatedWords.push(word);
      score += data.pts || 0;
      wordCount += 1;
      if ((data?.pts || 0) > bestWordPts) bestWordPts = data?.pts || 0;
      if (word.length > longestWordLen) longestWordLen = word.length;
    }
  }
  const modeThresholds = resolveDailyModeThresholds(safeMode, {
    maxWordPts,
    maxWordLen,
    maxWordPtsSpecial,
  });
  const gobbles = computeDailyGobbles(
    { bestWordPts, longestWordLen },
    modeThresholds.maxWordPts,
    modeThresholds.maxWordLen
  );
  let fakeTwinsCompletionBonus = 0;
  let fakeTwinWordsFound = 0;
  let fakeTwinWordsTotal = 0;
  if (safeMode === DAILY_FAKE_TWINS_MODE) {
    fakeTwinWordsTotal = Array.from(solved.values()).filter((entry) => entry?.usedFakeTwins).length;
    fakeTwinWordsFound = validatedWords.reduce(
      (count, word) => (solved.get(word)?.usedFakeTwins ? count + 1 : count),
      0
    );
    if (fakeTwinWordsTotal > 0 && fakeTwinWordsFound >= fakeTwinWordsTotal) {
      fakeTwinsCompletionBonus = FAKE_TWINS_COMPLETION_BONUS;
      score += fakeTwinsCompletionBonus;
    }
  }

  const submittedAt = Date.now();
  const entry = {
    installId,
    pseudo: String(pseudo || "").trim().slice(0, 32),
    mode: safeMode,
    score,
    wordCount,
    longestWordLen,
    bestWordPts,
    gobbles,
    words: validatedWords,
    wordSubmissions: submittedWords,
    fakeTwinsCompletionBonus,
    fakeTwinWordsFound,
    fakeTwinWordsTotal,
    durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
    submittedAt,
  };
  let submitState = null;
  try {
    submitState = await withDailyResultsLock(safeDateId, async () => {
      const resultsPayload = cloneDailyResultsPayload(
        await loadDailyResults(safeDateId, { strict: true }),
        safeDateId
      );
      const results = resultsPayload.results;
      const existingIndex = results.findIndex(
        (existingEntry) =>
          existingEntry.installId === installId &&
          normalizeDailyMode(existingEntry?.mode) === safeMode
      );
      if (existingIndex >= 0) {
        return { ok: false, error: "already_played", dateId: safeDateId };
      }
      const attempts = resultsPayload.attempts;
      results.push(entry);
      clearDailyAttemptEntry(attempts, installId, safeMode);
      await saveDailyResults(safeDateId, {
        dateId: safeDateId,
        results,
        attempts,
      });
      return { ok: true, results };
    });
  } catch (err) {
    console.warn(`[daily] submit failed to load results date=${safeDateId}`, err);
    return { ok: false, error: "results_unavailable", dateId: safeDateId };
  }
  if (!submitState?.ok) {
    return submitState || { ok: false, error: "results_unavailable", dateId: safeDateId };
  }

  const sorted = sortResults(submitState.results);
  const rank = sorted.findIndex((r) => r.installId === installId);
  return {
    ok: true,
    dateId: safeDateId,
    mode: safeMode,
    score,
    gobbles,
    rank: rank >= 0 ? rank + 1 : null,
    totalPlayers: sorted.length,
    board: buildDailyBoardEntries(submitState.results, thresholdsByMode),
  };
}

export async function refreshDailyChampionIfNeeded() {
  const today = getParisDateId();
  if (lastChampionDateId === today) return championCache;
  const yesterday = addDaysToDateId(today, -1);
  const resultsPayload = await loadDailyResults(yesterday);
  const results = Array.isArray(resultsPayload?.results) ? resultsPayload.results : [];
  const sorted = sortResults(results);
  const best = sorted[0] || null;
  championCache = best
    ? {
        dateId: yesterday,
        installId: best.installId || null,
        pseudo: best.pseudo || null,
        score: best.score || 0,
        submittedAt: best.submittedAt || null,
      }
    : { dateId: yesterday, installId: null, pseudo: null, score: 0 };
  lastChampionDateId = today;
  await ensureDailyDir();
  await atomicWriteJson(dailyChampionPath(), championCache);
  return championCache;
}

export async function loadDailyChampion() {
  if (championCache) return championCache;
  const data = await readJsonFile(dailyChampionPath());
  if (data && typeof data === "object") {
    championCache = data;
    return championCache;
  }
  return null;
}
