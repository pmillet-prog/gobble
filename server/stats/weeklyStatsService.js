import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEGACY_DATA_DIR = path.join(__dirname, "../data-runtime");
const DEFAULT_DATA_DIR = path.join(__dirname, "../data");
const DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : DEFAULT_DATA_DIR;
const DATA_PATH = path.join(DATA_DIR, "weekly-stats.json");
const LEGACY_DATA_PATH = path.join(LEGACY_DATA_DIR, "weekly-stats.json");
const TOP_N = 50;
const PARIS_TZ = "Europe/Paris";

const BACKUP_INTERVAL_MS = 60 * 60 * 1000;

function buildWeekState(weekStartTs) {
  return {
    weekStartTs,
    medals: new Map(),
    mostWordsInGame: new Map(),
    totalScore: new Map(),
    bestWord: new Map(),
    longestWord: new Map(),
    bestRoundScore: new Map(),
    bestTimeTargetLong: new Map(),
    bestTimeTargetScore: new Map(),
    vocab: new Map(),
    mostGobbles: new Map(),
  };
}

let state = buildWeekState(getWeekStartTs());
let history = new Map();
let saveTimer = null;
let lastBackupAt = 0;
let lastSaveLogAt = 0;

function getParisParts(date) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const getNum = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: getNum("year"),
    month: getNum("month"),
    day: getNum("day"),
    hour: getNum("hour"),
    minute: getNum("minute"),
    second: getNum("second"),
  };
}

function getParisOffsetMinutes(date) {
  const parts = getParisParts(date);
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

function getParisMidnightTs(year, month, day) {
  const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offsetMinutes = getParisOffsetMinutes(utcMidnight);
  return utcMidnight.getTime() - offsetMinutes * 60 * 1000;
}

export function getWeekStartTs(now = Date.now()) {
  const parts = getParisParts(new Date(now));
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const day = (utcDate.getUTCDay() + 6) % 7; // Monday = 0
  utcDate.setUTCDate(utcDate.getUTCDate() - day);
  return getParisMidnightTs(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  );
}

function getNextResetTs(weekStartTs) {
  const parts = getParisParts(new Date(weekStartTs));
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  utcDate.setUTCDate(utcDate.getUTCDate() + 7);
  return getParisMidnightTs(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  );
}

function reviveMap(obj = {}) {
  const m = new Map();
  for (const [k, v] of Object.entries(obj)) {
    m.set(k, v);
  }
  return m;
}

function serializeMap(map) {
  return Object.fromEntries(map.entries());
}

function serializeWeekState(week) {
  return {
    weekStartTs: week.weekStartTs,
    medals: serializeMap(week.medals),
    mostWordsInGame: serializeMap(week.mostWordsInGame),
    totalScore: serializeMap(week.totalScore),
    bestWord: serializeMap(week.bestWord),
    longestWord: serializeMap(week.longestWord),
    bestRoundScore: serializeMap(week.bestRoundScore),
    bestTimeTargetLong: serializeMap(week.bestTimeTargetLong),
    bestTimeTargetScore: serializeMap(week.bestTimeTargetScore),
    vocab: serializeMap(week.vocab),
    mostGobbles: serializeMap(week.mostGobbles),
  };
}

function reviveWeekState(parsed, fallbackWeekStartTs) {
  const weekStartTs = Number(parsed?.weekStartTs) || fallbackWeekStartTs || getWeekStartTs();
  return {
    weekStartTs,
    medals: reviveMap(parsed?.medals),
    mostWordsInGame: reviveMap(parsed?.mostWordsInGame),
    totalScore: reviveMap(parsed?.totalScore),
    bestWord: reviveMap(parsed?.bestWord),
    longestWord: reviveMap(parsed?.longestWord),
    bestRoundScore: reviveMap(parsed?.bestRoundScore),
    bestTimeTargetLong: reviveMap(parsed?.bestTimeTargetLong),
    bestTimeTargetScore: reviveMap(parsed?.bestTimeTargetScore),
    vocab: reviveMap(parsed?.vocab),
    mostGobbles: reviveMap(parsed?.mostGobbles),
  };
}

function serializeHistory() {
  const obj = {};
  for (const [weekStartTs, weekState] of history.entries()) {
    if (!weekStartTs || weekStartTs === state.weekStartTs) continue;
    obj[String(weekStartTs)] = serializeWeekState(weekState);
  }
  return obj;
}

function isWeekEmpty(week) {
  return (
    week.medals.size === 0 &&
    week.mostWordsInGame.size === 0 &&
    week.totalScore.size === 0 &&
    week.bestWord.size === 0 &&
    week.longestWord.size === 0 &&
    week.bestRoundScore.size === 0 &&
    week.bestTimeTargetLong.size === 0 &&
    week.bestTimeTargetScore.size === 0 &&
    week.vocab.size === 0 &&
    week.mostGobbles.size === 0
  );
}

async function maybeBackupFile(filePath) {
  const now = Date.now();
  if (now - lastBackupAt < BACKUP_INTERVAL_MS) return;
  try {
    await fs.stat(filePath);
  } catch (_) {
    return;
  }
  const backupPath = `${filePath}.bak.${now}`;
  try {
    await fs.copyFile(filePath, backupPath);
    lastBackupAt = now;
  } catch (_) {}
}

async function replaceFile(tmpPath, targetPath) {
  try {
    await fs.rename(tmpPath, targetPath);
  } catch (err) {
    if (err?.code !== "EXDEV" && err?.code !== "EEXIST" && err?.code !== "EPERM") {
      throw err;
    }
    try {
      await fs.unlink(targetPath);
    } catch (_) {}
    await fs.rename(tmpPath, targetPath);
  }
}

async function atomicWriteJson(filePath, payload) {
  const json = JSON.stringify(payload, null, 2);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, json, "utf8");
  await replaceFile(tmpPath, filePath);
  return json;
}

async function saveToDisk() {
  saveTimer = null;
  const payload = {
    ...serializeWeekState(state),
    history: serializeHistory(),
  };
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await maybeBackupFile(DATA_PATH);
    const json = await atomicWriteJson(DATA_PATH, payload);
    const now = Date.now();
    if (now - lastSaveLogAt > 5000) {
      lastSaveLogAt = now;
      console.log(`weeklyStats saving size=${Buffer.byteLength(json, "utf8")}`);
    }
  } catch (_) {}
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(saveToDisk, 500);
  saveTimer.unref?.();
}

async function readStatsFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const stat = await fs.stat(filePath);
    const size = Number(stat.size) || Buffer.byteLength(raw, "utf8");
    const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    try {
      const parsed = JSON.parse(cleaned);
      return { parsed, mtimeMs: stat.mtimeMs || 0, size, path: filePath };
    } catch (_) {
      return { error: "parse", mtimeMs: stat.mtimeMs || 0, size, path: filePath };
    }
  } catch (_) {
    return null;
  }
}

async function readLatestBackup(basePath) {
  const dir = path.dirname(basePath);
  const base = path.basename(basePath);
  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch (_) {
    return null;
  }
  const backups = entries
    .filter((name) => name.startsWith(`${base}.bak.`))
    .map((name) => path.join(dir, name));
  const stats = await Promise.all(
    backups.map(async (fullPath) => {
      try {
        const st = await fs.stat(fullPath);
        return { path: fullPath, mtimeMs: st.mtimeMs || 0 };
      } catch (_) {
        return null;
      }
    })
  );
  const ordered = stats.filter(Boolean).sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  for (const entry of ordered) {
    const candidate = await readStatsFile(entry.path);
    if (candidate?.parsed) return candidate;
  }
  return null;
}

async function markCorrupt(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const corruptPath = path.join(dir, `${base}.bad.${Date.now()}`);
  try {
    await fs.copyFile(filePath, corruptPath);
    await fs.unlink(filePath);
  } catch (_) {}
}

async function loadFromDisk() {
  let selected = null;
  const primary = await readStatsFile(DATA_PATH);
  if (primary?.parsed) {
    selected = primary;
  } else if (primary?.error === "parse") {
    await markCorrupt(DATA_PATH);
    const backup = await readLatestBackup(DATA_PATH);
    if (backup?.parsed) {
      selected = backup;
    } else {
      const legacy = await readStatsFile(LEGACY_DATA_PATH);
      if (legacy?.parsed) selected = legacy;
    }
  } else {
    const legacy = await readStatsFile(LEGACY_DATA_PATH);
    if (legacy?.parsed) selected = legacy;
  }

  if (selected?.parsed) {
    const parsed = selected.parsed;
    state = reviveWeekState(parsed, Number(parsed.weekStartTs) || getWeekStartTs());
    history = new Map();
    const rawHistory = parsed.history;
    if (rawHistory && typeof rawHistory === "object") {
      for (const [key, value] of Object.entries(rawHistory)) {
        const ts = Number(key) || Number(value?.weekStartTs) || 0;
        if (!ts) continue;
        history.set(ts, reviveWeekState(value, ts));
      }
    }
  } else {
    state = buildWeekState(getWeekStartTs());
    history = new Map();
  }

  const loadedPath = selected?.path || "none";
  const loadedSize = selected?.size || 0;
  const loadedKeys = selected?.parsed ? Object.keys(selected.parsed).join(",") : "";
  console.log(`weeklyStats loaded from ${loadedPath} size=${loadedSize} keys=${loadedKeys}`);
  ensureCurrentWeek();
}

function seedSamples() {
  const now = Date.now();
  void now;
}

function ensureCurrentWeek() {
  const now = Date.now();
  const currentWeek = getWeekStartTs(now);
  const nextReset = state.weekStartTs ? getNextResetTs(state.weekStartTs) : 0;
  if (state.weekStartTs !== currentWeek || (nextReset && now >= nextReset)) {
    if (!isWeekEmpty(state)) {
      if (!history.has(state.weekStartTs)) {
        history.set(state.weekStartTs, state);
      }
    }
    state = buildWeekState(currentWeek);
    seedSamples();
  }
}

await loadFromDisk();

function shouldReplace(current, valueKey, newValue, achievedAt, asc = false) {
  if (!current) return true;
  const currentValue = current[valueKey] ?? 0;
  if (asc) {
    if (newValue < currentValue) return true;
    if (newValue > currentValue) return false;
  } else {
    if (newValue > currentValue) return true;
    if (newValue < currentValue) return false;
  }
  const currentAt = current.achievedAt || 0;
  return achievedAt < currentAt;
}

export function recordMedal(playerKey, nick, type, achievedAt = Date.now()) {
  ensureCurrentWeek();
  if (!playerKey || !nick) return;
  const current = state.medals.get(playerKey) || {
    nick,
    playerKey,
    gold: 0,
    silver: 0,
    bronze: 0,
    total: 0,
    achievedAt,
  };
  const next = { ...current };
  if (type === "gold") next.gold = Math.min(9999, next.gold + 1);
  if (type === "silver") next.silver = Math.min(9999, next.silver + 1);
  if (type === "bronze") next.bronze = Math.min(9999, next.bronze + 1);
  next.total = (next.gold || 0) + (next.silver || 0) + (next.bronze || 0);
  if (current.total !== next.total) {
    next.achievedAt = achievedAt;
  }
  state.medals.set(playerKey, next);
  scheduleSave();
}

export function recordBestWord(playerKey, nick, word, pts, achievedAt = Date.now()) {
  ensureCurrentWeek();
  if (!playerKey || !nick || !word || !Number.isFinite(pts)) return;
  const current = state.bestWord.get(playerKey) || null;
  if (!shouldReplace(current, "pts", pts, achievedAt, false)) return;
  state.bestWord.set(playerKey, { nick, playerKey, word, pts, achievedAt });
  scheduleSave();
}

export function recordLongestWord(playerKey, nick, word, len, achievedAt = Date.now()) {
  ensureCurrentWeek();
  if (!playerKey || !nick || !word || !Number.isFinite(len)) return;
  const current = state.longestWord.get(playerKey) || null;
  if (!shouldReplace(current, "len", len, achievedAt, false)) return;
  state.longestWord.set(playerKey, { nick, playerKey, word, len, achievedAt });
  scheduleSave();
}

export function recordBestRoundScore(playerKey, nick, pts, roundId, achievedAt = Date.now()) {
  ensureCurrentWeek();
  if (!playerKey || !nick || !Number.isFinite(pts)) return;
  const current = state.bestRoundScore.get(playerKey) || null;
  if (!shouldReplace(current, "pts", pts, achievedAt, false)) return;
  state.bestRoundScore.set(playerKey, { nick, playerKey, pts, roundId, achievedAt });
  scheduleSave();
}

export function recordMostWordsInGame(playerKey, nick, wordsCount, roundId, achievedAt = Date.now()) {
  ensureCurrentWeek();
  if (!playerKey || !nick || !Number.isFinite(wordsCount) || wordsCount <= 0) return;
  const current = state.mostWordsInGame.get(playerKey) || null;
  if (!shouldReplace(current, "wordsCount", wordsCount, achievedAt, false)) return;
  state.mostWordsInGame.set(playerKey, { nick, playerKey, wordsCount, roundId, achievedAt });
  scheduleSave();
}

export function recordTotalScore(playerKey, nick, scoreToAdd, achievedAt = Date.now()) {
  ensureCurrentWeek();
  if (!playerKey || !nick || !Number.isFinite(scoreToAdd)) return;
  const current = state.totalScore.get(playerKey) || {
    nick,
    playerKey,
    totalScore: 0,
    roundsPlayed: 0,
    achievedAt,
  };
  const nextTotal = (current.totalScore || 0) + scoreToAdd;
  const nextRounds = (current.roundsPlayed || 0) + 1;
  const result = {
    ...current,
    totalScore: nextTotal,
    roundsPlayed: nextRounds,
    achievedAt: achievedAt,
  };
  state.totalScore.set(playerKey, result);
  scheduleSave();
}

export function recordMostGobbles(playerKey, nick, gobblesToAdd, achievedAt = Date.now()) {
  ensureCurrentWeek();
  if (!playerKey || !nick || !Number.isFinite(gobblesToAdd)) return;
  const current = state.mostGobbles.get(playerKey) || {
    nick,
    playerKey,
    gobbles: 0,
    achievedAt,
  };
  const nextTotal = (current.gobbles || 0) + gobblesToAdd;
  const result = {
    ...current,
    gobbles: nextTotal,
    achievedAt: current.gobbles === nextTotal ? current.achievedAt : achievedAt,
  };
  state.mostGobbles.set(playerKey, result);
  scheduleSave();
}

export function recordBestTargetTime(kind, playerKey, nick, ms, word, achievedAt = Date.now()) {
  ensureCurrentWeek();
  if (!playerKey || !nick || !Number.isFinite(ms) || !word) return;
  const map =
    kind === "target_score" ? state.bestTimeTargetScore : state.bestTimeTargetLong;
  const current = map.get(playerKey) || null;
  if (!shouldReplace(current, "ms", ms, achievedAt, true)) return;
  map.set(playerKey, { nick, playerKey, ms, word, achievedAt });
  scheduleSave();
}

export function recordVocabCount(playerKey, nick, vocabCount, achievedAt = Date.now()) {
  ensureCurrentWeek();
  if (!playerKey || !nick || !Number.isFinite(vocabCount)) return;
  const current = state.vocab.get(playerKey) || {
    nick,
    playerKey,
    vocabCount: 0,
    achievedAt,
  };
  const nextCount = Math.max(current.vocabCount || 0, vocabCount);
  const result = {
    ...current,
    vocabCount: nextCount,
    achievedAt: nextCount === current.vocabCount ? current.achievedAt : achievedAt,
  };
  state.vocab.set(playerKey, result);
  scheduleSave();
}

function sortEntries(arr, key, asc = false) {
  return arr.sort((a, b) => {
    const av = a?.[key] ?? 0;
    const bv = b?.[key] ?? 0;
    if (av !== bv) {
      return asc ? av - bv : bv - av;
    }
    const at = a?.achievedAt ?? 0;
    const bt = b?.achievedAt ?? 0;
    return at - bt;
  });
}

export function getWeeklyStats(topN = TOP_N) {
  ensureCurrentWeek();
  // Always expose the current week so rankings reset immediately on Monday 00:00 (Paris time).
  const activeState = state;
  const weekStartTs = activeState.weekStartTs;
  const nextResetTs = getNextResetTs(weekStartTs);
  const mostWords = Array.from(activeState.mostWordsInGame.values()).filter(
    (entry) => Number(entry?.wordsCount) > 0
  );
  return {
    weekStartTs,
    weekStartISO: new Date(weekStartTs).toISOString(),
    nextResetTs,
    nextResetISO: new Date(nextResetTs).toISOString(),
    topN,
    boards: {
      medals: sortEntries(Array.from(activeState.medals.values()), "total", false).slice(0, topN),
      mostWordsInGame: sortEntries(mostWords, "wordsCount", false).slice(0, topN),
      totalScore: sortEntries(Array.from(activeState.totalScore.values()), "totalScore", false).slice(0, topN),
      bestWord: sortEntries(Array.from(activeState.bestWord.values()), "pts", false).slice(0, topN),
      longestWord: sortEntries(Array.from(activeState.longestWord.values()), "len", false).slice(0, topN),
      bestRoundScore: sortEntries(Array.from(activeState.bestRoundScore.values()), "pts", false).slice(0, topN),
      bestTimeTargetLong: sortEntries(
        Array.from(activeState.bestTimeTargetLong.values()),
        "ms",
        true
      ).slice(0, topN),
      bestTimeTargetScore: sortEntries(
        Array.from(activeState.bestTimeTargetScore.values()),
        "ms",
        true
      ).slice(0, topN),
      vocab: sortEntries(Array.from(activeState.vocab.values()), "vocabCount", false).slice(0, topN),
      mostGobbles: sortEntries(Array.from(activeState.mostGobbles.values()), "gobbles", false).slice(0, topN),
    },
  };
}
