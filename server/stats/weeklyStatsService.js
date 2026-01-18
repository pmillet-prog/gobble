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

const DEFAULT_STATE = {
  weekStartTs: 0,
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

let state = { ...DEFAULT_STATE };
let saveTimer = null;

export function getWeekStartTs(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.getTime();
}

function getNextResetTs(weekStartTs) {
  return weekStartTs + 7 * 24 * 60 * 60 * 1000;
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

async function saveToDisk() {
  saveTimer = null;
  const payload = {
    weekStartTs: state.weekStartTs,
    medals: serializeMap(state.medals),
    mostWordsInGame: serializeMap(state.mostWordsInGame),
    totalScore: serializeMap(state.totalScore),
    bestWord: serializeMap(state.bestWord),
    longestWord: serializeMap(state.longestWord),
    bestRoundScore: serializeMap(state.bestRoundScore),
    bestTimeTargetLong: serializeMap(state.bestTimeTargetLong),
    bestTimeTargetScore: serializeMap(state.bestTimeTargetScore),
    vocab: serializeMap(state.vocab),
    mostGobbles: serializeMap(state.mostGobbles),
  };
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_PATH, JSON.stringify(payload, null, 2), "utf8");
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
    const parsed = JSON.parse(raw);
    const stat = await fs.stat(filePath);
    return { parsed, mtimeMs: stat.mtimeMs || 0 };
  } catch (_) {
    return null;
  }
}

async function loadFromDisk() {
  const candidates = [];
  const primary = await readStatsFile(DATA_PATH);
  if (primary?.parsed) candidates.push({ ...primary, path: DATA_PATH });
  const legacy = await readStatsFile(LEGACY_DATA_PATH);
  if (legacy?.parsed) candidates.push({ ...legacy, path: LEGACY_DATA_PATH });

  let selected = null;
  if (candidates.length === 1) {
    selected = candidates[0];
  } else if (candidates.length > 1) {
    selected = candidates.reduce((best, cur) => {
      const bestWeek = Number(best.parsed?.weekStartTs) || 0;
      const curWeek = Number(cur.parsed?.weekStartTs) || 0;
      if (curWeek !== bestWeek) return curWeek > bestWeek ? cur : best;
      return (cur.mtimeMs || 0) > (best.mtimeMs || 0) ? cur : best;
    });
  }

  if (selected?.parsed) {
    const parsed = selected.parsed;
    const fileWeek = Number(parsed.weekStartTs) || 0;
    state = {
      weekStartTs: fileWeek || getWeekStartTs(),
      medals: reviveMap(parsed.medals),
      mostWordsInGame: reviveMap(parsed.mostWordsInGame),
      totalScore: reviveMap(parsed.totalScore),
      bestWord: reviveMap(parsed.bestWord),
      longestWord: reviveMap(parsed.longestWord),
      bestRoundScore: reviveMap(parsed.bestRoundScore),
      bestTimeTargetLong: reviveMap(parsed.bestTimeTargetLong),
      bestTimeTargetScore: reviveMap(parsed.bestTimeTargetScore),
      vocab: reviveMap(parsed.vocab),
      mostGobbles: reviveMap(parsed.mostGobbles),
    };
    if (selected.path !== DATA_PATH) scheduleSave();
  } else {
    resetState();
  }
  ensureCurrentWeek();
}

function seedSamples() {
  const now = Date.now();
  void now;
}

function resetState() {
  state = {
    ...DEFAULT_STATE,
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
    weekStartTs: getWeekStartTs(),
  };
  seedSamples();
  scheduleSave();
}

function ensureCurrentWeek() {
  const now = Date.now();
  const currentWeek = getWeekStartTs(now);
  const nextReset = state.weekStartTs ? getNextResetTs(state.weekStartTs) : 0;
  if (state.weekStartTs !== currentWeek || (nextReset && now >= nextReset)) {
    resetState();
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
  const weekStartTs = state.weekStartTs;
  const nextResetTs = getNextResetTs(weekStartTs);
  const mostWords = Array.from(state.mostWordsInGame.values()).filter(
    (entry) => Number(entry?.wordsCount) > 0
  );
  return {
    weekStartTs,
    weekStartISO: new Date(weekStartTs).toISOString(),
    nextResetTs,
    nextResetISO: new Date(nextResetTs).toISOString(),
    topN,
    boards: {
      medals: sortEntries(Array.from(state.medals.values()), "total", false).slice(0, topN),
      mostWordsInGame: sortEntries(mostWords, "wordsCount", false).slice(0, topN),
      totalScore: sortEntries(Array.from(state.totalScore.values()), "totalScore", false).slice(0, topN),
      bestWord: sortEntries(Array.from(state.bestWord.values()), "pts", false).slice(0, topN),
      longestWord: sortEntries(Array.from(state.longestWord.values()), "len", false).slice(0, topN),
      bestRoundScore: sortEntries(Array.from(state.bestRoundScore.values()), "pts", false).slice(0, topN),
      bestTimeTargetLong: sortEntries(
        Array.from(state.bestTimeTargetLong.values()),
        "ms",
        true
      ).slice(0, topN),
      bestTimeTargetScore: sortEntries(
        Array.from(state.bestTimeTargetScore.values()),
        "ms",
        true
      ).slice(0, topN),
      vocab: sortEntries(Array.from(state.vocab.values()), "vocabCount", false).slice(0, topN),
      mostGobbles: sortEntries(Array.from(state.mostGobbles.values()), "gobbles", false).slice(0, topN),
    },
  };
}
