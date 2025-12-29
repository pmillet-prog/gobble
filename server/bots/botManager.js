import { solveGrid } from "../../shared/gameLogic.js";

export const MAX_WORDS_PER_BOT_PER_ROUND = 220;
const BOT_ROTATION_MINUTES = 60;

// Modifiez librement ces listes : noms fixes, niveaux varies, fenetres de pause.
export const BOT_ROSTER_4X4 = [
  { nick: "Proutosaurus Rex", skill: 0.82, maxWordsPerRound: 92, minWordsPerRound: 35, pointBias: 0.85, pace: 0.9, sleep: { startHour: 2, durationHours: 2 } },
  { nick: "ProtoPanache", skill: 0.9, maxWordsPerRound: 96, minWordsPerRound: 38, pointBias: 0.88, pace: 1.05, sleep: { startHour: 4, durationHours: 3 } },
  { nick: "Crux", skill: 0.74, maxWordsPerRound: 82, minWordsPerRound: 30, pointBias: 0.78, pace: 1.05 },
  { nick: "QuasarMots", skill: 0.88, maxWordsPerRound: 90, minWordsPerRound: 36, pointBias: 0.84, pace: 1.02, sleep: { startHour: 3, durationHours: 3 } },
  { nick: "Celie", skill: 0.66, maxWordsPerRound: 74, minWordsPerRound: 28, pointBias: 0.7, pace: 1.0, sleep: { startHour: 3, durationHours: 3 } },
  { nick: "Sylvie50", skill: 0.6, maxWordsPerRound: 71, minWordsPerRound: 25, pointBias: 0.65, pace: 0.95 },
  { nick: "Alcapouet", skill: 0.75, maxWordsPerRound: 69, minWordsPerRound: 22, pointBias: 0.55, pace: 1.1 },
  { nick: "Fanny", skill: 0.5, maxWordsPerRound: 65, minWordsPerRound: 20, pointBias: 0.5, pace: 0.85, sleep: { startHour: 1, durationHours: 2 } },
  { nick: "(cacharel)", skill: 0.45, maxWordsPerRound: 62, minWordsPerRound: 18, pointBias: 0.45, pace: 0.9 },
  { nick: "--SuperNapo--", skill: 0.4, maxWordsPerRound: 58, minWordsPerRound: 16, pointBias: 0.4, pace: 1.15 },
  { nick: "Citronpitou", skill: 0.36, maxWordsPerRound: 50, minWordsPerRound: 14, pointBias: 0.35, pace: 1.0 },
  { nick: "Zigouigoui", skill: 0.33, maxWordsPerRound: 47, minWordsPerRound: 12, pointBias: 0.35, pace: 0.95 },
  { nick: "Kamil", skill: 0.3, maxWordsPerRound: 41, minWordsPerRound: 12, pointBias: 0.3, pace: 1.05, sleep: { startHour: 2, durationHours: 4 } },
  { nick: "Lena", skill: 0.28, maxWordsPerRound: 38, minWordsPerRound: 10, pointBias: 0.35, pace: 0.9 },
  { nick: "Malo", skill: 0.25, maxWordsPerRound: 34, minWordsPerRound: 10, pointBias: 0.3, pace: 0.85 },
  { nick: "Sam7898745", skill: 0.22, maxWordsPerRound: 32, minWordsPerRound: 8, pointBias: 0.25, pace: 0.9 },
  { nick: "Jagellon", skill: 0.2, maxWordsPerRound: 30, minWordsPerRound: 8, pointBias: 0.25, pace: 0.8 },
  { nick: "Domi", skill: 0.18, maxWordsPerRound: 28, minWordsPerRound: 8, pointBias: 0.2, pace: 0.75, sleep: { startHour: 2, durationHours: 3 } },
  { nick: "PoutinePower", timeZone: "America/Toronto", skill: 0.58, maxWordsPerRound: 84, minWordsPerRound: 22, pointBias: 0.55, pace: 1.05, sleep: { startHour: 1, durationHours: 8 } },
  { nick: "MontrealMaven", timeZone: "America/Toronto", skill: 0.46, maxWordsPerRound: 78, minWordsPerRound: 18, pointBias: 0.5, pace: 0.95, sleep: { startHour: 2, durationHours: 8 } },
  { nick: "LacStJean", timeZone: "America/Toronto", skill: 0.34, maxWordsPerRound: 66, minWordsPerRound: 14, pointBias: 0.42, pace: 0.9, sleep: { startHour: 3, durationHours: 8 } },
  { nick: "QuebecNord", timeZone: "America/Toronto", skill: 0.26, maxWordsPerRound: 56, minWordsPerRound: 12, pointBias: 0.35, pace: 0.82, sleep: { startHour: 3, durationHours: 9 } },
  { nick: "PapiRatatouille", skill: 0.78, maxWordsPerRound: 88, minWordsPerRound: 32, pointBias: 0.82, pace: 0.98, sleep: { startHour: 3, durationHours: 9 } },
  { nick: "MademoiselleP", skill: 0.72, maxWordsPerRound: 86, minWordsPerRound: 30, pointBias: 0.78, pace: 1.02, sleep: { startHour: 2, durationHours: 8 } },
  { nick: "BiscotteTurbo", skill: 0.68, maxWordsPerRound: 82, minWordsPerRound: 28, pointBias: 0.74, pace: 1.08, sleep: { startHour: 1, durationHours: 8 } },
  { nick: "LeChienSavant", skill: 0.64, maxWordsPerRound: 79, minWordsPerRound: 26, pointBias: 0.7, pace: 0.96, sleep: { startHour: 4, durationHours: 9 } },
  { nick: "GastonLaGaffe", skill: 0.6, maxWordsPerRound: 76, minWordsPerRound: 24, pointBias: 0.68, pace: 0.9, sleep: { startHour: 0, durationHours: 8 } },
  { nick: "MlleDiagonale", skill: 0.58, maxWordsPerRound: 74, minWordsPerRound: 24, pointBias: 0.62, pace: 1.05 },
  { nick: "TropDeCafé", skill: 0.56, maxWordsPerRound: 72, minWordsPerRound: 22, pointBias: 0.6, pace: 1.12, sleep: { startHour: 5, durationHours: 8 } },
  { nick: "PixelBaguette", skill: 0.54, maxWordsPerRound: 70, minWordsPerRound: 22, pointBias: 0.58, pace: 1.0 },
  { nick: "ClaviersFou", skill: 0.52, maxWordsPerRound: 68, minWordsPerRound: 20, pointBias: 0.56, pace: 1.1, sleep: { startHour: 2, durationHours: 8 } },
  { nick: "LaMoucheDuCoche", skill: 0.5, maxWordsPerRound: 66, minWordsPerRound: 20, pointBias: 0.54, pace: 0.88 },
  { nick: "TuilesEnFolies", skill: 0.48, maxWordsPerRound: 64, minWordsPerRound: 18, pointBias: 0.52, pace: 0.95, sleep: { startHour: 1, durationHours: 9 } },
  { nick: "BarbeAPapa", skill: 0.46, maxWordsPerRound: 62, minWordsPerRound: 18, pointBias: 0.5, pace: 1.02 },
  { nick: "ZesteDeLime", skill: 0.44, maxWordsPerRound: 60, minWordsPerRound: 17, pointBias: 0.48, pace: 0.92 },
  { nick: "MarcelDu12", skill: 0.42, maxWordsPerRound: 58, minWordsPerRound: 16, pointBias: 0.46, pace: 1.08, sleep: { startHour: 4, durationHours: 8 } },
  { nick: "CarotteRâpée", skill: 0.4, maxWordsPerRound: 56, minWordsPerRound: 15, pointBias: 0.44, pace: 0.9 },
  { nick: "KouignAmann", skill: 0.38, maxWordsPerRound: 54, minWordsPerRound: 14, pointBias: 0.42, pace: 0.98, sleep: { startHour: 2, durationHours: 9 } },
  { nick: "MadameMots", skill: 0.36, maxWordsPerRound: 52, minWordsPerRound: 14, pointBias: 0.4, pace: 1.04 },
  { nick: "CapitaineAccent", skill: 0.34, maxWordsPerRound: 50, minWordsPerRound: 13, pointBias: 0.38, pace: 0.86 },
  { nick: "DodoDansLeMétro", skill: 0.32, maxWordsPerRound: 48, minWordsPerRound: 12, pointBias: 0.36, pace: 0.82, sleep: { startHour: 2, durationHours: 10 } },
  { nick: "PommeTatin", skill: 0.3, maxWordsPerRound: 46, minWordsPerRound: 12, pointBias: 0.34, pace: 0.94 },
  { nick: "ChocolatineDebat", skill: 0.28, maxWordsPerRound: 44, minWordsPerRound: 11, pointBias: 0.32, pace: 1.06 },
  { nick: "SaucissonSec", skill: 0.26, maxWordsPerRound: 42, minWordsPerRound: 10, pointBias: 0.3, pace: 0.86, sleep: { startHour: 3, durationHours: 8 } },
  { nick: "PetitPoucet", skill: 0.24, maxWordsPerRound: 40, minWordsPerRound: 10, pointBias: 0.28, pace: 0.9 },
  { nick: "TourEiffel", skill: 0.22, maxWordsPerRound: 38, minWordsPerRound: 9, pointBias: 0.26, pace: 0.78 },
  { nick: "AubergineMagique", skill: 0.2, maxWordsPerRound: 36, minWordsPerRound: 9, pointBias: 0.24, pace: 0.74, sleep: { startHour: 1, durationHours: 8 } },
  { nick: "MotsMarmiton", skill: 0.19, maxWordsPerRound: 34, minWordsPerRound: 8, pointBias: 0.22, pace: 0.82 },
  { nick: "ZigzagZen", skill: 0.18, maxWordsPerRound: 33, minWordsPerRound: 8, pointBias: 0.22, pace: 0.9 },
  { nick: "Nougatine", skill: 0.17, maxWordsPerRound: 32, minWordsPerRound: 8, pointBias: 0.2, pace: 0.76, sleep: { startHour: 4, durationHours: 9 } },
  { nick: "CiseauPapierMot", skill: 0.16, maxWordsPerRound: 30, minWordsPerRound: 8, pointBias: 0.18, pace: 0.72 },
  { nick: "Torto", skill: 0.12, maxWordsPerRound: 18, minWordsPerRound: 5, pointBias: 0.18, pace: 0.7 },
  { nick: "LazyLlama", skill: 0.1, maxWordsPerRound: 16, minWordsPerRound: 4, pointBias: 0.16, pace: 0.68 },
  { nick: "Marmotte", skill: 0.08, maxWordsPerRound: 14, minWordsPerRound: 4, pointBias: 0.14, pace: 0.65 },
  { nick: "TataPousse", skill: 0.07, maxWordsPerRound: 12, minWordsPerRound: 3, pointBias: 0.12, pace: 0.62 },
  { nick: "Tremblote", skill: 0.06, maxWordsPerRound: 11, minWordsPerRound: 3, pointBias: 0.1, pace: 0.6 },
];

export const BOT_ROSTER_5X5 = [
  { nick: "connard32", skill: 0.86, maxWordsPerRound: 91, minWordsPerRound: 42, pointBias: 0.88, pace: 0.95, sleep: { startHour: 3, durationHours: 2 } },
  { nick: "OrgaMots", skill: 0.9, maxWordsPerRound: 98, minWordsPerRound: 46, pointBias: 0.9, pace: 1.05, sleep: { startHour: 4, durationHours: 3 } },
  { nick: "Nebula", skill: 0.78, maxWordsPerRound: 90, minWordsPerRound: 34, pointBias: 0.82, pace: 1.05 },
  { nick: "Harmonix", skill: 0.84, maxWordsPerRound: 92, minWordsPerRound: 38, pointBias: 0.86, pace: 1.02, sleep: { startHour: 2, durationHours: 3 } },
  { nick: "Valyr", skill: 0.7, maxWordsPerRound: 88, minWordsPerRound: 30, pointBias: 0.76, pace: 1.0 },
  { nick: "Opale", skill: 0.62, maxWordsPerRound: 85, minWordsPerRound: 28, pointBias: 0.7, pace: 0.92 },
  { nick: "Zébulon48", skill: 0.56, maxWordsPerRound: 74, minWordsPerRound: 24, pointBias: 0.6, pace: 1.12 },
  { nick: "Ysatis", skill: 0.5, maxWordsPerRound: 67, minWordsPerRound: 22, pointBias: 0.52, pace: 0.88, sleep: { startHour: 2, durationHours: 2 } },
  { nick: "Ganymède", skill: 0.46, maxWordsPerRound: 66, minWordsPerRound: 20, pointBias: 0.48, pace: 0.9 },
  { nick: "Blaster", skill: 0.42, maxWordsPerRound: 60, minWordsPerRound: 18, pointBias: 0.44, pace: 1.18 },
  { nick: "Rivo", skill: 0.36, maxWordsPerRound: 54, minWordsPerRound: 16, pointBias: 0.38, pace: 1.0 },
  { nick: "Jun", skill: 0.32, maxWordsPerRound: 48, minWordsPerRound: 15, pointBias: 0.36, pace: 0.96 },
  { nick: "Pongo", skill: 0.28, maxWordsPerRound: 44, minWordsPerRound: 13, pointBias: 0.32, pace: 0.9 },
  { nick: "Mira", skill: 0.25, maxWordsPerRound: 40, minWordsPerRound: 12, pointBias: 0.3, pace: 0.85 },
  { nick: "Bougli0ne", skill: 0.22, maxWordsPerRound: 36, minWordsPerRound: 10, pointBias: 0.26, pace: 0.82 },
  { nick: "Siam", skill: 0.2, maxWordsPerRound: 32, minWordsPerRound: 9, pointBias: 0.24, pace: 0.78 },
  { nick: "Tango12", skill: 0.18, maxWordsPerRound: 30, minWordsPerRound: 8, pointBias: 0.2, pace: 0.74 },
  { nick: "Loxodrome", skill: 0.16, maxWordsPerRound: 28, minWordsPerRound: 8, pointBias: 0.18, pace: 0.72 },
  { nick: "MapleRunner", timeZone: "America/Toronto", skill: 0.72, maxWordsPerRound: 130, minWordsPerRound: 28, pointBias: 0.78, pace: 1.02, sleep: { startHour: 1, durationHours: 8 } },
  { nick: "Outremont", timeZone: "America/Toronto", skill: 0.56, maxWordsPerRound: 120, minWordsPerRound: 22, pointBias: 0.65, pace: 0.96, sleep: { startHour: 2, durationHours: 8 } },
  { nick: "SaintLaurent", timeZone: "America/Toronto", skill: 0.44, maxWordsPerRound: 110, minWordsPerRound: 18, pointBias: 0.55, pace: 0.9, sleep: { startHour: 3, durationHours: 8 } },
  { nick: "Mollasson", skill: 0.14, maxWordsPerRound: 22, minWordsPerRound: 6, pointBias: 0.2, pace: 0.7 },
  { nick: "Slowpoke", skill: 0.12, maxWordsPerRound: 20, minWordsPerRound: 5, pointBias: 0.18, pace: 0.68 },
  { nick: "Gaufrette", skill: 0.1, maxWordsPerRound: 18, minWordsPerRound: 4, pointBias: 0.16, pace: 0.66 },
  { nick: "Patapouf", skill: 0.08, maxWordsPerRound: 16, minWordsPerRound: 4, pointBias: 0.14, pace: 0.64 },
  { nick: "Tranquillou", skill: 0.06, maxWordsPerRound: 14, minWordsPerRound: 3, pointBias: 0.12, pace: 0.62 },
];

const BOT_ROSTERS_BY_SIZE = {
  5: BOT_ROSTER_5X5,
  4: BOT_ROSTER_4X4,
};

const ELITE_BOT_NICKS = new Set(["Proutosaurus Rex", "connard32", "ProtoPanache", "OrgaMots", "Harmonix", "QuasarMots"]);
const BOT_NERF = {
  skill: 0.6,
  maxWords: 0.55,
  minWords: 0.5,
  pointBias: 0.6,
  pace: 0.85,
  desired: 0.55,
};

const BOT_STREAK_LIMIT = 999;
const BOT_REST_MIN_MS = 35 * 60 * 1000;
const BOT_REST_MAX_MS = 70 * 60 * 1000;
const BOT_SESSION_MIN_MS = 60 * 60 * 1000;
const BOT_SESSION_MAX_MS = 3 * 60 * 60 * 1000;

function clamp01(value, fallback = 0.5) {
  const safe = Number.isFinite(value) ? value : fallback;
  return Math.min(1, Math.max(0, safe));
}

function clampInt(value, min, max) {
  const safe = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, safe));
}

function hashString(input) {
  const str = String(input ?? "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
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

function getHourInTimeZone(date, timeZone) {
  try {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timeZone || "Europe/Paris",
    });
    const hour = Number(dtf.format(date));
    if (Number.isFinite(hour)) return hour;
  } catch (_) {}
  return date.getHours();
}

function getBotSleepConfig(bot) {
  const cfg = bot?.sleep || null;
  const seed = hashString(bot?.nick || "bot");
  const startHour = Number.isFinite(cfg?.startHour)
    ? clampInt(cfg.startHour, 0, 23)
    : seed % 5; // 0..4
  const durationHours = Number.isFinite(cfg?.durationHours)
    ? Math.max(8, Math.round(cfg.durationHours))
    : 8 + (seed % 3); // 8..10
  return { startHour, durationHours };
}

function getParisHour(date) {
  return getHourInTimeZone(date, "Europe/Paris");
}

function getMinuteInTimeZone(date, timeZone) {
  try {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      minute: "numeric",
      timeZone: timeZone || "Europe/Paris",
    });
    const minute = Number(dtf.format(date));
    if (Number.isFinite(minute)) return minute;
  } catch (_) {}
  return date.getMinutes();
}

function getParisTimeSlotKey(date, slotMinutes = BOT_ROTATION_MINUTES) {
  const hour = getParisHour(date);
  const minute = getMinuteInTimeZone(date, "Europe/Paris");
  const slot = Math.floor(Math.max(0, minute) / slotMinutes);
  return `${getParisDateKey(date)}-${hour}-s${slot}`;
}

function getParisDateKey(date) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Europe/Paris",
    }).format(date);
  } catch (_) {
    return date.toISOString().slice(0, 10);
  }
}

function desiredTotalPlayersForRoom(room, date = new Date()) {
  const hour = getParisHour(date);
  const day = (() => {
    try {
      const dtf = new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        timeZone: "Europe/Paris",
      });
      const label = dtf.format(date);
      const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return map[label] ?? date.getDay();
    } catch (_) {
      return date.getDay();
    }
  })();
  const weekend = day === 0 || day === 6;

  // Courbe simple: creux nuit, dÈj, et gros pic 18-23 (heure franÁaise).
  let base = 12;
  if (hour < 6) base = 4;
  else if (hour < 9) base = 9;
  else if (hour < 12) base = weekend ? 12 : 11;
  else if (hour < 14) base = weekend ? 18 : 17;
  else if (hour < 18) base = weekend ? 16 : 14;
  else if (hour < 23) base = weekend ? 22 : 24;
  else if (hour < 24) base = weekend ? 16 : 14;
  else base = 10;
  if (hour === 23) base = weekend ? 18 : 16;
  if (hour === 0) base = weekend ? 20 : 18;

  const size = room?.config?.gridSize;
  const popularity = size === 5 ? 0.75 : 1;
  const seeded = mulberry32(hashString(`${room?.id || "room"}-${day}-${hour}`));
  const jitter = Math.round((seeded() - 0.5) * 4); // -2..+2
  return clampInt(base * popularity + jitter, 1, 24);
}

export function isBotSleeping(bot, date = new Date()) {
  const cfg = getBotSleepConfig(bot);
  const start = Number.isFinite(cfg.startHour) ? cfg.startHour : 0;
  const duration = Number.isFinite(cfg.durationHours) ? cfg.durationHours : 0;
  if (duration <= 0) return false;

  const hour = getHourInTimeZone(date, bot?.timeZone || "Europe/Paris");
  const end = (start + duration) % 24;

  if (start < end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
}

function shouldBotRestNow(bot, date = new Date()) {
  const slotKey = getParisTimeSlotKey(date, BOT_ROTATION_MINUTES);
  const seeded = mulberry32(hashString(`${bot?.nick || "bot"}-${slotKey}-rest`));
  const base = 0.06;
  const skill = clamp01(bot?.skill ?? 0.4);
  const eliteBoost = ELITE_BOT_NICKS.has(bot?.nick) ? 0.08 : 0;
  const chance = Math.min(0.28, base + skill * 0.08 + eliteBoost);
  return seeded() < chance;
}

function rosterForRoom(room) {
  const size = room?.config?.gridSize;
  return BOT_ROSTERS_BY_SIZE[size] || BOT_ROSTER_4X4;
}

function botStreakKey(roomId, nick) {
  return `${roomId || "room"}::${nick || "bot"}`;
}

function botSessionKey(roomId, nick) {
  return `${roomId || "room"}::${nick || "bot"}`;
}

function tuneBotProfile(bot) {
  if (!bot || ELITE_BOT_NICKS.has(bot.nick)) {
    return { ...bot, difficultyScale: 1 };
  }
  const scaledSkill = Math.max(0.05, clamp01((bot?.skill ?? 0.5) * BOT_NERF.skill));
  return {
    ...bot,
    skill: scaledSkill,
    maxWordsPerRound: Math.max(8, Math.round((bot?.maxWordsPerRound ?? 0) * BOT_NERF.maxWords)),
    minWordsPerRound: Math.max(4, Math.round((bot?.minWordsPerRound ?? 0) * BOT_NERF.minWords)),
    pointBias: Math.min(0.55, Math.max(0.1, (bot?.pointBias ?? 0.45) * BOT_NERF.pointBias)),
    pace: Math.max(0.55, (bot?.pace ?? 1) * BOT_NERF.pace),
    difficultyScale: BOT_NERF.desired,
  };
}

export function pickWordsForBot(solutions, botProfile, opts = {}) {
  const rand = typeof opts.rand === "function" ? opts.rand : Math.random;
  const gridSize = Number.isFinite(opts.gridSize) ? opts.gridSize : 4;
  const roundType = opts.roundType || null;
  const isSpeedRound = roundType === "speed";
  const difficultyScale = Number.isFinite(botProfile?.difficultyScale)
    ? Math.max(0.2, botProfile.difficultyScale)
    : 1;

  const pool = Array.from(
    solutions instanceof Map ? solutions.entries() : solutions || []
  ).map(([word, data]) => ({ word, pts: data?.pts || 0 }));

  if (!pool.length) return [];

  if (isSpeedRound) {
    pool.sort((a, b) => a.word.length - b.word.length || b.pts - a.pts);
  } else {
    pool.sort((a, b) => b.pts - a.pts || b.word.length - a.word.length);
  }

  const skill = clamp01(botProfile?.skill, 0.5);
  const minWords = Math.max(4, botProfile?.minWordsPerRound || 0);
  const profileMax = botProfile?.maxWordsPerRound || 0;
  const baseMax =
    gridSize === 5
      ? Math.round(110 + skill * 90)
      : Math.round(70 + skill * 60);
  let maxWords = Math.min(MAX_WORDS_PER_BOT_PER_ROUND, Math.max(profileMax, baseMax));
  if (Number.isFinite(opts.maxWordsCap)) {
    maxWords = Math.min(maxWords, Math.max(0, Math.round(opts.maxWordsCap)));
  }

  const poolSize = pool.length;
  const baseDesired =
    Math.sqrt(poolSize) * (isSpeedRound ? (1.9 + skill * 3.0) : (2.3 + skill * 4.4));
  const sizeBoost = gridSize === 5 ? (isSpeedRound ? 12 : 26) * skill : 0;
  let desired = Math.min(
    poolSize,
    maxWords,
    Math.max(minWords, Math.round(baseDesired + sizeBoost))
  );
  if (difficultyScale !== 1) {
    desired = Math.max(minWords, Math.round(desired * difficultyScale));
  }

  // Evite les "100%" sur les petites grilles: on borne le % de mots trouvÇ¸s.
  const maxFractionBase = isSpeedRound ? 0.28 + skill * 0.32 : 0.18 + skill * 0.28;
  const maxFraction =
    difficultyScale === 1 ? maxFractionBase : Math.max(0.08, maxFractionBase * difficultyScale);
  const fractionCap = Math.max(minWords, Math.floor(poolSize * maxFraction));
  desired = Math.min(desired, fractionCap);

  // VariabilitÇ¸ naturelle (sinon tous les bots plafonnent au mÇ¦me nombre).
  desired = clampInt(
    Math.round(desired * (0.78 + rand() * 0.44)),
    minWords,
    maxWords
  );

  if (desired <= 0) return [];

  const biasBase = Math.min(0.85, Math.max(0.12, botProfile?.pointBias ?? 0.45));
  const bias = isSpeedRound ? Math.min(0.55, biasBase) : biasBase;
  const topSliceSize = Math.max(
    desired,
    Math.min(pool.length, Math.floor(pool.length * (0.22 + skill * 0.22)))
  );
  const maxTopHits = Math.max(1, Math.round(desired * (isSpeedRound ? 0.12 : 0.32)));

  const topPool = pool.slice(0, topSliceSize);
  const remainder = pool.slice(topSliceSize);
  const chosen = [];
  let topHits = 0;

  while (chosen.length < desired && (topPool.length || remainder.length)) {
    const pickTop = (rand() < bias && topHits < maxTopHits) || !remainder.length;
    const source = pickTop ? topPool : remainder;
    if (!source.length) continue;
    const idx = Math.floor(rand() * source.length);
    const candidate = source.splice(idx, 1)[0];
    // petite probabilité de passer son tour pour éviter le spam
    if (rand() < (isSpeedRound ? 0.05 : 0.08)) continue;
    if (pickTop) topHits++;
    chosen.push(candidate);
  }

  return chosen.map((entry) => entry.word);
}

class BotManager {
  constructor({
    rooms,
    dictionary,
    ensurePlayerInRound,
    submitWordForNick,
    emitPlayers,
    emitMedals,
    broadcastProvisionalRanking,
  }) {
    this.rooms = rooms;
    this.dictionary = dictionary;
    this.ensurePlayerInRound = ensurePlayerInRound;
    this.submitWordForNick = submitWordForNick;
    this.emitPlayers = emitPlayers;
    this.emitMedals = emitMedals;
    this.broadcastProvisionalRanking = broadcastProvisionalRanking;
    this.roundTimers = new Map();
    this.roomBotSelection = new Map();
    this.roomBotHourKey = new Map();
    this.botRoundStreak = new Map();
    this.botRestUntil = new Map();
    this.botSessionUntil = new Map();
    this.presenceTimers = new Map();
    this.presenceInterval = setInterval(() => this.refreshPresence(), 5 * 60 * 1000);
    this.warnedNoDictionary = false;

    this.refreshPresence();
  }

  refreshPresence() {
    for (const room of this.rooms.values()) {
      this.refreshPresenceForRoom(room);
    }
  }

  refreshPresenceForRoom(room) {
    const now = new Date();
    const roster = rosterForRoom(room);
    const allowedKeys = new Set(roster.map((bot) => this.botKey(bot)));
    const nowMs = Date.now();

    for (const bot of roster) {
      const key = this.botKey(bot);
      if (!room.players.has(key)) continue;
      const sessionKey = botSessionKey(room.id, bot.nick);
      const sessionUntil = this.botSessionUntil.get(sessionKey) || 0;
      if (sessionUntil && nowMs >= sessionUntil) {
        const restMs =
          BOT_REST_MIN_MS + Math.floor(Math.random() * (BOT_REST_MAX_MS - BOT_REST_MIN_MS));
        this.botRestUntil.set(botStreakKey(room.id, bot.nick), nowMs + restMs);
        this.botSessionUntil.delete(sessionKey);
        this.removeBotFromRoom(room, bot);
      }
    }

    // Pendant une manche, on garde les bots stables (pas de pop-in/out en plein jeu).
    const isRunning = room?.currentRound?.status === "running";
    if (isRunning) return;

    // Roulement discret: on change un peu la prÈsence d'une heure ‡ l'autre.
    const slotKey = getParisTimeSlotKey(now, BOT_ROTATION_MINUTES);
    const prevHourKey = this.roomBotHourKey.get(room.id);
    if (prevHourKey !== slotKey) {
      this.roomBotHourKey.set(room.id, slotKey);
      this.roomBotSelection.delete(room.id);
    }

    const awakeBots = roster.filter((bot) => {
      if (isBotSleeping(bot, now)) return false;
      if (shouldBotRestNow(bot, now)) return false;
      const restUntil = this.botRestUntil.get(botStreakKey(room.id, bot.nick)) || 0;
      if (restUntil && Date.now() < restUntil) return false;
      return true;
    });
    const awakeKeys = new Set(awakeBots.map((bot) => this.botKey(bot)));

    const humanCount = Array.from(room.players.values()).filter(
      (p) => !p?.token?.startsWith("bot-")
    ).length;
    const desiredTotal = desiredTotalPlayersForRoom(room, now);
    const desiredBots = Math.max(
      0,
      Math.min(awakeBots.length, desiredTotal - humanCount)
    );

    let selection = this.roomBotSelection.get(room.id);
    if (!selection) {
      selection = new Set(
        Array.from(room.players.entries())
          .filter(
            ([token, player]) =>
              player?.token?.startsWith("bot-") && allowedKeys.has(player.token)
          )
          .map(([token]) => token)
      );
    }
    if (selection.size === 0 && desiredBots > 0) {
      const seeded = mulberry32(hashString(`boot-${room.id}-${getParisHour(now)}`));
      const candidates = awakeBots
        .map((bot) => ({ bot, key: this.botKey(bot) }))
        .filter(({ key }) => !selection.has(key));
      candidates.sort(() => seeded() - 0.5);
      const bootstrapCount = Math.min(desiredBots, 3, candidates.length);
      for (let i = 0; i < bootstrapCount; i++) {
        const { bot, key } = candidates[i];
        selection.add(key);
        if (!room.players.has(key)) this.addBotToRoom(room, bot);
      }
    }

    // Supprime les bots qui ne devraient plus Ítre lý (hors roster ou endormis)
    for (const key of Array.from(selection)) {
      if (!allowedKeys.has(key) || !awakeKeys.has(key)) {
        selection.delete(key);
        const player = room.players.get(key);
        if (player?.nick) this.removeBotFromRoom(room, { nick: player.nick });
      }
    }

    // Ajuste au nombre souhaitÈ (par heure) en essayant de garder un roulement.
    if (selection.size > desiredBots) {
      const seeded = mulberry32(hashString(`down-${room.id}-${getParisHour(now)}`));
      const ordered = Array.from(selection).sort(() => seeded() - 0.5);
      while (selection.size > desiredBots && ordered.length) {
        const key = ordered.pop();
        selection.delete(key);
        const player = room.players.get(key);
        if (player?.nick) {
          this.schedulePresenceChange(room, { nick: player.nick }, "remove", 800, 6000);
        }
      }
    } else if (selection.size < desiredBots) {
      const seeded = mulberry32(hashString(`up-${room.id}-${getParisHour(now)}`));
      const candidates = awakeBots
        .map((bot) => ({ bot, key: this.botKey(bot) }))
        .filter(({ key }) => !selection.has(key));
      candidates.sort(() => seeded() - 0.5);
      while (selection.size < desiredBots && candidates.length) {
        const { bot, key } = candidates.pop();
        selection.add(key);
        if (!room.players.has(key)) {
          this.schedulePresenceChange(room, bot, "add", 800, 6000);
        }
      }
    }

    this.roomBotSelection.set(room.id, selection);

    // Nettoie les bots "fantÙmes" qui ne sont plus dans le roster
    for (const [token, player] of room.players.entries()) {
      if (player?.token?.startsWith("bot-") && !allowedKeys.has(player.token)) {
        this.removeBotFromRoom(room, { nick: player.nick });
      }
    }
  }

  addBotToRoom(room, bot) {
    const key = this.botKey(bot);
    room.players.set(key, { nick: bot.nick, token: key });
    const sessionKey = botSessionKey(room.id, bot.nick);
    if (!this.botSessionUntil.has(sessionKey)) {
      const sessionMs =
        BOT_SESSION_MIN_MS + Math.floor(Math.random() * (BOT_SESSION_MAX_MS - BOT_SESSION_MIN_MS));
      this.botSessionUntil.set(sessionKey, Date.now() + sessionMs);
    }
    if (room.currentRound) {
      this.ensurePlayerInRound(room, bot.nick);
    }
    this.emitPlayers(room);
    this.broadcastProvisionalRanking(room);
  }

  schedulePresenceChange(room, bot, action, minDelayMs, maxDelayMs) {
    if (!room || !bot || !bot.nick) return;
    const key = `${room.id || "room"}:${action}:${bot.nick}`;
    if (this.presenceTimers.has(key)) return;

    const min = Number.isFinite(minDelayMs) ? minDelayMs : 800;
    const max = Number.isFinite(maxDelayMs) ? maxDelayMs : 6000;
    const delay = Math.max(0, Math.floor(min + Math.random() * Math.max(0, max - min)));

    const timer = setTimeout(() => {
      this.presenceTimers.delete(key);
      if (room?.currentRound?.status === "running") {
        const retryDelay = 1500 + Math.random() * 2500;
        const retry = setTimeout(() => {
          this.presenceTimers.delete(key);
          this.schedulePresenceChange(room, bot, action, minDelayMs, maxDelayMs);
        }, retryDelay);
        this.presenceTimers.set(key, retry);
        return;
      }
      if (action === "add") {
        const botKey = this.botKey(bot);
        if (!room.players.has(botKey)) this.addBotToRoom(room, bot);
      } else if (action === "remove") {
        if (room.players.has(this.botKey(bot))) this.removeBotFromRoom(room, bot);
      }
    }, delay);

    this.presenceTimers.set(key, timer);
  }

  removeBotFromRoom(room, bot) {
    const key = this.botKey(bot);
    const hadPlayer = room.players.delete(key);
    if (!hadPlayer) return;

    if (room.currentRound) {
      const roundSubs = room.submissions.get(room.currentRound.id);
      roundSubs?.delete(bot.nick);
    }

    // nettoie leurs medailles / annonces en cours
    room.bestScoreRecord?.players?.delete(bot.nick);
    room.bestLengthRecord?.players?.delete(bot.nick);
    room.longestPossibleRecord?.players?.delete(bot.nick);
    room.bestPossibleScoreRecord?.players?.delete(bot.nick);

    const streakKey = botStreakKey(room.id, bot.nick);
    this.botRoundStreak.delete(streakKey);
    this.botSessionUntil.delete(botSessionKey(room.id, bot.nick));

    room.medalExpiry.set(bot.nick, Date.now() - 1);
    this.emitPlayers(room);
    this.emitMedals?.(room);
    this.broadcastProvisionalRanking(room);
  }

  onRoundStart(room) {
    this.clearTimers(room.id);
    if (!this.dictionary) {
      if (!this.warnedNoDictionary) {
        console.warn("[bots] Aucun dictionnaire, les bots restent passifs");
        this.warnedNoDictionary = true;
      }
      return;
    }

    const roster = rosterForRoom(room);
    const nowDate = new Date();
    const activeBots = roster.filter(
      (bot) => room.players.has(this.botKey(bot)) && !isBotSleeping(bot, nowDate)
    );
    if (!activeBots.length) return;
    const tunedBots = activeBots.map(tuneBotProfile);
    const round = room.currentRound;
    if (!round) return;

    const solutions = solveGrid(round.grid, this.dictionary);
    const now = Date.now();
    const timeBudget = Math.max(1500, round.endsAt - now - 500);
    const totalTargetSubmissions = room?.config?.gridSize === 5 ? 1050 : 900;

    // Cap rÇ¸parti par bot (pondÇ¸rÇ¸ par skill), pour Ç¸viter le "tous 40 mots" en speed.
    const weights = tunedBots.map((bot) => {
      const skill = clamp01(bot?.skill, 0.5);
      const pace = Number.isFinite(bot?.pace) ? Math.max(0.6, bot.pace) : 1;
      return Math.max(0.25, skill * (0.9 + 0.25 * pace));
    });
    const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
    const roomSeeded = mulberry32(hashString(`${round.id}-${room.id}-caps`));
    const rawCaps = tunedBots.map((_, idx) => {
      const base = (totalTargetSubmissions * weights[idx]) / totalWeight;
      const jitter = (roomSeeded() - 0.5) * 10; // +/- 5 mots
      return Math.max(8, Math.round(base + jitter));
    });
    const sumCaps = rawCaps.reduce((s, n) => s + n, 0) || 1;
    const scale = Math.min(1, totalTargetSubmissions / sumCaps);
    const caps = rawCaps.map((n) => Math.max(8, Math.floor(n * scale)));

    for (const bot of tunedBots) {
      this.ensurePlayerInRound(room, bot.nick);
      const seed = hashString(`${round.id}-${bot.nick}`);
      const rand = mulberry32(seed);
      const idx = tunedBots.findIndex((b) => b.nick === bot.nick);
      const maxWordsCap = caps[Math.max(0, idx)] ?? Math.max(18, Math.floor(totalTargetSubmissions / tunedBots.length));
      const words = pickWordsForBot(solutions, bot, {
        rand,
        gridSize: room?.config?.gridSize,
        roundType: round?.special?.type || null,
        maxWordsCap,
      });
      this.scheduleBotWords(room, bot, words, timeBudget);
    }
  }

  onRoundEnd(room) {
    this.clearTimers(room.id);
    const now = Date.now();
    for (const player of room.players.values()) {
      if (!player?.token?.startsWith("bot-")) continue;
      const key = botStreakKey(room.id, player.nick);
      const streak = (this.botRoundStreak.get(key) || 0) + 1;
      if (streak >= BOT_STREAK_LIMIT) {
        const restMs =
          BOT_REST_MIN_MS + Math.floor(Math.random() * (BOT_REST_MAX_MS - BOT_REST_MIN_MS));
        this.botRestUntil.set(key, now + restMs);
        this.botRoundStreak.set(key, 0);
        this.schedulePresenceChange(room, { nick: player.nick }, "remove", 1200, 9000);
      } else {
        this.botRoundStreak.set(key, streak);
      }
    }
  }

  scheduleBotWords(room, bot, words, timeBudget) {
    if (!words.length || !room.currentRound) return;
    // Ralentir le d‚marrage : on joue d'abord quelques mots courts
    const round = room.currentRound;
    const seed = hashString(`${round.id}-${bot.nick}-schedule`);
    const rand = mulberry32(seed);

    // DÈmarrage naturel + pas de rafale en toute fin de manche.
    const warmupDelay = 1400 + rand() * 1600;
    const endBuffer = 2200;
    const available = Math.max(0, timeBudget - warmupDelay - endBuffer);
    const pace = Math.max(0.55, bot.pace || 1);

    const byLength = [...words].sort((a, b) => a.length - b.length);
    const warmupCount = Math.max(2, Math.min(10, Math.floor(byLength.length * 0.22)));
    const warmup = byLength.slice(0, warmupCount);
    const rest = byLength.slice(warmupCount).sort(() => rand() - 0.5);
    const pacedWords = [...warmup, ...rest];

    const warmupWindow = Math.min(12000, available * 0.25);
    const restWindow = Math.max(0, available - warmupWindow);
    const minSpacing = 260 / pace;

    const scheduled = [];
    for (let i = 0; i < pacedWords.length; i++) {
      const inWarmup = i < warmupCount;
      const idx = inWarmup ? i : i - warmupCount;
      const count = inWarmup ? warmupCount : pacedWords.length - warmupCount;
      const windowSize = inWarmup ? warmupWindow : restWindow;
      const windowOffset = inWarmup ? 0 : warmupWindow;
      const frac = count <= 1 ? 0 : idx / (count - 1);
      const curved = Math.pow(frac, inWarmup ? 0.85 : 0.75);
      const jitter = (rand() - 0.5) * Math.max(120, (windowSize / Math.max(count, 1)) * 0.6);
      scheduled.push({ word: pacedWords[i], t: warmupDelay + windowOffset + curved * windowSize + jitter });
    }

    scheduled.sort((a, b) => a.t - b.t);
    let lastT = warmupDelay;
    for (const item of scheduled) {
      const t = Math.max(item.t, lastT + minSpacing);
      lastT = t;
      const timer = setTimeout(() => this.playWord(room, bot, item.word), Math.max(0, t));
      this.registerTimer(room.id, timer);
    }
  }

  playWord(room, bot, word) {
    const round = room.currentRound;
    if (!round || Date.now() >= round.endsAt) return;

    this.ensurePlayerInRound(room, bot.nick);
    const res = this.submitWordForNick(room, {
      roundId: round.id,
      word,
      nick: bot.nick,
    });

    if (!res?.ok && res?.error !== "already_played") {
      console.debug(`[bots] ${bot.nick} -> ${res?.error || "reject"}`);
    }
  }

  clearTimers(roomId) {
    const timers = this.roundTimers.get(roomId);
    if (timers) {
      timers.forEach((t) => clearTimeout(t));
    }
    this.roundTimers.set(roomId, []);
  }

  registerTimer(roomId, timer) {
    if (!this.roundTimers.has(roomId)) {
      this.roundTimers.set(roomId, []);
    }
    this.roundTimers.get(roomId).push(timer);
  }

  botKey(bot) {
    return `bot-${bot.nick}`;
  }
}

export function createBotManager(deps) {
  return new BotManager(deps);
}

