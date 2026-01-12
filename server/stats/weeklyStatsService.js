import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "../data");
const DATA_PATH = path.join(DATA_DIR, "weekly-stats.json");
const TOP_N = 50;

const DEFAULT_STATE = {
  weekStartTs: 0,
  medals: new Map(),
  mostWordsInGame: new Map(),
  bestWord: new Map(),
  longestWord: new Map(),
  bestRoundScore: new Map(),
  bestTimeTargetLong: new Map(),
  bestTimeTargetScore: new Map(),
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
    bestWord: serializeMap(state.bestWord),
    longestWord: serializeMap(state.longestWord),
    bestRoundScore: serializeMap(state.bestRoundScore),
    bestTimeTargetLong: serializeMap(state.bestTimeTargetLong),
    bestTimeTargetScore: serializeMap(state.bestTimeTargetScore),
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

async function loadFromDisk() {
  try {
    const raw = await fs.readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const fileWeek = Number(parsed.weekStartTs) || 0;
    state = {
      weekStartTs: fileWeek || getWeekStartTs(),
      medals: reviveMap(parsed.medals),
      mostWordsInGame: reviveMap(parsed.mostWordsInGame),
      bestWord: reviveMap(parsed.bestWord),
      longestWord: reviveMap(parsed.longestWord),
      bestRoundScore: reviveMap(parsed.bestRoundScore),
      bestTimeTargetLong: reviveMap(parsed.bestTimeTargetLong),
      bestTimeTargetScore: reviveMap(parsed.bestTimeTargetScore),
      mostGobbles: reviveMap(parsed.mostGobbles),
    };
  } catch (_) {
    resetState();
  }
  ensureCurrentWeek();
}

function seedSamples() {
  const now = Date.now();
  const samples = [
    {
      kind: "medals",
      playerKey: "nick:ProtoPanache",
      nick: "ProtoPanache",
      value: { gold: 3, silver: 1, bronze: 0, total: 4, achievedAt: now - 6 * 60 * 60 * 1000 },
    },
    {
      kind: "bestWord",
      playerKey: "nick:Crux",
      nick: "Crux",
      value: { word: "EXACTION", pts: 142, achievedAt: now - 5 * 60 * 60 * 1000 },
    },
    {
      kind: "longestWord",
      playerKey: "nick:QuasarMots",
      nick: "QuasarMots",
      value: { word: "HYPERBOLIQUES", len: 13, achievedAt: now - 4 * 60 * 60 * 1000 },
    },
    {
      kind: "bestRoundScore",
      playerKey: "nick:Proutosaurus Rex",
      nick: "Proutosaurus Rex",
      value: {
        pts: 2100,
        roundId: "room-4x4#sample",
        achievedAt: now - 3 * 60 * 60 * 1000,
      },
    },
    {
      kind: "mostWordsInGame",
      playerKey: "nick:ProtoPanache",
      nick: "ProtoPanache",
      value: { wordsCount: 120, roundId: "room-5x5#sample", achievedAt: now - 2 * 60 * 60 * 1000 },
    },
    {
      kind: "bestTimeTargetLong",
      playerKey: "nick:Crux",
      nick: "Crux",
      value: { ms: 5200, word: "GALAXIE", achievedAt: now - 90 * 60 * 1000 },
    },
    {
      kind: "bestTimeTargetScore",
      playerKey: "nick:QuasarMots",
      nick: "QuasarMots",
      value: { ms: 4300, word: "QUASAR", achievedAt: now - 60 * 60 * 1000 },
    },
    {
      kind: "mostGobbles",
      playerKey: "nick:ProtoPanache",
      nick: "ProtoPanache",
      value: { gobbles: 6, achievedAt: now - 30 * 60 * 1000 },
    },
    {
      kind: "bestWord",
      playerKey: "nick:BOT-Vega",
      nick: "BOT-Vega",
      value: { word: "GALVANOSCOPE", pts: 118, achievedAt: now - 4 * 60 * 60 * 1000 },
    },
    {
      kind: "longestWord",
      playerKey: "nick:BOT-Nexus",
      nick: "BOT-Nexus",
      value: { word: "MICROTECHNIQUE", len: 15, achievedAt: now - 5 * 60 * 60 * 1000 },
    },
  ];
  for (const sample of samples) {
    state[sample.kind].set(sample.playerKey, { nick: sample.nick, playerKey: sample.playerKey, ...sample.value });
  }
}

function resetState() {
  state = {
    ...DEFAULT_STATE,
    medals: new Map(),
    mostWordsInGame: new Map(),
    bestWord: new Map(),
    longestWord: new Map(),
    bestRoundScore: new Map(),
    bestTimeTargetLong: new Map(),
    bestTimeTargetScore: new Map(),
    mostGobbles: new Map(),
    weekStartTs: getWeekStartTs(),
  };
  seedSamples();
  scheduleSave();
}

function ensureCurrentWeek() {
  const currentWeek = getWeekStartTs();
  if (state.weekStartTs !== currentWeek) {
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
  if (!playerKey || !nick || !Number.isFinite(wordsCount)) return;
  const current = state.mostWordsInGame.get(playerKey) || null;
  if (!shouldReplace(current, "wordsCount", wordsCount, achievedAt, false)) return;
  state.mostWordsInGame.set(playerKey, { nick, playerKey, wordsCount, roundId, achievedAt });
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
  return {
    weekStartTs,
    weekStartISO: new Date(weekStartTs).toISOString(),
    nextResetTs,
    nextResetISO: new Date(nextResetTs).toISOString(),
    topN,
    boards: {
      medals: sortEntries(Array.from(state.medals.values()), "total", false).slice(0, topN),
      mostWordsInGame: sortEntries(Array.from(state.mostWordsInGame.values()), "wordsCount", false).slice(
        0,
        topN
      ),
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
      mostGobbles: sortEntries(Array.from(state.mostGobbles.values()), "gobbles", false).slice(0, topN),
    },
  };
}
