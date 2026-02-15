import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = path.join(__dirname, "../data");
const DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : DEFAULT_DATA_DIR;
const DATA_PATH = path.join(DATA_DIR, "team-duel.json");
const WEEKLY_STATS_PATH = path.join(DATA_DIR, "weekly-stats.json");

const PARIS_TZ = "Europe/Paris";
const SHARED_K = 10;
const DAILY_WIN_BONUS = 500;
const GOBBLE_TEAM_POINTS = 5;
const OBJECTIVE_DAILY_CAP = 85;
const OBJECTIVE_TUTORIAL_VERSION = "duel-v1";
const MAX_INSTALL_ID_LEN = 128;
const MAX_NICK_LEN = 48;
const BACKUP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_HISTORY_WEEKS = 30;
const MAX_HISTORY_DAYS = 45;

const TEAM_VALUES = ["red", "blue"];
const OBJECTIVE_BUCKETS = ["easy", "medium", "hard"];
const OBJECTIVE_POINTS_BY_BUCKET = {
  easy: 10,
  medium: 25,
  hard: 50,
};

const OBJECTIVE_POOLS = {
  easy: [
    {
      id: "easy_words_15",
      typeKey: "words_total",
      title: "Valider 15 mots",
      target: 15,
      event: "word_any",
    },
    {
      id: "easy_len_5",
      typeKey: "word_len",
      title: "Trouver 1 mot de 5+ lettres",
      target: 5,
      event: "word_len_at_least",
    },
    {
      id: "easy_round_300",
      typeKey: "round_score",
      title: "Atteindre 300 pts sur une manche",
      target: 300,
      event: "round_score_at_least",
    },
    {
      id: "easy_bonus_tile",
      typeKey: "bonus_tile",
      title: "Valider 1 mot sur case double/triple",
      target: 1,
      event: "bonus_tile_word",
    },
    {
      id: "easy_word_50",
      typeKey: "word_pts_50",
      title: "Valider 1 mot > 50 pts",
      target: 50,
      event: "word_points_gt",
    },
  ],
  medium: [
    {
      id: "medium_words_35",
      typeKey: "words_total",
      title: "Valider 35 mots",
      target: 35,
      event: "word_any",
    },
    {
      id: "medium_len_7",
      typeKey: "word_len",
      title: "Trouver 1 mot de 7+ lettres",
      target: 7,
      event: "word_len_at_least",
    },
    {
      id: "medium_gobble_1",
      typeKey: "gobbles_1",
      title: "Faire 1 gobble",
      target: 1,
      event: "gobble_any",
    },
    {
      id: "medium_round_500",
      typeKey: "round_score",
      title: "Atteindre 500 pts sur une manche",
      target: 500,
      event: "round_score_at_least",
    },
    {
      id: "medium_rare_letter",
      typeKey: "rare_letter",
      title: "Valider 1 mot avec Z/K/X/Y",
      target: 1,
      event: "rare_letter_word",
    },
    {
      id: "medium_word_50",
      typeKey: "word_pts_50",
      title: "Valider 1 mot > 50 pts",
      target: 50,
      event: "word_points_gt",
    },
  ],
  hard: [
    {
      id: "hard_target_word",
      typeKey: "target_word",
      title: "Trouver un mot cible",
      target: 1,
      event: "target_word_found",
    },
    {
      id: "hard_words_60",
      typeKey: "words_total",
      title: "Valider 60 mots",
      target: 60,
      event: "word_any",
    },
    {
      id: "hard_word_100",
      typeKey: "word_pts_100",
      title: "Trouver 1 mot >= 100 pts",
      target: 100,
      event: "word_points_gte",
    },
    {
      id: "hard_round_1000",
      typeKey: "round_score",
      title: "Atteindre 1000 pts sur une manche",
      target: 1000,
      event: "round_score_at_least",
    },
    {
      id: "hard_gobble_2",
      typeKey: "gobbles_2",
      title: "Faire 2 gobbles dans la journee",
      target: 2,
      event: "gobble_any",
    },
    {
      id: "hard_len_9",
      typeKey: "word_len",
      title: "Trouver 1 mot de 9+ lettres",
      target: 9,
      event: "word_len_at_least",
    },
  ],
};

function normalizeInstallId(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_INSTALL_ID_LEN) return "";
  return trimmed;
}

function normalizeNick(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, MAX_NICK_LEN);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

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

function buildDateId(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function getParisDateId(date = new Date()) {
  const p = getParisParts(date);
  return buildDateId(p.year, p.month, p.day);
}

function parseDateId(dateId) {
  const match = String(dateId || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function getParisOffsetMinutes(date) {
  const p = getParisParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

function getParisMidnightTs(year, month, day) {
  const utcMidnight = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offsetMinutes = getParisOffsetMinutes(utcMidnight);
  return utcMidnight.getTime() - offsetMinutes * 60 * 1000;
}

function getParisDateFromTs(ts) {
  const p = getParisParts(new Date(ts));
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

function getISOWeekDataFromUTCDate(utcDate) {
  const d = new Date(Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { isoYear, week };
}

function isoWeekStartUTC(isoYear, week) {
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  const mondayWeek1 = new Date(firstThursday);
  mondayWeek1.setUTCDate(firstThursday.getUTCDate() - firstDay);
  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  return monday;
}

function getWeekIdFromUTCDate(utcDate) {
  const { isoYear, week } = getISOWeekDataFromUTCDate(utcDate);
  return `${isoYear}-W${pad2(week)}`;
}

export function getParisWeekId(date = new Date()) {
  const parisUtcDate = getParisDateFromTs(date.getTime());
  return getWeekIdFromUTCDate(parisUtcDate);
}

export function getWeekIdFromDateId(dateId) {
  const parsed = parseDateId(dateId);
  if (!parsed) return getParisWeekId();
  const utcDate = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  return getWeekIdFromUTCDate(utcDate);
}

function shiftWeekId(weekId, deltaWeeks) {
  const match = String(weekId || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) return getParisWeekId();
  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  if (!isoYear || !week) return getParisWeekId();
  const monday = isoWeekStartUTC(isoYear, week);
  monday.setUTCDate(monday.getUTCDate() + Number(deltaWeeks || 0) * 7);
  return getWeekIdFromUTCDate(monday);
}

function getWeekStartTsFromWeekId(weekId) {
  const match = String(weekId || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) return Date.now();
  const isoYear = Number(match[1]);
  const week = Number(match[2]);
  if (!isoYear || !week) return Date.now();
  const mondayUtc = isoWeekStartUTC(isoYear, week);
  return getParisMidnightTs(
    mondayUtc.getUTCFullYear(),
    mondayUtc.getUTCMonth() + 1,
    mondayUtc.getUTCDate()
  );
}

function hashString(input) {
  const str = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function makeWeekState(weekId) {
  return {
    weekId,
    weekStartTs: getWeekStartTsFromWeekId(weekId),
    generatedAt: Date.now(),
    assignmentFromWeekId: shiftWeekId(weekId, -1),
    teamByInstallId: {},
    levelByInstallId: {},
    totals: {
      objectivePoints: { red: 0, blue: 0 },
      gobblePoints: { red: 0, blue: 0 },
      dailyBonusPoints: { red: 0, blue: 0 },
    },
    contributionsByInstallId: {},
    nickByInstallId: {},
    actionsByInstallId: {},
    dailyWinsByDate: {},
  };
}

function makeObjectiveFromDefinition(def, bucket) {
  return {
    bucket,
    id: def.id,
    typeKey: def.typeKey,
    event: def.event,
    title: def.title,
    target: def.target,
    points: OBJECTIVE_POINTS_BY_BUCKET[bucket] || 0,
    progress: 0,
    validated: false,
    validatedAt: null,
  };
}

function makeDefaultState() {
  return {
    version: 1,
    tutorialVersion: OBJECTIVE_TUTORIAL_VERSION,
    weeks: {},
    crownsByWeek: {},
    dailyObjectivesByInstallId: {},
    dailyBattles: {},
  };
}

let state = makeDefaultState();
let saveTimer = null;
let lastBackupAt = 0;

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

async function saveToDisk() {
  saveTimer = null;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await maybeBackupFile(DATA_PATH);
    await atomicWriteJson(DATA_PATH, state);
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
    const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") {
      state = {
        ...makeDefaultState(),
        ...parsed,
        weeks: parsed.weeks && typeof parsed.weeks === "object" ? parsed.weeks : {},
        crownsByWeek:
          parsed.crownsByWeek && typeof parsed.crownsByWeek === "object"
            ? parsed.crownsByWeek
            : {},
        dailyObjectivesByInstallId:
          parsed.dailyObjectivesByInstallId &&
          typeof parsed.dailyObjectivesByInstallId === "object"
            ? parsed.dailyObjectivesByInstallId
            : {},
        dailyBattles:
          parsed.dailyBattles && typeof parsed.dailyBattles === "object"
            ? parsed.dailyBattles
            : {},
      };
      return;
    }
  } catch (_) {}
  state = makeDefaultState();
}

function cleanupOldState() {
  const nowWeek = getParisWeekId();
  const keepWeeks = new Set();
  keepWeeks.add(nowWeek);
  for (let i = 1; i < MAX_HISTORY_WEEKS; i += 1) {
    keepWeeks.add(shiftWeekId(nowWeek, -i));
  }
  for (const weekId of Object.keys(state.weeks || {})) {
    if (!keepWeeks.has(weekId)) {
      delete state.weeks[weekId];
    }
  }
  for (const weekId of Object.keys(state.crownsByWeek || {})) {
    if (!keepWeeks.has(weekId)) {
      delete state.crownsByWeek[weekId];
    }
  }

  const keepDates = new Set();
  const today = parseDateId(getParisDateId());
  if (today) {
    const base = new Date(Date.UTC(today.year, today.month - 1, today.day));
    for (let i = 0; i < MAX_HISTORY_DAYS; i += 1) {
      const d = new Date(base);
      d.setUTCDate(base.getUTCDate() - i);
      keepDates.add(buildDateId(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
    }
  }
  for (const dateId of Object.keys(state.dailyBattles || {})) {
    if (!keepDates.has(dateId)) {
      delete state.dailyBattles[dateId];
    }
  }
  for (const installId of Object.keys(state.dailyObjectivesByInstallId || {})) {
    const byDate = state.dailyObjectivesByInstallId[installId];
    if (!byDate || typeof byDate !== "object") {
      delete state.dailyObjectivesByInstallId[installId];
      continue;
    }
    for (const dateId of Object.keys(byDate)) {
      if (!keepDates.has(dateId)) {
        delete byDate[dateId];
      }
    }
    if (Object.keys(byDate).length === 0) {
      delete state.dailyObjectivesByInstallId[installId];
    }
  }
}

async function readWeeklyStatsForWeek(previousWeekId) {
  try {
    const raw = await fs.readFile(WEEKLY_STATS_PATH, "utf8");
    const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return [];
    const candidates = [];
    const pushWeek = (value) => {
      if (!value || typeof value !== "object") return;
      const ts = Number(value.weekStartTs);
      if (!Number.isFinite(ts) || ts <= 0) return;
      const weekId = getParisWeekId(new Date(ts));
      if (weekId !== previousWeekId) return;
      const totalScore = value.totalScore && typeof value.totalScore === "object" ? value.totalScore : {};
      candidates.push(totalScore);
    };
    pushWeek(parsed);
    const history = parsed.history && typeof parsed.history === "object" ? parsed.history : {};
    Object.values(history).forEach((value) => pushWeek(value));
    if (!candidates.length) return [];
    const merged = {};
    for (const board of candidates) {
      for (const [playerKey, entry] of Object.entries(board || {})) {
        const current = merged[playerKey];
        const nextTotal = Number(entry?.totalScore) || 0;
        if (!current || nextTotal > (Number(current?.totalScore) || 0)) {
          merged[playerKey] = entry;
        }
      }
    }
    return Object.values(merged);
  } catch (_) {
    return [];
  }
}

async function readInstallNickMapForWeek(targetWeekId) {
  const out = {};
  try {
    const raw = await fs.readFile(WEEKLY_STATS_PATH, "utf8");
    const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return out;
    const scanWeek = (value) => {
      if (!value || typeof value !== "object") return;
      const ts = Number(value.weekStartTs);
      if (!Number.isFinite(ts) || ts <= 0) return;
      const weekId = getParisWeekId(new Date(ts));
      if (weekId !== targetWeekId) return;
      for (const section of Object.values(value)) {
        if (!section || typeof section !== "object" || Array.isArray(section)) continue;
        for (const [entryKey, entry] of Object.entries(section)) {
          if (!entry || typeof entry !== "object") continue;
          const playerKey =
            typeof entry?.playerKey === "string"
              ? entry.playerKey
              : typeof entryKey === "string"
              ? entryKey
              : "";
          if (!playerKey.startsWith("install:")) continue;
          const installId = normalizeInstallId(playerKey.slice("install:".length));
          const nick = normalizeNick(entry?.nick);
          if (!installId || !nick) continue;
          out[installId] = nick;
        }
      }
    };
    scanWeek(parsed);
    const history = parsed.history && typeof parsed.history === "object" ? parsed.history : {};
    Object.values(history).forEach((value) => scanWeek(value));
    return out;
  } catch (_) {
    return out;
  }
}

async function generateTeamsFromPreviousWeek(weekId) {
  const previousWeekId = shiftWeekId(weekId, -1);
  const rows = await readWeeklyStatsForWeek(previousWeekId);
  const players = [];
  let weightedScore = 0;
  let weightedRounds = 0;
  rows.forEach((row) => {
    const key = typeof row?.playerKey === "string" ? row.playerKey : "";
    if (!key.startsWith("install:")) return;
    const installId = normalizeInstallId(key.slice("install:".length));
    if (!installId) return;
    const totalScore = Number(row?.totalScore) || 0;
    const roundsPlayedRaw = Number(row?.roundsPlayed) || 0;
    if (totalScore <= 0 && roundsPlayedRaw <= 0) return;
    const roundsPlayed = Math.max(1, roundsPlayedRaw);
    players.push({
      installId,
      totalScore,
      roundsPlayed,
      avg: totalScore / roundsPlayed,
    });
    weightedScore += totalScore;
    weightedRounds += roundsPlayed;
  });

  if (!players.length) {
    return { teamByInstallId: {}, levelByInstallId: {} };
  }

  const globalAvg = weightedRounds > 0 ? weightedScore / weightedRounds : 0;
  players.forEach((player) => {
    player.level = (player.totalScore + SHARED_K * globalAvg) / (player.roundsPlayed + SHARED_K);
    player.tie = hashString(`${weekId}|${player.installId}`);
  });

  players.sort((a, b) => {
    const d = (b.level || 0) - (a.level || 0);
    if (d !== 0) return d;
    return (a.tie || 0) - (b.tie || 0);
  });

  const sum = { red: 0, blue: 0 };
  const teamByInstallId = {};
  const levelByInstallId = {};
  for (const player of players) {
    const hash = hashString(`${weekId}|${player.installId}|assign`);
    const tiePick = hash % 2 === 0 ? "red" : "blue";
    const team =
      sum.red === sum.blue ? tiePick : sum.red < sum.blue ? "red" : "blue";
    teamByInstallId[player.installId] = team;
    levelByInstallId[player.installId] = player.level;
    sum[team] += player.level || 0;
  }

  return { teamByInstallId, levelByInstallId };
}

async function ensureWeekState(weekId) {
  const safeWeekId = weekId || getParisWeekId();
  const existing = state.weeks[safeWeekId];
  if (existing && typeof existing === "object") {
    if (!existing.totals || typeof existing.totals !== "object") {
      existing.totals = {
        objectivePoints: { red: 0, blue: 0 },
        gobblePoints: { red: 0, blue: 0 },
        dailyBonusPoints: { red: 0, blue: 0 },
      };
    }
    if (!existing.contributionsByInstallId || typeof existing.contributionsByInstallId !== "object") {
      existing.contributionsByInstallId = {};
    }
    if (!existing.nickByInstallId || typeof existing.nickByInstallId !== "object") {
      existing.nickByInstallId = {};
    }
    if (!existing.actionsByInstallId || typeof existing.actionsByInstallId !== "object") {
      existing.actionsByInstallId = {};
    }
    if (!existing.dailyWinsByDate || typeof existing.dailyWinsByDate !== "object") {
      existing.dailyWinsByDate = {};
    }
    return existing;
  }
  const week = makeWeekState(safeWeekId);
  const generated = await generateTeamsFromPreviousWeek(safeWeekId);
  week.teamByInstallId = generated.teamByInstallId || {};
  week.levelByInstallId = generated.levelByInstallId || {};
  state.weeks[safeWeekId] = week;
  cleanupOldState();
  scheduleSave();
  return week;
}

async function ensureCrownsForWeek(weekId) {
  await finalizeDailyBonusesUntil(getParisDateId());
  if (state.crownsByWeek?.[weekId]) return state.crownsByWeek[weekId];
  const previousWeekId = shiftWeekId(weekId, -1);
  const previousWeek = await ensureWeekState(previousWeekId);
  const totals = previousWeek?.totals || {};
  const red =
    (Number(totals?.objectivePoints?.red) || 0) +
    (Number(totals?.gobblePoints?.red) || 0) +
    (Number(totals?.dailyBonusPoints?.red) || 0);
  const blue =
    (Number(totals?.objectivePoints?.blue) || 0) +
    (Number(totals?.gobblePoints?.blue) || 0) +
    (Number(totals?.dailyBonusPoints?.blue) || 0);
  const winnerTeam = red === blue ? null : red > blue ? "red" : "blue";
  const crowned = {};
  if (winnerTeam) {
    const teamMap = previousWeek?.teamByInstallId || {};
    const actions = previousWeek?.actionsByInstallId || {};
    for (const [installId, team] of Object.entries(teamMap)) {
      if (team !== winnerTeam) continue;
      if (!actions[installId]) continue;
      crowned[installId] = true;
    }
  }
  state.crownsByWeek[weekId] = crowned;
  scheduleSave();
  return crowned;
}

function createObjectiveSelection(installId, dateId, previous = null) {
  const selected = [];
  const usedTypeKeys = new Set();
  for (const bucket of OBJECTIVE_BUCKETS) {
    const pool = OBJECTIVE_POOLS[bucket] || [];
    const candidates = pool.filter((item) => !usedTypeKeys.has(item.typeKey));
    const source = candidates.length ? candidates : pool;
    if (!source.length) continue;
    const seed = hashString(`${installId}|${dateId}|${bucket}|base`);
    const rng = mulberry32(seed);
    const pick = source[Math.floor(rng() * source.length)];
    if (!pick) continue;
    selected.push(makeObjectiveFromDefinition(pick, bucket));
    usedTypeKeys.add(pick.typeKey);
  }
  if (selected.length === 3) return selected;

  const byBucket = new Map(selected.map((item) => [item.bucket, item]));
  for (const bucket of OBJECTIVE_BUCKETS) {
    if (byBucket.has(bucket)) continue;
    const pool = OBJECTIVE_POOLS[bucket] || [];
    const seed = hashString(`${installId}|${dateId}|${bucket}|fallback`);
    const rng = mulberry32(seed);
    const pick = pool[Math.floor(rng() * pool.length)];
    if (!pick) continue;
    byBucket.set(bucket, makeObjectiveFromDefinition(pick, bucket));
  }
  const finalSelection = OBJECTIVE_BUCKETS.map((bucket) => byBucket.get(bucket)).filter(Boolean);
  return finalSelection.length ? finalSelection : previous || [];
}

function getObjectivesDay(installId, dateId, { createIfMissing = true } = {}) {
  const safeInstallId = normalizeInstallId(installId);
  const safeDateId = parseDateId(dateId) ? dateId : getParisDateId();
  if (!safeInstallId) return null;
  if (!state.dailyObjectivesByInstallId[safeInstallId]) {
    if (!createIfMissing) return null;
    state.dailyObjectivesByInstallId[safeInstallId] = {};
  }
  const byDate = state.dailyObjectivesByInstallId[safeInstallId];
  let day = byDate[safeDateId];
  if (!day && createIfMissing) {
    day = {
      dateId: safeDateId,
      rerollUsed: false,
      pointsAwarded: 0,
      objectives: createObjectiveSelection(safeInstallId, safeDateId),
      updatedAt: Date.now(),
    };
    byDate[safeDateId] = day;
    scheduleSave();
  }
  return day || null;
}

function applyEventToObjective(objective, eventType, payload = {}) {
  if (!objective || objective.validated) return false;
  const nextProgress = Number(objective.progress) || 0;
  let progress = nextProgress;
  if (objective.id.endsWith("_words_15") || objective.id.endsWith("_words_35") || objective.id.endsWith("_words_60")) {
    if (eventType === "word") progress += 1;
  } else if (objective.event === "word_len_at_least") {
    if (eventType === "word" && Number(payload.wordLength) >= Number(objective.target || 0)) {
      progress = Number(objective.target) || 1;
    }
  } else if (objective.event === "round_score_at_least") {
    if (
      eventType === "round" &&
      !payload.isTargetRound &&
      Number(payload.roundScore) >= Number(objective.target || 0)
    ) {
      progress = Number(objective.target) || 1;
    }
  } else if (objective.event === "bonus_tile_word") {
    if (eventType === "word" && payload.usedBonusTile) progress += 1;
  } else if (objective.event === "word_points_gt") {
    if (eventType === "word" && Number(payload.wordPoints) > Number(objective.target || 0)) {
      progress = Number(objective.target) || 1;
    }
  } else if (objective.event === "word_points_gte") {
    if (eventType === "word" && Number(payload.wordPoints) >= Number(objective.target || 0)) {
      progress = Number(objective.target) || 1;
    }
  } else if (objective.event === "rare_letter_word") {
    if (eventType === "word" && payload.usedRareLetter) progress += 1;
  } else if (objective.event === "gobble_any") {
    if (eventType === "gobble") progress += Number(payload.gobbles) || 0;
  } else if (objective.event === "target_word_found") {
    if (eventType === "target_found") progress += 1;
  }

  const capped = Math.min(progress, Number(objective.target) || 1);
  const changed = capped !== nextProgress;
  if (changed) objective.progress = capped;
  if (!objective.validated && objective.progress >= (Number(objective.target) || 1)) {
    objective.validated = true;
    objective.validatedAt = Date.now();
  }
  return changed || objective.validated;
}

function getTeamTotals(week) {
  const totals = week?.totals || {};
  const objective = totals?.objectivePoints || { red: 0, blue: 0 };
  const gobble = totals?.gobblePoints || { red: 0, blue: 0 };
  const daily = totals?.dailyBonusPoints || { red: 0, blue: 0 };
  const red =
    (Number(objective.red) || 0) + (Number(gobble.red) || 0) + (Number(daily.red) || 0);
  const blue =
    (Number(objective.blue) || 0) + (Number(gobble.blue) || 0) + (Number(daily.blue) || 0);
  return {
    totalByTeam: { red, blue },
    objectiveByTeam: { red: Number(objective.red) || 0, blue: Number(objective.blue) || 0 },
    gobbleByTeam: { red: Number(gobble.red) || 0, blue: Number(gobble.blue) || 0 },
    dailyBonusByTeam: { red: Number(daily.red) || 0, blue: Number(daily.blue) || 0 },
  };
}

function getActiveTeamCounts(week) {
  const counts = { red: 0, blue: 0 };
  if (!week || typeof week !== "object") return counts;
  const teamByInstallId =
    week.teamByInstallId && typeof week.teamByInstallId === "object"
      ? week.teamByInstallId
      : {};
  const actionsByInstallId =
    week.actionsByInstallId && typeof week.actionsByInstallId === "object"
      ? week.actionsByInstallId
      : {};
  for (const [rawInstallId, active] of Object.entries(actionsByInstallId)) {
    if (!active) continue;
    const installId = normalizeInstallId(rawInstallId);
    if (!installId) continue;
    const team = teamByInstallId[installId];
    if (!TEAM_VALUES.includes(team)) continue;
    counts[team] += 1;
  }
  return counts;
}

async function ensureInstallTeam(installId, weekId) {
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) return null;
  const safeWeekId = weekId || getParisWeekId();
  const week = await ensureWeekState(safeWeekId);
  let team = week.teamByInstallId[safeInstallId];
  if (!team) {
    const activeCounts = getActiveTeamCounts(week);
    if (activeCounts.red !== activeCounts.blue) {
      team = activeCounts.red < activeCounts.blue ? "red" : "blue";
    } else {
      const totals = getTeamTotals(week);
      const redTotal = Number(totals?.totalByTeam?.red) || 0;
      const blueTotal = Number(totals?.totalByTeam?.blue) || 0;
      if (redTotal !== blueTotal) {
        team = redTotal < blueTotal ? "red" : "blue";
      }
    }
    if (!TEAM_VALUES.includes(team)) {
      team = hashString(`${safeWeekId}|${safeInstallId}|fallback`) % 2 === 0 ? "red" : "blue";
    }
    week.teamByInstallId[safeInstallId] = team;
    scheduleSave();
  }
  return TEAM_VALUES.includes(team) ? team : null;
}

function trackInstallNickOnWeek(week, installId, nick) {
  const safeInstallId = normalizeInstallId(installId);
  const safeNick = normalizeNick(nick);
  if (!safeInstallId || !safeNick || !week) return false;
  if (!week.nickByInstallId || typeof week.nickByInstallId !== "object") {
    week.nickByInstallId = {};
  }
  if (week.nickByInstallId[safeInstallId] === safeNick) return false;
  week.nickByInstallId[safeInstallId] = safeNick;
  return true;
}

function addInstallContributionToWeek(week, installId, team, kind, points) {
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId || !week) return false;
  const safePoints = Number(points) || 0;
  if (safePoints === 0) return false;
  const safeTeam = TEAM_VALUES.includes(team) ? team : null;
  if (!safeTeam) return false;
  if (!week.contributionsByInstallId || typeof week.contributionsByInstallId !== "object") {
    week.contributionsByInstallId = {};
  }
  const current =
    week.contributionsByInstallId[safeInstallId] &&
    typeof week.contributionsByInstallId[safeInstallId] === "object"
      ? week.contributionsByInstallId[safeInstallId]
      : {
          team: safeTeam,
          objectivePoints: 0,
          gobblePoints: 0,
          totalPoints: 0,
        };
  current.team = safeTeam;
  if (kind === "objectivePoints") {
    current.objectivePoints = (Number(current.objectivePoints) || 0) + safePoints;
  } else if (kind === "gobblePoints") {
    current.gobblePoints = (Number(current.gobblePoints) || 0) + safePoints;
  }
  current.totalPoints = (Number(current.totalPoints) || 0) + safePoints;
  week.contributionsByInstallId[safeInstallId] = current;
  return true;
}

async function buildWeeklyContributorsByTeam(week) {
  const out = { red: [], blue: [] };
  if (!week || typeof week !== "object") {
    return out;
  }
  const weekId = week.weekId || getParisWeekId();
  const inferredObjectivePointsByInstall = {};
  for (const [rawInstallId, byDate] of Object.entries(state.dailyObjectivesByInstallId || {})) {
    const installId = normalizeInstallId(rawInstallId);
    if (!installId || !byDate || typeof byDate !== "object") continue;
    let sum = 0;
    for (const [dateId, day] of Object.entries(byDate)) {
      if (!parseDateId(dateId)) continue;
      if (getWeekIdFromDateId(dateId) !== weekId) continue;
      sum += Math.max(0, Number(day?.pointsAwarded) || 0);
    }
    if (sum > 0) inferredObjectivePointsByInstall[installId] = sum;
  }
  const contributions =
    week.contributionsByInstallId && typeof week.contributionsByInstallId === "object"
      ? week.contributionsByInstallId
      : {};
  const nickByInstallId = week.nickByInstallId && typeof week.nickByInstallId === "object"
    ? week.nickByInstallId
    : {};
  const weeklyNickFallback = await readInstallNickMapForWeek(weekId);
  const allInstallIds = new Set([
    ...Object.keys(contributions),
    ...Object.keys(inferredObjectivePointsByInstall),
  ]);
  for (const installId of allInstallIds) {
    const entry = contributions[installId];
    const team = entry?.team || week?.teamByInstallId?.[installId] || null;
    if (!TEAM_VALUES.includes(team)) continue;
    const objectivePoints = Math.max(
      Number(entry?.objectivePoints) || 0,
      Number(inferredObjectivePointsByInstall[installId]) || 0
    );
    const gobblePoints = Number(entry?.gobblePoints) || 0;
    const points = objectivePoints + gobblePoints;
    if (points <= 0) continue;
    const nick =
      normalizeNick(nickByInstallId[installId]) ||
      normalizeNick(weeklyNickFallback[installId]) ||
      `Joueur ${installId.slice(-4)}`;
    out[team].push({ installId, nick, points });
  }
  out.red.sort((a, b) => {
    const d = (Number(b?.points) || 0) - (Number(a?.points) || 0);
    if (d !== 0) return d;
    return String(a?.nick || "").localeCompare(String(b?.nick || ""));
  });
  out.blue.sort((a, b) => {
    const d = (Number(b?.points) || 0) - (Number(a?.points) || 0);
    if (d !== 0) return d;
    return String(a?.nick || "").localeCompare(String(b?.nick || ""));
  });
  return out;
}

async function addTeamPoints(weekId, team, kind, points, { installId = "", nick = "" } = {}) {
  const safeTeam = TEAM_VALUES.includes(team) ? team : null;
  const safeKind =
    kind === "objectivePoints" || kind === "gobblePoints" || kind === "dailyBonusPoints"
      ? kind
      : null;
  const safePoints = Number(points) || 0;
  if (!safeTeam || !safeKind || safePoints === 0) return;
  const week = await ensureWeekState(weekId);
  if (!week.totals) week.totals = {};
  if (!week.totals[safeKind]) week.totals[safeKind] = { red: 0, blue: 0 };
  week.totals[safeKind][safeTeam] = (Number(week.totals[safeKind][safeTeam]) || 0) + safePoints;
  if (safeKind === "objectivePoints" || safeKind === "gobblePoints") {
    addInstallContributionToWeek(week, installId, safeTeam, safeKind, safePoints);
  }
  trackInstallNickOnWeek(week, installId, nick);
  scheduleSave();
}

export async function recordInstallAction(installId, { dateId = null, weekId = null } = {}) {
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) return;
  const resolvedWeekId = weekId || getWeekIdFromDateId(dateId || getParisDateId());
  const week = await ensureWeekState(resolvedWeekId);
  if (!week.actionsByInstallId) week.actionsByInstallId = {};
  if (!week.actionsByInstallId[safeInstallId]) {
    week.actionsByInstallId[safeInstallId] = true;
    scheduleSave();
  }
}

async function applyObjectiveEvent(installId, dateId, eventType, payload = {}) {
  const day = getObjectivesDay(installId, dateId, { createIfMissing: true });
  if (!day) return { updates: [] };
  const updates = [];
  const safeInstallId = normalizeInstallId(installId);
  const safeDateId = day.dateId;
  const weekId = getWeekIdFromDateId(safeDateId);
  const team = await ensureInstallTeam(safeInstallId, weekId);
  for (const objective of day.objectives || []) {
    const wasValidated = !!objective.validated;
    const prevProgress = Number(objective.progress) || 0;
    applyEventToObjective(objective, eventType, payload);
    const nextProgress = Number(objective.progress) || 0;
    const newlyValidated = !!objective.validated && !wasValidated;
    let teamPointsAwarded = 0;
    if (newlyValidated) {
      const canAward = (Number(day.pointsAwarded) || 0) < OBJECTIVE_DAILY_CAP;
      if (canAward && team) {
        const roomLeft = OBJECTIVE_DAILY_CAP - (Number(day.pointsAwarded) || 0);
        const pointsAwarded = Math.max(0, Math.min(roomLeft, Number(objective.points) || 0));
        if (pointsAwarded > 0) {
          day.pointsAwarded = (Number(day.pointsAwarded) || 0) + pointsAwarded;
          teamPointsAwarded = pointsAwarded;
          await addTeamPoints(weekId, team, "objectivePoints", pointsAwarded, {
            installId: safeInstallId,
            nick: payload?.nick || "",
          });
        }
      }
      await recordInstallAction(safeInstallId, { dateId: safeDateId, weekId });
    }
    if (nextProgress !== prevProgress || newlyValidated) {
      updates.push({
        bucket: objective.bucket,
        id: objective.id,
        title: objective.title,
        points: objective.points,
        progress: objective.progress,
        target: objective.target,
        validated: !!objective.validated,
        newlyValidated,
        teamPointsAwarded,
      });
    }
  }
  day.updatedAt = Date.now();
  if (updates.length) scheduleSave();
  return { updates };
}

function buildDailyBattlePayload(dateId, entries, teamByInstallId = {}) {
  const players = [];
  for (const entry of entries || []) {
    if (!entry || entry.isPalier) continue;
    const installId = normalizeInstallId(entry.installId);
    if (!installId) continue;
    const score = Number(entry.score) || 0;
    const team = teamByInstallId[installId];
    if (!TEAM_VALUES.includes(team)) continue;
    players.push({ installId, score, team });
  }

  const redPlayers = players.filter((p) => p.team === "red");
  const bluePlayers = players.filter((p) => p.team === "blue");
  const redScores = redPlayers.map((p) => p.score).sort((a, b) => a - b);
  const blueScores = bluePlayers.map((p) => p.score).sort((a, b) => a - b);

  const rawRed = redScores.reduce((sum, s) => sum + s, 0);
  const rawBlue = blueScores.reduce((sum, s) => sum + s, 0);
  const redCount = redScores.length;
  const blueCount = blueScores.length;

  const ignoredInstallIds = [];
  if (redCount > blueCount) {
    const diff = redCount - blueCount;
    const sorted = [...redPlayers].sort((a, b) => a.score - b.score);
    for (let i = 0; i < diff; i += 1) {
      if (sorted[i]?.installId) ignoredInstallIds.push(sorted[i].installId);
    }
  } else if (blueCount > redCount) {
    const diff = blueCount - redCount;
    const sorted = [...bluePlayers].sort((a, b) => a.score - b.score);
    for (let i = 0; i < diff; i += 1) {
      if (sorted[i]?.installId) ignoredInstallIds.push(sorted[i].installId);
    }
  }

  const keptRedScores = redCount > blueCount ? redScores.slice(redCount - blueCount) : redScores;
  const keptBlueScores = blueCount > redCount ? blueScores.slice(blueCount - redCount) : blueScores;
  const balancedRed = keptRedScores.reduce((sum, s) => sum + s, 0);
  const balancedBlue = keptBlueScores.reduce((sum, s) => sum + s, 0);
  const winnerTeam =
    balancedRed === balancedBlue ? null : balancedRed > balancedBlue ? "red" : "blue";

  return {
    dateId,
    totalsRawByTeam: { red: rawRed, blue: rawBlue },
    totalsBalancedByTeam: { red: balancedRed, blue: balancedBlue },
    countedPlayersByTeam: {
      red: keptRedScores.length,
      blue: keptBlueScores.length,
    },
    totalPlayersByTeam: { red: redCount, blue: blueCount },
    ignoredInstallIds,
    winnerTeam,
    timestamp: Date.now(),
  };
}

async function syncDailyWinDeltaForDate(dateId, battle) {
  const weekId = getWeekIdFromDateId(dateId);
  const week = await ensureWeekState(weekId);
  if (!week.dailyWinsByDate) week.dailyWinsByDate = {};
  const recordedWinner = TEAM_VALUES.includes(week.dailyWinsByDate[dateId])
    ? week.dailyWinsByDate[dateId]
    : null;
  const winner = TEAM_VALUES.includes(battle?.winnerTeam) ? battle.winnerTeam : null;

  if (recordedWinner && recordedWinner !== winner) {
    await addTeamPoints(weekId, recordedWinner, "dailyBonusPoints", -DAILY_WIN_BONUS);
    delete week.dailyWinsByDate[dateId];
  }
  if (winner && winner !== recordedWinner) {
    await addTeamPoints(weekId, winner, "dailyBonusPoints", DAILY_WIN_BONUS);
    week.dailyWinsByDate[dateId] = winner;
  }
  if (!winner && !recordedWinner) return;
  scheduleSave();
}

export async function finalizeDailyBonusesUntil(dateId = null) {
  const cutoffDateId = parseDateId(dateId) ? dateId : getParisDateId();
  const allDates = Object.keys(state.dailyBattles || {})
    .filter((entryDateId) => parseDateId(entryDateId) && entryDateId < cutoffDateId)
    .sort();
  for (const entryDateId of allDates) {
    await syncDailyWinDeltaForDate(entryDateId, state.dailyBattles?.[entryDateId] || null);
  }
  for (const [weekId, week] of Object.entries(state.weeks || {})) {
    if (!week || typeof week !== "object") continue;
    const map = week.dailyWinsByDate && typeof week.dailyWinsByDate === "object" ? week.dailyWinsByDate : {};
    for (const [entryDateId, winner] of Object.entries(map)) {
      if (!parseDateId(entryDateId) || entryDateId < cutoffDateId) continue;
      if (TEAM_VALUES.includes(winner)) {
        await addTeamPoints(weekId, winner, "dailyBonusPoints", -DAILY_WIN_BONUS);
      }
      delete map[entryDateId];
      scheduleSave();
    }
  }
}

export async function recordDailyBattleFromEntries(dateId, entries) {
  const safeDateId = parseDateId(dateId) ? dateId : getParisDateId();
  const weekId = getWeekIdFromDateId(safeDateId);
  const teamByInstallId = {};
  const playerEntries = Array.isArray(entries)
    ? entries.filter((entry) => entry && !entry.isPalier && entry.installId)
    : [];
  for (const entry of playerEntries) {
    const installId = normalizeInstallId(entry.installId);
    if (!installId) continue;
    teamByInstallId[installId] = await ensureInstallTeam(installId, weekId);
    await recordInstallAction(installId, { dateId: safeDateId, weekId });
  }
  const next = buildDailyBattlePayload(safeDateId, playerEntries, teamByInstallId);
  state.dailyBattles[safeDateId] = next;
  await finalizeDailyBonusesUntil(getParisDateId());
  scheduleSave();
  return next;
}

export async function getDailyBattleResult(dateId) {
  const safeDateId = parseDateId(dateId) ? dateId : getParisDateId();
  return state.dailyBattles?.[safeDateId] || null;
}

export async function annotateEntriesWithTeam(entries, { dateId = null, weekId = null } = {}) {
  const safeDateId = parseDateId(dateId) ? dateId : null;
  const resolvedWeekId = weekId || (safeDateId ? getWeekIdFromDateId(safeDateId) : getParisWeekId());
  const out = [];
  for (const entry of entries || []) {
    if (!entry || typeof entry !== "object") {
      out.push(entry);
      continue;
    }
    const installId = normalizeInstallId(entry.installId);
    const team = installId ? await ensureInstallTeam(installId, resolvedWeekId) : null;
    out.push({ ...entry, team: team || null });
  }
  return out;
}

export async function getTeamForInstall(installId, { weekId = null, dateId = null } = {}) {
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) return null;
  const resolvedWeekId = weekId || getWeekIdFromDateId(dateId || getParisDateId());
  return ensureInstallTeam(safeInstallId, resolvedWeekId);
}

export async function isInstallCrowned(installId, weekId = null) {
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) return false;
  const resolvedWeekId = weekId || getParisWeekId();
  const crowns = await ensureCrownsForWeek(resolvedWeekId);
  return !!crowns?.[safeInstallId];
}

export async function getObjectivesStatus(installId, dateId = null) {
  const safeInstallId = normalizeInstallId(installId);
  const safeDateId = parseDateId(dateId) ? dateId : getParisDateId();
  if (!safeInstallId) {
    return {
      ok: false,
      error: "invalid_install_id",
      dateId: safeDateId,
      objectives: [],
      rerollUsed: false,
      pointsAwarded: 0,
      pointsCap: OBJECTIVE_DAILY_CAP,
    };
  }
  const day = getObjectivesDay(safeInstallId, safeDateId, { createIfMissing: true });
  return {
    ok: true,
    dateId: safeDateId,
    objectives: Array.isArray(day?.objectives) ? day.objectives : [],
    rerollUsed: !!day?.rerollUsed,
    pointsAwarded: Number(day?.pointsAwarded) || 0,
    pointsCap: OBJECTIVE_DAILY_CAP,
  };
}

export async function rerollObjective({
  installId,
  dateId = null,
  bucket = null,
}) {
  const safeInstallId = normalizeInstallId(installId);
  const safeDateId = parseDateId(dateId) ? dateId : getParisDateId();
  if (!safeInstallId) return { ok: false, error: "invalid_install_id", dateId: safeDateId };
  const day = getObjectivesDay(safeInstallId, safeDateId, { createIfMissing: true });
  if (!day) return { ok: false, error: "missing_day", dateId: safeDateId };
  if (day.rerollUsed) return { ok: false, error: "reroll_used", dateId: safeDateId };
  const safeBucket = OBJECTIVE_BUCKETS.includes(bucket) ? bucket : null;
  const unresolved = (day.objectives || []).filter((objective) => !objective?.validated);
  if (!unresolved.length) {
    return { ok: false, error: "all_validated", dateId: safeDateId };
  }
  const target =
    (safeBucket && unresolved.find((objective) => objective?.bucket === safeBucket)) ||
    unresolved[0];
  if (!target) return { ok: false, error: "no_target", dateId: safeDateId };
  const pool = OBJECTIVE_POOLS[target.bucket] || [];
  const usedTypes = new Set(
    (day.objectives || [])
      .filter((objective) => objective !== target)
      .map((objective) => objective?.typeKey)
      .filter(Boolean)
  );
  let candidates = pool.filter((item) => item.typeKey && !usedTypes.has(item.typeKey));
  if (candidates.length > 1) {
    candidates = candidates.filter((item) => item.id !== target.id);
  }
  if (!candidates.length) {
    candidates = pool.filter((item) => item.id !== target.id);
  }
  if (!candidates.length) {
    candidates = pool;
  }
  if (!candidates.length) return { ok: false, error: "no_candidate", dateId: safeDateId };
  const seed = hashString(`${safeInstallId}|${safeDateId}|${target.bucket}|reroll`);
  const rng = mulberry32(seed);
  const picked = candidates[Math.floor(rng() * candidates.length)] || candidates[0];
  const replacement = makeObjectiveFromDefinition(picked, target.bucket);
  day.objectives = (day.objectives || []).map((objective) =>
    objective === target ? replacement : objective
  );
  day.rerollUsed = true;
  day.updatedAt = Date.now();
  scheduleSave();
  return {
    ok: true,
    dateId: safeDateId,
    objective: replacement,
    objectives: day.objectives,
    rerollUsed: true,
  };
}

export async function recordMainWordAccepted({
  installId,
  nick = "",
  dateId = null,
  roundSpecialType = null,
  wordLength = 0,
  wordPoints = 0,
  usedBonusTile = false,
  usedRareLetter = false,
}) {
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) return { ok: false, updates: [] };
  if (roundSpecialType === "target_long" || roundSpecialType === "target_score") {
    return { ok: true, updates: [] };
  }
  const safeDateId = parseDateId(dateId) ? dateId : getParisDateId();
  const result = await applyObjectiveEvent(safeInstallId, safeDateId, "word", {
    wordLength: Number(wordLength) || 0,
    wordPoints: Number(wordPoints) || 0,
    usedBonusTile: !!usedBonusTile,
    usedRareLetter: !!usedRareLetter,
    nick: normalizeNick(nick),
  });
  await recordInstallAction(safeInstallId, { dateId: safeDateId });
  return { ok: true, ...result };
}

export async function recordMainRoundCompleted({
  installId,
  nick = "",
  dateId = null,
  isTargetRound = false,
  roundScore = 0,
  gobblesEarned = 0,
  targetFound = false,
  participated = false,
}) {
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) {
    return { ok: false, updates: [], gobblePointsAdded: 0, objectivePointsAdded: 0 };
  }
  const safeDateId = parseDateId(dateId) ? dateId : getParisDateId();
  const weekId = getWeekIdFromDateId(safeDateId);
  const team = await ensureInstallTeam(safeInstallId, weekId);

  let gobbleCount = Math.max(0, Number(gobblesEarned) || 0);
  if (isTargetRound && targetFound) {
    gobbleCount += 1;
  }
  const gobblePointsAdded = gobbleCount * GOBBLE_TEAM_POINTS;
  if (team && gobblePointsAdded > 0) {
    await addTeamPoints(weekId, team, "gobblePoints", gobblePointsAdded, {
      installId: safeInstallId,
      nick: normalizeNick(nick),
    });
  }

  const allUpdates = [];
  const roundUpdates = await applyObjectiveEvent(safeInstallId, safeDateId, "round", {
    isTargetRound: !!isTargetRound,
    roundScore: Number(roundScore) || 0,
    nick: normalizeNick(nick),
  });
  allUpdates.push(...(roundUpdates.updates || []));
  if (gobbleCount > 0) {
    const gobbleUpdates = await applyObjectiveEvent(safeInstallId, safeDateId, "gobble", {
      gobbles: gobbleCount,
      nick: normalizeNick(nick),
    });
    allUpdates.push(...(gobbleUpdates.updates || []));
  }
  if (targetFound) {
    const targetUpdates = await applyObjectiveEvent(safeInstallId, safeDateId, "target_found", {
      nick: normalizeNick(nick),
    });
    allUpdates.push(...(targetUpdates.updates || []));
  }
  if (participated || Number(roundScore) > 0 || gobbleCount > 0 || targetFound) {
    await recordInstallAction(safeInstallId, { dateId: safeDateId, weekId });
  }
  const objectivePointsAdded = allUpdates
    .filter((entry) => entry?.newlyValidated)
    .reduce(
      (sum, entry) =>
        sum + (Number(entry?.teamPointsAwarded) || Number(entry?.points) || 0),
      0
    );
  return { ok: true, updates: allUpdates, gobblePointsAdded, objectivePointsAdded };
}

export async function recordDailyPlayed({
  installId,
  dateId = null,
}) {
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) return;
  const safeDateId = parseDateId(dateId) ? dateId : getParisDateId();
  await recordInstallAction(safeInstallId, { dateId: safeDateId });
}

export async function getWeeklyDuelScore(weekId = null) {
  await finalizeDailyBonusesUntil(getParisDateId());
  const safeWeekId = weekId || getParisWeekId();
  const week = await ensureWeekState(safeWeekId);
  const totals = getTeamTotals(week);
  const contributorsByTeam = await buildWeeklyContributorsByTeam(week);
  return {
    weekId: safeWeekId,
    weekStartTs: week.weekStartTs || getWeekStartTsFromWeekId(safeWeekId),
    totalsByTeam: totals.totalByTeam,
    objectivePointsByTeam: totals.objectiveByTeam,
    gobblePointsByTeam: totals.gobbleByTeam,
    dailyBonusPointsByTeam: totals.dailyBonusByTeam,
    contributorsByTeam,
    winnerTeam:
      totals.totalByTeam.red === totals.totalByTeam.blue
        ? null
        : totals.totalByTeam.red > totals.totalByTeam.blue
        ? "red"
        : "blue",
  };
}

export async function getDuelStatus(installId, { dateId = null, weekId = null } = {}) {
  const safeDateId = parseDateId(dateId) ? dateId : getParisDateId();
  const resolvedWeekId = weekId || getWeekIdFromDateId(safeDateId);
  const weekly = await getWeeklyDuelScore(resolvedWeekId);
  const safeInstallId = normalizeInstallId(installId);
  const team = safeInstallId ? await ensureInstallTeam(safeInstallId, resolvedWeekId) : null;
  const crowned = safeInstallId ? await isInstallCrowned(safeInstallId, resolvedWeekId) : false;
  const objectives = safeInstallId
    ? await getObjectivesStatus(safeInstallId, safeDateId)
    : {
        ok: false,
        error: "invalid_install_id",
        dateId: safeDateId,
        objectives: [],
        rerollUsed: false,
        pointsAwarded: 0,
        pointsCap: OBJECTIVE_DAILY_CAP,
      };
  const dailyBattle = await getDailyBattleResult(safeDateId);
  return {
    tutorialVersion: state.tutorialVersion || OBJECTIVE_TUTORIAL_VERSION,
    dateId: safeDateId,
    weekId: resolvedWeekId,
    team,
    crowned,
    weekly,
    objectives,
    dailyBattle,
  };
}

await loadFromDisk();
cleanupOldState();
