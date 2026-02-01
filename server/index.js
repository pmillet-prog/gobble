// server/index.js
import path from "path";
import { fileURLToPath } from "url";

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";

import {
  generateGrid,
  scoreWordOnGrid,
  scoreWordOnGridWithPath,
  solveGrid,
  findBestPathForWord,
  normalizeWord,
} from "../shared/gameLogic.js";
import { createBotManager, BOT_ROSTER_4X4, BOT_ROSTER_5X5 } from "./bots/botManager.js";
import { createComputePool } from "./compute/computePool.js";
import { getMetrics } from "./observability/metrics.js";
import {
  getDefinition,
  clearDefinitionCache,
  peekDefinitionCache,
} from "./definitions/definitionService.js";
import { createAsyncFileLogger } from "./logging/asyncFileLogger.js";
import {
  getWeekStartTs,
  getWeeklyStats,
  recordBestRoundScore,
  recordBestTargetTime,
  recordBestWord,
  recordLongestWord,
  recordMedal,
  recordMostGobbles,
  recordMostWordsInGame,
  recordTotalScore,
  recordVocabCount,
} from "./stats/weeklyStatsService.js";
import {
  initVocabularyService,
  recordVocabularyBatch,
  getVocabularyCount,
  getVocabularyLeaderboard,
  upsertVocabularyProfile,
  getKnownVocabWords,
} from "./stats/vocabularyService.js";
import {
  initTrophyService,
  updateTrophiesForTournament,
  getTrophyStatus,
  getBotRatingFromStrength,
  K_BASE as TROPHY_K_BASE,
} from "./stats/trophyService.js";
import {
  getDailyMedalsForRoom,
  persistDailyMedalsForRoom,
} from "./stats/dailyMedalsService.js";
import {
  addDaysToDateId,
  ensureDaily,
  getDailyBoard,
  getDailyHistory,
  getDailyStatus,
  getParisDateId,
  loadDailyChampion,
  refreshDailyChampionIfNeeded,
  startDailyAttempt,
  submitDailyResult,
} from "./daily/dailyService.js";

const computePool = createComputePool();
void initVocabularyService().catch((err) =>
  console.warn("Vocabulary service init failed", err)
);
void initTrophyService().catch((err) =>
  console.warn("Trophy service init failed", err)
);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.set("trust proxy", true);

const BOT_NICK_SET = new Set(
  [...(BOT_ROSTER_4X4 || []), ...(BOT_ROSTER_5X5 || [])]
    .map((bot) => bot?.nick)
    .filter(Boolean)
);
const BOT_STRENGTH_BY_NICK = new Map(
  [...(BOT_ROSTER_4X4 || []), ...(BOT_ROSTER_5X5 || [])]
    .filter((bot) => bot?.nick)
    .map((bot) => [bot.nick, bot.skill ?? 0])
);

const SOLVE_CACHE_MAX = 8;
const solveCache = new Map();
const ANNOUNCEMENT_BATCH_MS = 220;
const ANNOUNCEMENT_BATCH_MAX = 12;

function sanitizeDefineWord(raw) {
  const rawWord = String(raw || "").trim();
  if (!rawWord) return { word: null, error: "missing_word" };
  if (rawWord.length > 40) return { word: null, error: "bad_word" };
  if (!/^[\p{L}'-]+$/u.test(rawWord)) return { word: null, error: "bad_word" };
  return { word: rawWord, error: null };
}

function buildSolveCacheKey(grid, special) {
  if (!Array.isArray(grid) || grid.length === 0) return "";
  const cells = [];
  for (const cell of grid) {
    const letter = cell?.letter ? String(cell.letter) : "";
    const bonus = cell?.bonus ? String(cell.bonus) : "";
    cells.push(bonus ? `${letter}:${bonus}` : letter);
  }
  if (!special) return cells.join("|");
  const bonusLetter = special?.bonusLetter ? normalizeLetterKey(special.bonusLetter) : "";
  const bonusLetterScore =
    Number.isFinite(special?.bonusLetterScore) ? special.bonusLetterScore : "";
  const disableBonuses = special?.disableBonuses ? 1 : 0;
  return `${cells.join("|")}|${bonusLetter}|${bonusLetterScore}|${disableBonuses}`;
}

function solveGridCached(grid, dictionary, special = null) {
  if (!dictionary) return new Map();
  const key = buildSolveCacheKey(grid, special);
  if (!key) return solveGrid(grid, dictionary, special);
  const hit = solveCache.get(key);
  if (hit) {
    solveCache.delete(key);
    solveCache.set(key, hit);
    return hit;
  }
  const solved = solveGrid(grid, dictionary, special);
  solveCache.set(key, solved);
  if (solveCache.size > SOLVE_CACHE_MAX) {
    const oldest = solveCache.keys().next().value;
    if (oldest) solveCache.delete(oldest);
  }
  return solved;
}

app.use((req, res, next) => {
  const host = String(req.headers.host || "").toLowerCase();
  const isGobbleHost = host === "gobble.fr" || host === "www.gobble.fr";
  const isLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("::1");
  if (!isGobbleHost || isLocal) return next();

  const needsHttps = !req.secure;
  const needsNonWww = host.startsWith("www.");
  if (!needsHttps && !needsNonWww) return next();

  const target = `https://gobble.fr${req.originalUrl || "/"}`;
  return res.redirect(301, target);
});

app.get("/api/define", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "public, max-age=300");
  const rawWord = req.query?.word ?? req.query?.term;
  const { word, error } = sanitizeDefineWord(rawWord);
  if (!word) {
    return res.json({
      ok: false,
      word: String(rawWord || "").trim(),
      error: error || "bad_word",
    });
  }

  const skipCache = String(req.query?.nocache || "") === "1";
  if (skipCache) {
    clearDefinitionCache(word);
  }
  const payload = await getDefinition(word, { timeoutMs: 2500, skipCache });
  return res.json(payload);
});

app.get("/api/stats/weekly", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "public, max-age=60");
  const rawTop = Number(req.query?.topN);
  const topN =
    Number.isFinite(rawTop) && rawTop > 0 ? Math.min(200, Math.max(1, Math.round(rawTop))) : undefined;
  try {
    const payload = getWeeklyStats(topN);
    const boards = payload?.boards || {};
    const nickByPlayerKey = new Map();
    for (const value of Object.values(boards)) {
      if (!Array.isArray(value)) continue;
      for (const entry of value) {
        const key = typeof entry?.playerKey === "string" ? entry.playerKey : "";
        const nick = typeof entry?.nick === "string" ? entry.nick.trim() : "";
        if (key && nick && !nickByPlayerKey.has(key)) {
          nickByPlayerKey.set(key, nick);
        }
      }
    }
    const vocabularyFallback = await getVocabularyLeaderboard(payload?.topN || topN || 50);
    const vocabByKey = new Map();
    const vocabFromWeekly = Array.isArray(boards?.vocab) ? boards.vocab : [];
    for (const entry of vocabFromWeekly) {
      const key =
        (typeof entry?.playerKey === "string" && entry.playerKey) ||
        (entry?.installId ? `install:${entry.installId}` : "");
      if (!key) continue;
      vocabByKey.set(key, entry);
    }
    for (const entry of vocabularyFallback) {
      if (!entry?.installId) continue;
      const key = `install:${entry.installId}`;
      const resolvedNick =
        (typeof entry?.nick === "string" && entry.nick.trim()) || nickByPlayerKey.get(key) || "";
      const displayNick = resolvedNick || `Joueur-${String(entry.installId).slice(0, 6)}`;
      const next = {
        nick: displayNick,
        playerKey: key,
        vocabCount: Number(entry.count) || 0,
        achievedAt: Number(entry.updatedAt) || 0,
      };
      const current = vocabByKey.get(key);
      if (!current || next.vocabCount > (Number(current?.vocabCount) || 0)) {
        vocabByKey.set(key, next);
      }
    }
    const mergedVocab = Array.from(vocabByKey.values()).sort((a, b) => {
      const diff = (Number(b?.vocabCount) || 0) - (Number(a?.vocabCount) || 0);
      if (diff !== 0) return diff;
      return (Number(a?.achievedAt) || 0) - (Number(b?.achievedAt) || 0);
    });
    const filterBots = (entries) =>
      Array.isArray(entries)
        ? entries.filter((entry) => !BOT_NICK_SET.has(entry?.nick))
        : [];
    const filteredBoards = {
      ...boards,
      medals: filterBots(boards.medals),
      mostWordsInGame: filterBots(boards.mostWordsInGame),
      totalScore: filterBots(boards.totalScore),
      bestWord: filterBots(boards.bestWord),
      longestWord: filterBots(boards.longestWord),
      bestRoundScore: filterBots(boards.bestRoundScore),
      bestTimeTargetLong: filterBots(boards.bestTimeTargetLong),
      bestTimeTargetScore: filterBots(boards.bestTimeTargetScore),
      vocab: filterBots(mergedVocab).slice(0, payload?.topN || topN || 50),
      mostGobbles: filterBots(boards.mostGobbles),
    };
    return res.json({ ...payload, boards: filteredBoards });
  } catch (_) {
    const weekStartTs = getWeekStartTs();
    const nextResetTs = weekStartTs + 7 * 24 * 60 * 60 * 1000;
    return res.json({
      weekStartTs,
      weekStartISO: new Date(weekStartTs).toISOString(),
      nextResetTs,
      nextResetISO: new Date(nextResetTs).toISOString(),
      topN: topN ?? 50,
      boards: {},
    });
  }
});

const DAILY_NICK_MAX_LEN = 25;

function sanitizeDailyNick(raw) {
  const trimmed = String(raw || "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.slice(0, DAILY_NICK_MAX_LEN);
}

app.get("/api/daily/status", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const installId = normalizeInstallId(req.query?.installId);
  const payload = await getDailyStatus(null, installId || null);
  res.json(payload);
});

app.get("/api/daily/board", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const dateId = typeof req.query?.dateId === "string" ? req.query.dateId : null;
  const payload = await getDailyBoard(dateId || null);
  if (!payload.ready) {
    res.status(503);
  }
  res.json(payload);
});

app.get("/api/daily/history", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const rawDays = Number(req.query?.days);
  const days = Number.isFinite(rawDays)
    ? Math.min(30, Math.max(1, Math.round(rawDays)))
    : 7;
  const payload = await getDailyHistory({ days });
  res.json(payload);
});

app.post("/api/daily/start", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const installId = normalizeInstallId(req.body?.installId);
  const pseudo = sanitizeDailyNick(req.body?.pseudo || "");
  if (!installId || !pseudo) {
    res.status(400);
    return res.json({ ok: false, error: "bad_request" });
  }
  const result = await startDailyAttempt(null, installId, pseudo);
  if (!result.ok) {
    if (result.error === "already_played") {
      res.status(409);
    } else if (result.error === "not_ready") {
      res.status(503);
    } else {
      res.status(500);
    }
  }
  return res.json(result);
});

app.post("/api/daily/submit", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const installId = normalizeInstallId(req.body?.installId);
  const pseudo = sanitizeDailyNick(req.body?.pseudo || "");
  if (!installId || !pseudo) {
    res.status(400);
    return res.json({ ok: false, error: "bad_request" });
  }
  const result = await submitDailyResult({
    dateId: typeof req.body?.dateId === "string" ? req.body.dateId : null,
    installId,
    pseudo,
    foundWords: req.body?.foundWords,
    durationMs: req.body?.durationMs,
    dictionary,
  });
  if (!result.ok) {
    if (result.error === "already_played") {
      res.status(409);
    } else if (result.error === "not_ready") {
      res.status(503);
    } else if (result.error === "no_dictionary") {
      res.status(500);
    } else {
      res.status(400);
    }
  }
  return res.json(result);
});

app.get("/api/players", (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "public, max-age=2");
  const requestedRoomId =
    typeof req.query?.roomId === "string" && req.query.roomId
      ? req.query.roomId
      : "room-4x4";
  const room = getRoom(requestedRoomId);
  if (!room) {
    return res.json({ ok: false, error: "invalid_room", roomId: requestedRoomId });
  }
  const players = Array.from(room.players.values())
    .map((p) => ({
      nick: p?.nick || "",
      isBot: isBotToken(p?.token),
    }))
    .filter((p) => p.nick)
    .sort((a, b) => a.nick.localeCompare(b.nick));
  const now = Date.now();
  const currentRound = room.currentRound || null;
  const breakState = room.breakState || null;
  const status = {
    serverNow: now,
    roundNumber: currentRound?.roundNumber ?? null,
    roundEndsAt: currentRound?.endsAt ?? null,
    roundDurationMs: currentRound?.durationMs ?? room.config?.durationMs ?? DEFAULT_ROUND_DURATION_MS,
    tournamentRound: currentRound?.tournamentRound ?? room.tournament?.currentRound ?? null,
    tournamentTotalRounds: room.tournament?.totalRounds ?? TOURNAMENT_TOTAL_ROUNDS,
    breakKind: breakState?.breakKind ?? null,
    breakEndsAt: breakState?.nextStartAt ?? null,
    breakDurationMs: room.config?.breakMs ?? DEFAULT_BREAK_DURATION_MS,
    isRoundRunning: currentRound?.status === "running",
  };
  return res.json({
    ok: true,
    roomId: requestedRoomId,
    count: players.length,
    players,
    status,
  });
});

app.get("/health", (req, res) => {
  const metrics = getMetrics({
    roomsCount: rooms?.size ?? null,
    socketsCount: io?.sockets?.sockets?.size ?? null,
  });
  res.set("Content-Type", "application/json; charset=utf-8");
  res.json({
    ok: true,
    now: new Date().toISOString(),
    metrics,
  });
});

// ===== SERVE FRONT VITE (dist) =====
app.use(express.static(path.join(__dirname, "../dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
  pingTimeout: 60000,
});

const lagMonitor = setInterval(() => {
  const metrics = getMetrics({
    roomsCount: rooms?.size ?? null,
    socketsCount: io?.sockets?.sockets?.size ?? null,
  });
  const p99 = metrics?.eventLoopDelay?.p99;
  if (Number.isFinite(p99) && p99 > 200) {
    console.warn(`[health] high event loop delay p99=${p99.toFixed(1)}ms`);
  }
}, 5000);
lagMonitor.unref?.();

const DEFAULT_ROUND_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const DEFAULT_BREAK_DURATION_MS = 45 * 1000; // 45 secondes
const TARGET_BREAK_DURATION_MS = 30 * 1000; // 30 secondes pour manches cibles
const MAX_CHAT_HISTORY = 50;
const NICK_MAX_LEN = 25;
const MIN_BIG_WORD = 50;
const MIN_LONG_WORD = 5;
const MIN_WORDS_BY_SIZE = { 4: 120, 5 : 100 }; 
const SPECIAL_ROUND_EVERY = 5;
const SPEED_MIN_WORDS = { 4: 300, 5: 400 };
const SPEED_WORD_SCORE = 11;
const MONSTROUS_MIN_TOTAL_SCORE = { 4: 2000, 5: 4000 };
const MONSTROUS_MIN_LONG_WORD_LEN = 10;
const MONSTROUS_MIN_LONG_WORD_COUNT = 3;
const SPECIAL_QUALITY_ATTEMPTS = 220;

const TOURNAMENT_TOTAL_ROUNDS = 5;
const TOURNAMENT_SPECIAL_ROUNDS = [2, 4];
const TOURNAMENT_RESULTS_BREAK_MS = 40 * 1000;
const TOURNAMENT_FINAL_BREAK_MS = 35 * 1000;
const TOURNAMENT_END_TOTAL_BREAK_MS = TOURNAMENT_RESULTS_BREAK_MS + TOURNAMENT_FINAL_BREAK_MS;
const MEDALS_TTL_AFTER_DISCONNECT_MS = 5 * 60 * 1000;
const TOURNAMENT_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const DISCONNECT_GRACE_MS = 120 * 1000;


const TARGET_HINT_FIRST_MS = 15 * 1000;
const TARGET_HINT_STEP_MS = 15 * 1000;

const BONUS_LETTER_SCORE = 20;
const BONUS_LETTER_MIN_WORDS = 30;
const FORCE_BONUS_LETTER_ALL_ROUNDS = false;
// Dev-only: force alternance "meilleur mot" / "mot le plus long" pour tests.
// Active via env GOBBLE_FORCE_TARGET_SPECIALS=1/true/on ou NODE_ENV=development.
const FORCE_TARGET_SPECIALS_LOCAL = (() => {
  const raw = String(process.env.GOBBLE_FORCE_TARGET_SPECIALS || "")
    .trim()
    .toLowerCase();
  const force =
    raw === "1" || raw === "true" || raw === "on" || raw === "yes";
  return force || process.env.NODE_ENV === "development";
})();

if (FORCE_TARGET_SPECIALS_LOCAL) {
  console.log("[dev] Forçage des manches spéciales activé (target_long/target_score).");
}

const ROOM_CONFIGS = {
  "room-4x4": {
    label: "Grille 4x4",
    gridSize: 4,
    durationMs: DEFAULT_ROUND_DURATION_MS,
    breakMs: DEFAULT_BREAK_DURATION_MS,
    minWords: MIN_WORDS_BY_SIZE[4],
  },
  "room-5x5": {
    label: "Grille 5x5",
    gridSize: 5,
    durationMs: DEFAULT_ROUND_DURATION_MS,
    breakMs: DEFAULT_BREAK_DURATION_MS,
    minWords: MIN_WORDS_BY_SIZE[5],
  },
};

const DISABLED_ROOMS = new Set(["room-5x5"]);



const LOG_DIR = path.join(__dirname, "logs");
const CONNECTIONS_LOG_PATH = path.join(LOG_DIR, "connections.log");
const REPORTS_LOG_PATH = path.join(LOG_DIR, "reports.jsonl");
const REPORT_WINDOW_MS = 10 * 60 * 1000;
const REPORT_MUTE_THRESHOLD = 3;
const REPORT_REASON_MAX_LEN = 160;
const MUTE_DURATION_MS = 10 * 60 * 1000;
const INSTALL_ID_MAX_LEN = 128;
const reportEntries = [];
const reportsByInstallId = new Map();
const mutedInstallIds = new Map();
const reportLogger = createAsyncFileLogger({ filePath: REPORTS_LOG_PATH });
const connectionLogger = createAsyncFileLogger({ filePath: CONNECTIONS_LOG_PATH });
let dailyChampion = null;
let dailyChampionInstallId = null;

function normalizeInstallId(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > INSTALL_ID_MAX_LEN) return "";
  return trimmed;
}

function isDailyChampionInstallId(raw) {
  if (!dailyChampionInstallId) return false;
  return normalizeInstallId(raw) === dailyChampionInstallId;
}

function sanitizeReportReason(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.length <= REPORT_REASON_MAX_LEN) return trimmed;
  return trimmed.slice(0, REPORT_REASON_MAX_LEN);
}

function isInstallIdMuted(installId) {
  const key = normalizeInstallId(installId);
  if (!key) return false;
  const expiresAt = mutedInstallIds.get(key);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    mutedInstallIds.delete(key);
    return false;
  }
  return true;
}

function registerReportForInstallId(installId, now) {
  const key = normalizeInstallId(installId);
  if (!key) return 0;
  const prev = reportsByInstallId.get(key) || [];
  const recent = prev.filter((ts) => now - ts <= REPORT_WINDOW_MS);
  recent.push(now);
  reportsByInstallId.set(key, recent);
  return recent.length;
}

function muteInstallId(installId, now) {
  const key = normalizeInstallId(installId);
  if (!key) return null;
  const nextExpiry = now + MUTE_DURATION_MS;
  const existing = mutedInstallIds.get(key) || 0;
  const expiresAt = Math.max(existing, nextExpiry);
  mutedInstallIds.set(key, expiresAt);
  return expiresAt;
}

function appendReportLog(entry) {
  try {
    reportLogger.logLine(`${JSON.stringify(entry)}\n`);
  } catch (_) {}
}

function normalizeIp(raw) {
  const ip = String(raw || "").trim();
  if (!ip) return "";
  if (ip.startsWith("::ffff:")) return ip.slice("::ffff:".length);
  return ip;
}

function getClientIpFromSocket(socket) {
  try {
    const xf = socket?.handshake?.headers?.["x-forwarded-for"];
    if (typeof xf === "string" && xf.trim()) {
      return normalizeIp(xf.split(",")[0].trim());
    }
  } catch (_) {}
  return normalizeIp(socket?.handshake?.address || "");
}

function loadIgnoredIps() {
  const list = new Set();
  const env = `${process.env.IGNORE_IPS || ""},${process.env.IGNORE_IP || ""}`;
  env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((ip) => list.add(ip));

  try {
    const raw = readFileSync(path.join(LOG_DIR, "ignore_ips.txt"), "utf8");
    raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((ip) => list.add(ip));
  } catch (_) {}

  list.add("127.0.0.1");
  list.add("::1");
  return list;
}

const IGNORED_IPS = loadIgnoredIps();

function appendConnectionLog({ nick, roomId, ip, userAgent }) {
  const safeNick = String(nick || "").replace(/\r|\n/g, " ").trim();
  const safeRoom = String(roomId || "").replace(/\r|\n/g, " ").trim();
  const safeIp = normalizeIp(ip);
  if (!safeNick || !safeIp) return;
  if (IGNORED_IPS.has(safeIp)) return;

  const safeUa = String(userAgent || "").replace(/\r|\n/g, " ").trim();
  const ts = Date.now();
  const iso = new Date(ts).toISOString();
  const line = `${iso}\t${ts}\t${safeIp}\t${safeRoom}\t${safeNick}\t${safeUa}\n`;
  try {
    connectionLogger.logLine(line);
  } catch (_) {}
}

// Dictionnaire pour solveur serveur (facultatif)
let dictionary = null;
try {
  const raw = readFileSync(path.join(__dirname, "../public/dico.txt"), "utf8");
  dictionary = new Set(
    raw
      .split(/\r?\n/)
      .map((w) => normalizeWord(w.trim()))
      .filter(Boolean)
  );
  console.log(`Dictionnaire chargé (${dictionary.size} entrées)`);
} catch (err) {
  console.warn(
    "Impossible de charger le dictionnaire pour le solveur serveur:",
    err?.message
  );
  dictionary = null;
}

void loadDailyChampion()
  .then((champion) => {
    dailyChampion = champion || null;
    dailyChampionInstallId = normalizeInstallId(champion?.installId);
  })
  .catch(() => {});

function getRoundPlan(roundNumber, roomConfig) {
  const size = roomConfig?.gridSize || 4;
  const base = {
    roundNumber,
    gridSize: size,
    isSpecial: false,
    type: "normal",
    label: "Manche classique",
    description: null,
    minWords: roomConfig?.minWords || 0,
  };

  if (FORCE_TARGET_SPECIALS_LOCAL) {
    const useLong = roundNumber % 2 === 0;
    return useLong
      ? buildTargetLongTournamentPlan(roundNumber, roomConfig)
      : buildTargetScoreTournamentPlan(roundNumber, roomConfig);
  }

  if (roundNumber > 0 && roundNumber % SPECIAL_ROUND_EVERY === 0) {
    const specialIndex = Math.floor(roundNumber / SPECIAL_ROUND_EVERY) - 1;
    const speedTurn = specialIndex % 2 === 0;
    if (speedTurn) {
      return {
        ...base,
        isSpecial: true,
        type: "speed",
        label: "Manche rapidité",
        description: "Tous les mots valent 11 pts, on vise la rafale",
        minWords: SPEED_MIN_WORDS[size] || SPEED_MIN_WORDS[4],
        fixedWordScore: SPEED_WORD_SCORE,
        qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
      };
    }
    return {
      ...base,
      isSpecial: true,
      type: "monstrous",
      label: "Grille monstrueuse",
      description: "Grille chargée en mots très longs et gros score potentiel",
      minWords: roomConfig?.minWords || 0,
      minTotalScore: MONSTROUS_MIN_TOTAL_SCORE[size] || MONSTROUS_MIN_TOTAL_SCORE[4],
      minLongWordLen: MONSTROUS_MIN_LONG_WORD_LEN,
      minLongWordCount: MONSTROUS_MIN_LONG_WORD_COUNT,
      qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
    };
  }

  return base;
}

function buildBaseTournamentPlan(tournamentRound, roomConfig) {
  const size = roomConfig?.gridSize || 4;
  return {
    roundNumber: tournamentRound,
    gridSize: size,
    isSpecial: false,
    type: "normal",
    label:
      tournamentRound === TOURNAMENT_TOTAL_ROUNDS
        ? "Manche finale"
        : "Manche classique",
    description: null,
    minWords: roomConfig?.minWords || 0,
  };
}

function buildSpeedTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  const size = base.gridSize || 4;
  return {
    ...base,
    isSpecial: true,
    type: "speed",
    label: "Manche rapidité",
    description: `Tous les mots valent ${SPEED_WORD_SCORE} pts, on vise la rafale`,
    minWords: SPEED_MIN_WORDS[size] || SPEED_MIN_WORDS[4],
    fixedWordScore: SPEED_WORD_SCORE,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildMonstrousTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  const size = base.gridSize || 4;
  return {
    ...base,
    isSpecial: true,
    type: "monstrous",
    label: "Grille monstrueuse",
    description: "Grille chargée en mots très longs et gros score potentiel",
    minWords: roomConfig?.minWords || 0,
    minTotalScore: MONSTROUS_MIN_TOTAL_SCORE[size] || MONSTROUS_MIN_TOTAL_SCORE[4],
    minLongWordLen: MONSTROUS_MIN_LONG_WORD_LEN,
    minLongWordCount: MONSTROUS_MIN_LONG_WORD_COUNT,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildTargetLongTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: "target_long",
    label: "Mot le plus long",
    description: `Trouve le mot le plus long (indice apres ${TARGET_HINT_FIRST_MS / 1000}s)`,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildTargetScoreTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: "target_score",
    label: "Meilleur mot",
    description: `Trouve le meilleur mot (celui qui rapporte le plus de points, indice apres ${TARGET_HINT_FIRST_MS / 1000}s)`,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildBonusLetterTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: "bonus_letter",
    label: "Lettre en or",
    description: `Une lettre vaut ${BONUS_LETTER_SCORE} pts`,
    bonusLetterScore: BONUS_LETTER_SCORE,
    bonusLetterMinWords: BONUS_LETTER_MIN_WORDS,
    disableBonuses: true,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildTournamentSpecials(roomConfig) {
  const specials = new Map();
  const factories = [
    (round) => buildSpeedTournamentPlan(round, roomConfig),
    (round) => buildMonstrousTournamentPlan(round, roomConfig),
    (round) => buildTargetLongTournamentPlan(round, roomConfig),
    (round) => buildTargetScoreTournamentPlan(round, roomConfig),
    (round) => buildBonusLetterTournamentPlan(round, roomConfig),
  ];
  for (const round of TOURNAMENT_SPECIAL_ROUNDS) {
    const pick = factories[Math.floor(Math.random() * factories.length)];
    specials.set(round, pick(round));
  }
  return specials;
}

function createTournamentState(roomConfig) {
  return {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    currentRound: 0,
    totalRounds: TOURNAMENT_TOTAL_ROUNDS,
    specials: buildTournamentSpecials(roomConfig),
    totals: new Map(), // nick -> { points, gobbles }
    lastAwarded: new Map(), // nick -> { points, gobbles }
    prevPositions: new Map(), // nick -> position
    records: {
      mostWords: { count: 0, nick: null, round: null },
      bestWord: { pts: 0, nick: null, word: null, round: null },
      longestWord: { len: 0, nick: null, word: null, round: null },
    },
  };
}

function resetTournament(room) {
  room.tournament = createTournamentState(room.config);
}

function getTournamentRoundPlan(room, tournamentRound) {
  if (FORCE_TARGET_SPECIALS_LOCAL) {
    const useLong = tournamentRound % 2 === 0;
    return useLong
      ? buildTargetLongTournamentPlan(tournamentRound, room.config)
      : buildTargetScoreTournamentPlan(tournamentRound, room.config);
  }
  if (FORCE_BONUS_LETTER_ALL_ROUNDS) {
    return buildBonusLetterTournamentPlan(tournamentRound, room.config);
  }
  const total = room?.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS;
  // La manche finale n'est jamais une manche spéciale.
  if (tournamentRound === total) {
    return buildBaseTournamentPlan(tournamentRound, room.config);
  }
  const special = room?.tournament?.specials?.get(tournamentRound);
  if (special) return special;
  return buildBaseTournamentPlan(tournamentRound, room.config);
}

function buildSpecialWarning(plan) {
  if (!plan?.isSpecial) return null;
  const label = plan.label || "manche speciale";
  if (plan.type === "speed") {
    return `ATTENTION, MANCHE SPECIALE A SUIVRE : ${label} (mots fixes à ${SPEED_WORD_SCORE} pts)`;
  }
  if (plan.type === "monstrous") {
    return `ATTENTION, MANCHE SPECIALE A SUIVRE : ${label} (grosse grille à mots longs)`;
  }
  return `ATTENTION, MANCHE SPECIALE A SUIVRE : ${label}`;
}

function createRoomState(roomId, config) {
  return {
    id: roomId,
    config,
    players: new Map(), // socket.id -> { nick, token, installId }
    nickToInstallId: new Map(), // nick -> installId
    currentRound: null, // { id, grid, endsAt, status, timers }
    submissions: new Map(), // roundId -> Map(nick -> { words:Set, score:number })
    chatMessages: [],
    tournament: createTournamentState(config),
    lastTournamentSummary: null,
    medals: new Map(), // medalKey -> { gold, silver, bronze }
    medalExpiry: new Map(), // medalKey -> expiresAt
    bestScoreRecord: { pts: 0, players: new Set() },
    bestLengthRecord: { len: 0, players: new Set() },
    longestPossibleRecord: { len: 0, players: new Set() },
    bestPossibleScoreRecord: { pts: 0, players: new Set() },
    bestPossibleStats: { maxLen: 0, maxPts: 0 },
    closeFightAnnounced: false,
    finalFightScheduled: null,
    endSoonTimeout: null,
    lastRoundQuality: null,
    nextPreparedGrid: null,
    roundCounter: 0,
    specialWarningIssuedFor: null,
    breakState: null, // { nextStartAt, breakKind, tournament, nextSpecial }
    lastRoundResults: null,
    pendingDisconnects: new Map(), // socket.id -> { timer, installId, nick }
  };
}

const rooms = new Map(
  Object.entries(ROOM_CONFIGS)
    .filter(([roomId]) => !DISABLED_ROOMS.has(roomId))
    .map(([roomId, config]) => [roomId, createRoomState(roomId, config)])
);
rooms.forEach((room) => hydrateDailyMedals(room));
let botManager = null;

function getRoom(roomId) {
  return rooms.get(roomId);
}

function findPlayerByNick(room, nick) {
  for (const [id, player] of room.players.entries()) {
    if (player?.nick === nick) {
      return { id, player };
    }
  }
  return null;
}

function isBotToken(token) {
  return typeof token === "string" && token.startsWith("bot-");
}

function isBotNick(room, nick) {
  if (!room || !nick) return false;
  if (BOT_NICK_SET.has(nick)) return true;
  for (const player of room.players.values()) {
    if (player?.nick === nick) {
      return isBotToken(player?.token);
    }
  }
  return false;
}

function getBotStrengthForNick(nick) {
  if (!nick) return 0;
  return Number.isFinite(BOT_STRENGTH_BY_NICK.get(nick))
    ? BOT_STRENGTH_BY_NICK.get(nick)
    : 0;
}

function emitPlayers(room) {
  io.to(room.id).emit(
    "playersUpdate",
    Array.from(room.players.values())
      .filter((p) => isPlayerConnected(p) || isBotToken(p?.token))
      .map((p) => ({
        nick: p.nick,
        roomId: room.id,
        installId: p.installId || null,
        isBot: isBotToken(p?.token),
        connected: isPlayerConnected(p) || isBotToken(p?.token),
        isDailyChampion: isDailyChampionInstallId(p.installId),
      }))
  );
}

function persistRoomMedals(room) {
  if (!room || !room.id) return;
  persistDailyMedalsForRoom(room.id, room.medals, room.medalExpiry);
}

function hydrateDailyMedals(room) {
  const snapshot = getDailyMedalsForRoom(room?.id);
  if (!snapshot) return;
  room.medals = snapshot.medals;
  room.medalExpiry = snapshot.expiry;
  room.medalDateId = getParisDateId();
}

function ensureDailyMedalsDate(room) {
  if (!room) return false;
  const currentDateId = getParisDateId();
  if (room.medalDateId === currentDateId) return false;
  room.medalDateId = currentDateId;
  const hadEntries = room.medals?.size || room.medalExpiry?.size;
  if (room.medals) room.medals.clear();
  if (room.medalExpiry) room.medalExpiry.clear();
  return Boolean(hadEntries);
}

function cleanupExpiredMedals(room) {
  const now = Date.now();
  let changed = ensureDailyMedalsDate(room);
  for (const [key, expiresAt] of room.medalExpiry.entries()) {
    if (expiresAt > now) continue;
    room.medalExpiry.delete(key);
    room.medals.delete(key);
    changed = true;
  }
  if (changed) {
    persistRoomMedals(room);
  }
}

function emitMedals(room) {
  cleanupExpiredMedals(room);
  const payload = {};
  for (const p of room.players.values()) {
    const key = getMedalKeyForPlayer(p);
    if (!key) continue;
    const counts = room.medals.get(key);
    if (!counts) continue;
    payload[p.nick] = counts;
  }
  for (const [key, counts] of room.medals.entries()) {
    if (!key.startsWith("nick:")) continue;
    const nick = key.slice("nick:".length);
    if (!payload[nick]) payload[nick] = counts;
  }
  io.to(room.id).emit("medalsUpdate", payload);
  persistRoomMedals(room);
}

function addMedal(room, nick, type) {
  if (!room || !nick) return;
  if (isBotNick(room, nick)) return;
  const key = getMedalKeyForNickLookup(room, nick);
  if (!key) return;
  const current = room.medals.get(key) || { gold: 0, silver: 0, bronze: 0 };
  room.medals.set(key, {
    gold: Math.min(9999, current.gold + (type === "gold" ? 1 : 0)),
    silver: Math.min(9999, current.silver + (type === "silver" ? 1 : 0)),
    bronze: Math.min(9999, current.bronze + (type === "bronze" ? 1 : 0)),
  });
  recordMedal(key, nick, type, Date.now());
  if (key.startsWith("install:")) {
    room.medalExpiry.set(key, getNextMidnightTs());
  } else {
    room.medalExpiry.delete(key);
  }
  persistRoomMedals(room);
}

function clearPendingDisconnect(room, socketId) {
  if (!room?.pendingDisconnects || !socketId) return;
  const entry = room.pendingDisconnects.get(socketId);
  if (entry?.timer) clearTimeout(entry.timer);
  room.pendingDisconnects.delete(socketId);
}

function emitRoomsStats() {
  const payload = Array.from(rooms.values()).map((room) => {
    const playersCount = Array.from(room.players.values()).filter(
      (p) => p?.connected !== false
    ).length;
    return {
      roomId: room.id,
      label: room.config.label,
      players: playersCount,
    };
  });
  io.emit("roomsStats", payload);
}

function findPlayerByInstallId(room, installId) {
  if (!room || !installId) return null;
  const normalized = normalizeInstallId(installId);
  if (!normalized) return null;
  for (const [socketId, player] of room.players.entries()) {
    if (normalizeInstallId(player?.installId) === normalized) {
      return { socketId, player };
    }
  }
  return null;
}

function isPlayerConnected(player) {
  if (!player) return false;
  return player.connected !== false;
}

function hasPlayerActivity(data) {
  if (!data) return false;
  const wordsCount = data?.words ? data.words.size : 0;
  const score = Number(data?.score) || 0;
  return wordsCount > 0 || score > 0;
}

function buildRoundStartedPayload(room) {
  const round = room?.currentRound;
  if (!round) return null;
  const totalRounds = room.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS;
  const currentTournamentRound = round.tournamentRound || 1;
  const nextTournamentRound =
    currentTournamentRound >= totalRounds ? 1 : currentTournamentRound + 1;
  const nextPlan = getTournamentRoundPlan(room, nextTournamentRound);
  const currentQuality = round.quality;

  return {
    roomId: room.id,
    roundId: round.id,
    grid: round.grid,
    gridSize: room.config.gridSize,
    durationMs: round.durationMs,
    endsAt: round.endsAt,
    targetLength: round.targetLength || null,
    special: round.special?.isSpecial ? round.special : null,
    gridQuality: currentQuality
      ? {
          words: currentQuality.words ?? 0,
          maxLen: currentQuality.maxLen ?? 0,
          maxPts:
            round.special?.fixedWordScore || currentQuality.maxPts || 0,
          totalPts: currentQuality.totalPts ?? 0,
          possibleScore: currentQuality.possibleScore ?? currentQuality.totalPts ?? 0,
          longWords: currentQuality.longWords ?? 0,
        }
      : null,
    roundNumber: round.roundNumber,
    tournament: {
      id: room.tournament?.id || null,
      round: currentTournamentRound,
      totalRounds,
      isFinalRound: currentTournamentRound === totalRounds,
      nextRound: nextTournamentRound,
      nextStartsNewTournament: currentTournamentRound === totalRounds,
    },
    nextSpecial: nextPlan?.isSpecial ? nextPlan : null,
  };
}

function buildBreakSnapshot(room) {
  if (!room?.breakState) return null;
  return {
    roomId: room.id,
    nextStartAt: room.breakState.nextStartAt || null,
    breakKind: room.breakState.breakKind || null,
    tournament: room.breakState.tournament || null,
    nextSpecial: room.breakState.nextSpecial || null,
    tournamentSummary: room.breakState.tournamentSummary || null,
    tournamentSummaryAt: room.breakState.tournamentSummaryAt || null,
    targetSummary: room.breakState.targetSummary || null,
  };
}

function buildLiveRanking(room, roundId) {
  if (!room?.currentRound) return [];
  const roundSubs = room.submissions.get(roundId) || new Map();
  const ranking = [];
  for (const player of room.players.values()) {
    const data = roundSubs.get(player.nick);
    const connected = isPlayerConnected(player) || isBotToken(player?.token);
    const active = connected || hasPlayerActivity(data);
    if (!active) continue;
    ranking.push({
      nick: player.nick,
      score: data?.score || 0,
      isDailyChampion: isDailyChampionInstallId(player.installId),
    });
  }
  ranking.sort((a, b) => (b.score || 0) - (a.score || 0));
  return ranking;
}

function buildSessionSnapshot(room, player) {
  if (!room || !player) return null;
  const round = room.currentRound;
  const phase =
    round?.status === "running"
      ? "playing"
      : room.breakState
      ? "results"
      : "lobby";
  const currentRoundPayload = round?.status === "running"
    ? buildRoundStartedPayload(room)
    : null;
  let score = 0;
  let words = [];
  let participated = false;
  if (round?.status === "running") {
    const roundSubs = room.submissions.get(round.id) || null;
    const playerRound = roundSubs ? roundSubs.get(player.nick) : null;
    score = playerRound?.score || 0;
    words = Array.from(playerRound?.words || []);
    participated = hasPlayerActivity(playerRound);
  } else if (room.lastRoundResults?.payload?.results) {
    const entry = room.lastRoundResults.payload.results.find((r) => r.nick === player.nick);
    if (entry) {
      score = entry.score || 0;
      words = Array.isArray(entry.words) ? entry.words : [];
      participated = Array.isArray(words) ? words.length > 0 || score > 0 : score > 0;
    }
  }
  const playerState = {
    nick: player.nick,
    connected: isPlayerConnected(player),
    score,
    words,
    participated,
  };

  return {
    roomId: room.id,
    phase,
    player: playerState,
    currentRound: currentRoundPayload,
    ranking:
      round?.status === "running" && round?.id
        ? buildLiveRanking(room, round.id)
        : [],
    breakState: buildBreakSnapshot(room),
    lastRoundResults: room.lastRoundResults || null,
  };
}

function ensurePlayerInRound(room, nick) {
  if (!room.currentRound) return;
  const roundSubs = room.submissions.get(room.currentRound.id);
  if (!roundSubs) return;
  if (!roundSubs.has(nick)) {
    roundSubs.set(nick, { words: new Set(), score: 0, wordTimes: new Map() });
  }
}

function broadcastProvisionalRanking(room) {
  if (!room.currentRound) return;
  const roundSubs = room.submissions.get(room.currentRound.id);
  if (!roundSubs) return;

  const ranking = [];
  for (const player of room.players.values()) {
    const data = roundSubs.get(player.nick);
    const connected = isPlayerConnected(player) || isBotToken(player?.token);
    const active = connected || hasPlayerActivity(data);
    if (!active) continue;
    ranking.push({
      nick: player.nick,
      score: data?.score || 0,
      isDailyChampion: isDailyChampionInstallId(player.installId),
    });
  }

  ranking.sort((a, b) => b.score - a.score);

  io.to(room.id).emit("rankingUpdate", {
    roomId: room.id,
    roundId: room.currentRound.id,
    ranking: ranking.map((entry, idx) => ({
      nick: entry.nick,
      rank: idx + 1,
      isDailyChampion: entry.isDailyChampion || false,
    })),
  });
}

function broadcastDailyChampionUpdate() {
  rooms.forEach((room) => {
    emitPlayers(room);
    broadcastProvisionalRanking(room);
  });
}

async function refreshDailyChampionCache() {
  const champion = await refreshDailyChampionIfNeeded();
  const nextInstallId = normalizeInstallId(champion?.installId);
  const changed =
    (champion?.dateId || null) !== (dailyChampion?.dateId || null) ||
    (nextInstallId || null) !== (dailyChampionInstallId || null);
  dailyChampion = champion || null;
  dailyChampionInstallId = nextInstallId || null;
  if (changed) {
    broadcastDailyChampionUpdate();
  }
  return champion;
}

function pushChatMessage(room, message) {
  room.chatMessages.push(message);
  while (room.chatMessages.length > MAX_CHAT_HISTORY) {
    room.chatMessages.shift();
  }
  io.to(room.id).emit("chatMessage", message);
  io.to(room.id).emit("chat:new", message);
}

function flushAnnouncements(room) {
  if (!room?.announcementQueue || room.announcementQueue.length === 0) {
    room.announcementTimer = null;
    return;
  }
  const batch = room.announcementQueue.splice(0, room.announcementQueue.length);
  room.announcementTimer = null;
  if (batch.length === 1) {
    io.to(room.id).emit("announcement", batch[0]);
    return;
  }
  io.to(room.id).emit("announcements", batch);
}

function pushAnnouncement(room, payload) {
  if (!room) return;
  const entry = {
    id: Date.now() + Math.random(),
    ts: Date.now(),
    roomId: room.id,
    ...payload,
  };
  if (!room.announcementQueue) room.announcementQueue = [];
  room.announcementQueue.push(entry);
  if (room.announcementQueue.length >= ANNOUNCEMENT_BATCH_MAX) {
    if (room.announcementTimer) {
      clearTimeout(room.announcementTimer);
      room.announcementTimer = null;
    }
    flushAnnouncements(room);
    return;
  }
  if (!room.announcementTimer) {
    room.announcementTimer = setTimeout(() => flushAnnouncements(room), ANNOUNCEMENT_BATCH_MS);
  }
}

function getFullRanking(room) {
  if (!room.currentRound) return [];
  const roundSubs = room.submissions.get(room.currentRound.id) || new Map();
  const ranking = [];
  for (const [nick, data] of roundSubs.entries()) {
    const lookup = findPlayerByNick(room, nick);
    ranking.push({
      nick,
      score: data.score || 0,
      isDailyChampion: isDailyChampionInstallId(lookup?.player?.installId),
    });
  }
  ranking.sort((a, b) => b.score - a.score);
  return ranking;
}

function computeBestPossible(grid, special = null) {
  if (!dictionary) return { maxLen: 0, maxPts: 0 };
  const solved = solveGridCached(grid, dictionary, special);
  let maxLen = 0;
  let maxPts = 0;
  for (const [word, data] of solved.entries()) {
    const len = word.length;
    const pts = data?.pts || 0;
    if (len > maxLen) maxLen = len;
    if (pts > maxPts) maxPts = pts;
  }
  return { maxLen, maxPts };
}

function getSpecialScoreConfigFromPlan(plan) {
  if (plan?.type === "bonus_letter" && plan?.bonusLetter) {
    return {
      bonusLetter: plan.bonusLetter,
      bonusLetterScore: plan.bonusLetterScore || BONUS_LETTER_SCORE,
      disableBonuses: true,
    };
  }
  return null;
}

function getSpecialScoreConfig(round) {
  const plan = round?.special;
  if (plan?.type === "bonus_letter" && plan?.bonusLetter) {
    return {
      bonusLetter: plan.bonusLetter,
      bonusLetterScore: plan.bonusLetterScore || BONUS_LETTER_SCORE,
      disableBonuses: true,
    };
  }
  return null;
}

function computeWordScoreForRound(round, norm, path, defaultPts) {
  const plan = round?.special;
  if (plan?.type === "speed" && plan.fixedWordScore) {
    return plan.fixedWordScore;
  }
  if (plan?.type === "target_long" || plan?.type === "target_score") {
    return 0;
  }
  return defaultPts;
}

function buildTargetWordCellMap(word, path, grid) {
  const map = [];
  if (!word || !Array.isArray(path) || !Array.isArray(grid)) return map;
  let pos = 0;
  for (const idx of path) {
    if (pos >= word.length) break;
    const cell = grid[idx];
    if (!cell) continue;
    const label =
      cell.letter === "Qu"
        ? "qu"
        : String(cell.letter || "").toLowerCase();
    if (!label) continue;
    const len = label.length;
    for (let i = 0; i < len && pos + i < word.length; i++) {
      map[pos + i] = idx;
    }
    pos += len;
  }
  return map;
}

function resolveTargetHintCells(room, revealed) {
  if (!room?.currentRound) return [];
  if (!Array.isArray(revealed) || revealed.length === 0) return [];
  const { targetWord, targetPath, grid } = room.currentRound;
  if (!targetWord || !Array.isArray(targetPath) || !Array.isArray(grid)) return [];
  if (
    !Array.isArray(room.currentRound.targetWordCellMap) ||
    room.currentRound.targetWordCellMap.length !== targetWord.length
  ) {
    room.currentRound.targetWordCellMap = buildTargetWordCellMap(
      targetWord,
      targetPath,
      grid
    );
  }
  const map = room.currentRound.targetWordCellMap || [];
  const cells = [];
  for (const idx of revealed) {
    const cellIndex = map[idx];
    if (Number.isInteger(cellIndex)) cells.push(cellIndex);
  }
  return cells;
}

function submitWordForNick(room, { roundId, word, path, nick }) {
  if (!room) return { ok: false, error: "invalid_room" };
  if (!room.currentRound || room.currentRound.id !== roundId) {
    return { ok: false, error: "round_invalid" };
  }

  const playerEntry = nick ? findPlayerByNick(room, nick) : null;
  const resolvedNick = playerEntry?.player?.nick || nick;
  if (!resolvedNick) {
    return { ok: false, error: "not_logged_in" };
  }

  if (!word || typeof word !== "string") {
    return { ok: false, error: "empty_word" };
  }

  const normInput = normalizeWord(word);
  if (!normInput || normInput.length < 3) {
    return { ok: false, error: "invalid_word" };
  }

  const roundSpecialType = room.currentRound?.special?.type;
  const isTargetRound = roundSpecialType === "target_long" || roundSpecialType === "target_score";
  if (roundSpecialType === "target_long" || roundSpecialType === "target_score") {
    if (room.currentRound?.targetFoundAt?.has?.(resolvedNick)) {
      return { ok: false, error: "already_found" };
    }
    const target = room.currentRound?.targetWord;
    if (!target || typeof target !== "string") {
      return { ok: false, error: "invalid_word" };
    }
    if (normInput !== target) {
      return { ok: false, error: "not_target" };
    }
  }

  const safePath =
    Array.isArray(path) && path.length > 0 && path.every((idx) => Number.isInteger(idx))
      ? path
      : null;
  if (!safePath) return { ok: false, error: "missing_path" };

  const scored = scoreWordOnGridWithPath(
    normInput,
    room.currentRound.grid,
    safePath,
    getSpecialScoreConfig(room.currentRound)
  );
  if (!scored) return { ok: false, error: "invalid_word" };

  const { norm, pts, path: scoredPath } = scored;
  const len = norm.length;
  const wordPts = computeWordScoreForRound(room.currentRound, norm, scoredPath, pts);

  const roundSubs = room.submissions.get(roundId);
  if (!roundSubs) {
    return { ok: false, error: "no_round_subs" };
  }

  let data = roundSubs.get(resolvedNick);
  if (!data) {
    data = { words: new Set(), score: 0, wordTimes: new Map() };
    roundSubs.set(resolvedNick, data);
  }

  if (data.words.has(norm)) {
    return { ok: false, error: "already_played" };
  }

  data.words.add(norm);
  if (!data.wordTimes) data.wordTimes = new Map();
  if (!data.wordTimes.has(norm)) data.wordTimes.set(norm, Date.now());
  data.score += wordPts;

  const playerObj = playerEntry?.player || null;
  const playerKey = getMedalKeyForPlayer(playerObj) || getMedalKeyForNick(resolvedNick);
  const isBotPlayer = isBotToken(playerObj?.token);
  if (!isBotPlayer && playerKey && !isTargetRound) {
    const achievedAt = Date.now();
    recordBestWord(playerKey, resolvedNick, norm, wordPts, achievedAt);
    recordLongestWord(playerKey, resolvedNick, norm, len, achievedAt);
    recordBestRoundScore(playerKey, resolvedNick, data.score, `${room.id}#${roundId}`, achievedAt);
  }

  // Records du mini-tournoi
  const t = room.tournament;
  const tRound = room.currentRound?.tournamentRound || null;
  if (t && tRound) {
    const bestWord = t.records?.bestWord;
    if (bestWord && typeof wordPts === "number" && wordPts > (bestWord.pts || 0)) {
      t.records.bestWord = { pts: wordPts, nick: resolvedNick, word: norm, round: tRound };
    }

    const longestWord = t.records?.longestWord;
    if (longestWord && typeof len === "number" && len > (longestWord.len || 0)) {
      t.records.longestWord = { len, nick: resolvedNick, word: norm, round: tRound };
    }
  }

  function awardGobble(kind) {
    if (!room.currentRound) return;
    if (!resolvedNick) return;
    const specialType = room.currentRound?.special?.type;
    if (
      specialType === "target_long" ||
      specialType === "target_score" ||
      specialType === "speed" ||
      specialType === "monstrous"
    ) {
      return;
    }
    if (!room.currentRound.gobbles) room.currentRound.gobbles = new Map();
    if (!room.currentRound.gobbleFlags) room.currentRound.gobbleFlags = new Map();

    const flags = room.currentRound.gobbleFlags.get(resolvedNick) || {
      score: false,
      len: false,
    };
    if (flags[kind]) return;

    const currentCount = room.currentRound.gobbles.get(resolvedNick) || 0;
    if (currentCount >= 2) return; // max 2 gobbles par manche

    flags[kind] = true;
    room.currentRound.gobbleFlags.set(resolvedNick, flags);
    room.currentRound.gobbles.set(resolvedNick, currentCount + 1);
  }

  const isSpeedRound = room.currentRound?.special?.type === "speed";
  const isBonusLetterRound = room.currentRound?.special?.type === "bonus_letter";
  const maxLenPossible = room.bestPossibleStats.maxLen || 0;
  const maxPtsPossible = room.bestPossibleStats.maxPts || 0;
  const isMaxPossibleLen = maxLenPossible > 0 && len === maxLenPossible;
  const isMaxPossiblePts = maxPtsPossible > 0 && wordPts === maxPtsPossible;

  // Manche "cible" : si on trouve le mot secret, on annonce + voile "bravo" (sans points bonus)
  const specialType = room.currentRound?.special?.type;
  const targetWord = room.currentRound?.targetWord;
  if (
    (specialType === "target_long" || specialType === "target_score") &&
    typeof targetWord === "string" &&
    targetWord &&
    norm === targetWord
  ) {
    if (!room.currentRound.targetFoundAt) room.currentRound.targetFoundAt = new Map();
    if (!room.currentRound.targetFoundAt.has(resolvedNick)) {
      room.currentRound.targetFoundAt.set(resolvedNick, Date.now());
      pushAnnouncement(room, {
        type: "special_target_found",
        nick: resolvedNick,
        text: `${resolvedNick} a trouvé !`,
      });
      io.to(room.id).emit("specialSolved", {
        roomId: room.id,
        roundId,
        nick: resolvedNick,
        kind: specialType,
      });
      if (!isBotPlayer && playerKey) {
        const startedAt =
          (room.currentRound.endsAt || Date.now()) -
          (room.currentRound.durationMs || room.config.durationMs || 0);
        const foundAt = room.currentRound.targetFoundAt.get(resolvedNick);
        const elapsed = Math.max(0, (foundAt || Date.now()) - startedAt);
        recordBestTargetTime(
          specialType,
          playerKey,
          resolvedNick,
          elapsed,
          targetWord,
          foundAt || Date.now()
        );
      }
    }
  }

  if (isTargetRound) {
    return { ok: true, score: data.score, wordScore: wordPts };
  }

  if (!isSpeedRound && isMaxPossiblePts) {
    if (!room.bestPossibleScoreRecord.players.has(resolvedNick)) {
      room.bestPossibleScoreRecord.players.add(resolvedNick);
      room.bestPossibleScoreRecord.pts = maxPtsPossible;
      room.bestScoreRecord.pts = Math.max(room.bestScoreRecord.pts, wordPts);
      room.bestScoreRecord.players.add(resolvedNick);
      awardGobble("score");
      pushAnnouncement(room, {
        type: "best_possible_score",
        nick: resolvedNick,
        pts: wordPts,
        word: norm,
        text: `${resolvedNick} a trouvé le meilleur mot possible (${wordPts} pts)`,
      });
    }
  } else if (!isSpeedRound && wordPts >= MIN_BIG_WORD) {
    if (wordPts > room.bestScoreRecord.pts) {
      room.bestScoreRecord = { pts: wordPts, players: new Set([resolvedNick]) };
      pushAnnouncement(room, {
        type: "big_word",
        nick: resolvedNick,
        pts: wordPts,
        word: norm,
        text: `${resolvedNick} a battu le record de mot avec (${wordPts} pts)`,
      });
    } else if (
      wordPts === room.bestScoreRecord.pts &&
      !room.bestScoreRecord.players.has(resolvedNick)
    ) {
      room.bestScoreRecord.players.add(resolvedNick);
      // égalisation seulement si on n'a pas atteint le superlatif possible
      if (!isMaxPossiblePts) {
        pushAnnouncement(room, {
          type: "big_word",
          nick: resolvedNick,
          pts: wordPts,
          word: norm,
          text: `${resolvedNick} egalise le meilleur mot avec (${wordPts} pts)`,
        });
      }
    }
  }

  if (
    !isSpeedRound &&
    isMaxPossibleLen &&
    !room.longestPossibleRecord.players.has(resolvedNick)
  ) {
    room.longestPossibleRecord.players.add(resolvedNick);
    awardGobble("len");
    pushAnnouncement(room, {
      type: "longest_possible",
      nick: resolvedNick,
      len,
      word: norm,
      text: `${resolvedNick} a trouve le mot le plus long (${len} lettres)`,
    });
  } else if (!isSpeedRound && len >= MIN_LONG_WORD) {
    if (len > room.bestLengthRecord.len) {
      room.bestLengthRecord = { len, players: new Set([resolvedNick]) };
      pushAnnouncement(room, {
        type: "long_word",
        nick: resolvedNick,
        len,
        word: norm,
        text: `${resolvedNick} a battu le record de longueur (${len} lettres)`,
      });
    } else if (
      len === room.bestLengthRecord.len &&
      !room.bestLengthRecord.players.has(resolvedNick)
    ) {
      room.bestLengthRecord.players.add(resolvedNick);
      pushAnnouncement(room, {
        type: "long_word",
        nick: resolvedNick,
        len,
        word: norm,
        text: `${resolvedNick} egalise le mot le plus long (${len} lettres)`,
      });
    }
  }

  const ranking = getFullRanking(room);
  if (ranking.length >= 2) {
    const [a, b] = ranking;
    const diff = Math.abs((a.score || 0) - (b.score || 0));
    if (
      !room.closeFightAnnounced &&
      Number.isFinite(diff) &&
      diff < 10 &&
      (a.score || 0) >= 5 &&
      (b.score || 0) >= 5
    ) {
      room.closeFightAnnounced = true;
      pushAnnouncement(room, {
        type: "duel",
        nickA: a.nick,
        nickB: b.nick,
        diff,
        text: `${a.nick} et ${b.nick} sont au coude a coude (ecart ${diff} pts)`,
      });
    }
  }

  broadcastProvisionalRanking(room);

  return { ok: true, score: data.score, wordScore: wordPts };
}

function analyzeGridQuality(grid, minWords = 0, opts = {}) {
  if (!dictionary) {
    return {
      ok: minWords <= 0,
      words: 0,
      maxLen: 0,
      maxPts: 0,
      totalPts: 0,
      longWords: 0,
    };
  }

  const solved = solveGridCached(grid, dictionary);
  let maxLen = 0;
  let maxPts = 0;
  let totalPts = 0;
  let longWords = 0;
  const minLongWordLen = Math.max(0, opts?.minLongWordLen || 0);

  for (const [word, data] of solved.entries()) {
    const len = word.length;
    const pts = data?.pts || 0;
    if (len > maxLen) maxLen = len;
    if (pts > maxPts) maxPts = pts;
    totalPts += pts;
    if (minLongWordLen > 0 && len >= minLongWordLen) {
      longWords++;
    }
  }

  return {
    ok: minWords <= 0 || solved.size >= minWords,
    words: solved.size,
    maxLen,
    maxPts,
    totalPts,
    longWords,
  };
}

const PARIS_TZ = "Europe/Paris";

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

function getNextMidnightTs(now = Date.now()) {
  const parts = getParisParts(new Date(now));
  const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  utcDate.setUTCDate(utcDate.getUTCDate() + 1);
  return getParisMidnightTs(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  );
}

function getMedalKeyForInstallId(installId) {
  const key = normalizeInstallId(installId);
  return key ? `install:${key}` : null;
}

function getMedalKeyForNick(nick) {
  const clean = typeof nick === "string" ? nick.trim() : "";
  return clean ? `nick:${clean}` : null;
}

function getMedalKeyForPlayer(player) {
  return getMedalKeyForInstallId(player?.installId) || getMedalKeyForNick(player?.nick);
}

function getMedalKeyForNickLookup(room, nick) {
  if (!room || !nick) return null;
  for (const p of room.players.values()) {
    if (p.nick === nick) {
      return getMedalKeyForInstallId(p.installId) || getMedalKeyForNick(p.nick);
    }
  }
  return getMedalKeyForNick(nick);
}

function getInstallIdForNick(room, nick) {
  if (!room || !nick) return null;
  const cached = room.nickToInstallId?.get(nick);
  if (cached) return normalizeInstallId(cached);
  for (const p of room.players.values()) {
    if (p.nick === nick) {
      const normalized = normalizeInstallId(p.installId);
      if (normalized && room.nickToInstallId) {
        room.nickToInstallId.set(nick, normalized);
      }
      return normalized;
    }
  }
  return null;
}

function prefetchDefinitionForWord(rawWord) {
  const { word } = sanitizeDefineWord(rawWord);
  if (!word) return;
  if (peekDefinitionCache(word)) return;
  const run = () => {
    getDefinition(word, { timeoutMs: 1200, skipCache: false }).catch(() => {});
  };
  if (typeof setImmediate === "function") {
    setImmediate(run);
  } else {
    setTimeout(run, 0);
  }
}

function computeRoundWordLeaders(round, results) {
  if (!round || !Array.isArray(results)) return null;
  const board = round.grid;
  if (!board || board.length === 0) return null;
  const scoreConfig = getSpecialScoreConfig(round);

  let bestPts = -Infinity;
  let bestWord = null;
  const bestScoreNicks = new Set();
  let maxLen = 0;
  let longestWord = null;
  const longestWordNicks = new Set();

  for (const entry of results) {
    const words = Array.isArray(entry.words) ? entry.words : [];
    for (const raw of words) {
      const scored = scoreWordOnGrid(raw, board, scoreConfig);
      if (!scored) continue;
      const pts = computeWordScoreForRound(round, scored.norm, scored.path, scored.pts);
      const wordTs =
        entry.wordTimes && Number.isFinite(entry.wordTimes[scored.norm])
          ? entry.wordTimes[scored.norm]
          : null;
      if (pts > bestPts) {
        bestPts = pts;
        bestWord = { word: raw, pts, nick: entry.nick, ts: wordTs };
        bestScoreNicks.clear();
        if (entry.nick) bestScoreNicks.add(entry.nick);
      } else if (
        pts === bestPts &&
        wordTs != null &&
        (!bestWord || !Number.isFinite(bestWord.ts) || wordTs < bestWord.ts)
      ) {
        bestWord = { word: raw, pts, nick: entry.nick, ts: wordTs };
      } else if (pts === bestPts && entry.nick) {
        bestScoreNicks.add(entry.nick);
      }

      const len = scored.norm.length;
      if (len > maxLen) {
        maxLen = len;
        longestWord = { word: raw, len, nick: entry.nick, ts: wordTs };
        longestWordNicks.clear();
        if (entry.nick) longestWordNicks.add(entry.nick);
      } else if (
        len === maxLen &&
        wordTs != null &&
        (!longestWord || !Number.isFinite(longestWord.ts) || wordTs < longestWord.ts)
      ) {
        longestWord = { word: raw, len, nick: entry.nick, ts: wordTs };
      } else if (len === maxLen && entry.nick) {
        longestWordNicks.add(entry.nick);
      }
    }
  }

  if (bestPts === -Infinity && maxLen === 0) return null;
  return { bestWord, longestWord, bestScoreNicks, longestWordNicks };
}

function assignSpecialGobblesFromResults(room, results) {
  const specialType = room?.currentRound?.special?.type;
  if (specialType !== "speed" && specialType !== "monstrous") return;
  const leaders = computeRoundWordLeaders(room.currentRound, results);
  if (!leaders) return;

  const gobbles = new Map();
  const addGobble = (nick) => {
    if (!nick) return;
    const current = gobbles.get(nick) || 0;
    if (current >= 2) return;
    gobbles.set(nick, current + 1);
  };

  if (specialType === "monstrous") {
    leaders.bestScoreNicks.forEach((nick) => addGobble(nick));
  }
  leaders.longestWordNicks.forEach((nick) => addGobble(nick));

  room.currentRound.gobbles = gobbles;
}

function queueDefinitionPrefetch(room, results, targetSummary, roundOverride = null) {
  const round = roundOverride || room?.currentRound;
  if (!round) return;
  const specialType = round.special?.type;
  const isTargetRound = specialType === "target_long" || specialType === "target_score";
  const words = new Set();

  if (isTargetRound) {
    const target = targetSummary?.word || round.targetWord;
    if (target) words.add(target);
  } else {
    const leaders = computeRoundWordLeaders(round, results);
    if (leaders?.longestWord?.word) words.add(leaders.longestWord.word);
    if (specialType !== "speed" && leaders?.bestWord?.word) {
      words.add(leaders.bestWord.word);
    }
  }

  if (!words.size) return;
  setTimeout(() => {
    for (const word of words) {
      prefetchDefinitionForWord(word);
    }
  }, 0);
}

function planNeedsPreparedGrid(plan) {
  return (
    plan?.type === "target_long" ||
    plan?.type === "target_score" ||
    plan?.type === "bonus_letter"
  );
}

function shouldPrecomputePlan(plan) {
  return !!plan;
}

async function runBreakPrecomputeSequence(
  room,
  endedRoundSnapshot,
  results,
  targetSummary,
  nextPlan,
  nextRoundNumber
) {
  if (!room || !endedRoundSnapshot) return;
  const { grid, special } = endedRoundSnapshot;
  queueDefinitionPrefetch(room, results, targetSummary, endedRoundSnapshot);
  if (Array.isArray(grid) && grid.length > 0) {
    try {
      const scoreConfig = getSpecialScoreConfigFromPlan(special);
      const analysis = await computePool.analyzeGrid({
        grid,
        roundPlan: special,
        roomConfig: room.config,
        scoreConfig,
      });
      room.lastRoundQuality = analysis?.quality || null;
    } catch (err) {
      console.warn(
        `[${room.id}] Failed to analyze finished round:`,
        err?.message || err
      );
    }
  }

  if (
    shouldPrecomputePlan(nextPlan) &&
    !(room.nextPreparedGrid && room.nextPreparedGrid.roundNumber === nextRoundNumber)
  ) {
    try {
      await prepareNextGrid(room, nextPlan, nextRoundNumber);
    } catch (err) {
      console.warn(
        `[${room.id}] Failed to prepare next grid during break:`,
        err?.message || err
      );
    }
  }
}

function scheduleBreakPrecompute(
  room,
  endedRoundSnapshot,
  results,
  targetSummary,
  nextPlan,
  nextRoundNumber
) {
  setTimeout(() => {
    runBreakPrecomputeSequence(
      room,
      endedRoundSnapshot,
      results,
      targetSummary,
      nextPlan,
      nextRoundNumber
    ).catch((err) => {
      console.warn(
        `[${room?.id || "room"}] Break precompute sequence failed:`,
        err?.message || err
      );
    });
  }, 0);
}

function pruneRoomState(room) {
  if (!room) return;
  if (room.submissions instanceof Map) {
    while (room.submissions.size > 2) {
      const oldest = room.submissions.keys().next().value;
      if (oldest === undefined) break;
      room.submissions.delete(oldest);
    }
  }
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

async function prepareNextGrid(room, plan = null, targetRoundNumber = null) {
  const roundNumber = targetRoundNumber || (room.roundCounter || 0) + 1;
  const roundPlan = plan || getRoundPlan(roundNumber, room.config);

  try {
    const result = await computePool.prepareNextGrid({
      roomConfig: room.config,
      roundPlan,
      roundNumber,
    });
    const prepared = result || null;
    room.nextPreparedGrid = prepared
      ? { ...prepared, plan: prepared.plan || roundPlan, roundNumber }
      : null;

    if (
      prepared?.targetWord &&
      (roundPlan.type === "target_long" || roundPlan.type === "target_score")
    ) {
      setTimeout(() => {
        prefetchDefinitionForWord(prepared.targetWord);
      }, 0);
    }

    return room.nextPreparedGrid;
  } catch (err) {
    console.warn(
      '[' + (room?.id || "room") + '] Failed to prepare grid in worker:',
      err?.message || err
    );
    return null;
  }
}


function resetRoomRecords(room) {
  room.bestScoreRecord = { pts: 0, players: new Set() };
  room.bestLengthRecord = { len: 0, players: new Set() };
  room.longestPossibleRecord = { len: 0, players: new Set() };
  room.bestPossibleScoreRecord = { pts: 0, players: new Set() };
  room.bestPossibleStats = { maxLen: 0, maxPts: 0 };
  room.closeFightAnnounced = false;
  room.finalFightScheduled = null;
  room.endSoonTimeout = null;
}

async function startRoundForRoom(room) {
  if (!room) return;
  room.breakState = null;

  if (room.currentRound?.timers) {
    room.currentRound.timers.forEach((t) => clearTimeout(t));
  }
  if (room.endSoonTimeout) clearTimeout(room.endSoonTimeout);
  if (room.finalFightScheduled) clearTimeout(room.finalFightScheduled);

  const roundNumber = (room.roundCounter || 0) + 1;

  if (!room.tournament) {
    resetTournament(room);
  }
  let tournamentRound = (room.tournament.currentRound || 0) + 1;
  if (tournamentRound > (room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS)) {
    resetTournament(room);
    tournamentRound = 1;
  }

  const tournamentPlan = getTournamentRoundPlan(room, tournamentRound);
  const cached = room.nextPreparedGrid?.roundNumber === roundNumber ? room.nextPreparedGrid : null;
  if (room.nextPreparedGrid?.roundNumber === roundNumber) {
    room.nextPreparedGrid = null;
  }
  let prepared = cached;
  let planUsed = prepared?.plan || tournamentPlan;
  if (!prepared && planNeedsPreparedGrid(planUsed)) {
    console.warn(
      `[${room.id}] Prepared grid missing for ${planUsed.type}; falling back to base plan.`
    );
    planUsed = buildBaseTournamentPlan(tournamentRound, room.config);
  }
  let grid = prepared?.grid || generateGrid(room.config.gridSize);
  if (!prepared && planUsed?.type === "speed") {
    grid = grid.map((cell) => ({ ...cell, bonus: null }));
  }
  const quality = prepared?.quality || null;
  const now = Date.now();
  const roundId = now;
  const roundDurationMs =
    planUsed?.type === "target_long" || planUsed?.type === "target_score"
      ? 90 * 1000
      : room.config.durationMs;

  if (botManager?.refreshPresenceForRoom) {
    botManager.refreshPresenceForRoom(room);
  }

  room.currentRound = {
    id: roundId,
    grid,
    endsAt: now + roundDurationMs,
    durationMs: roundDurationMs,
    status: "running",
    timers: [],
    special: planUsed,
    quality,
    roundNumber,
    tournamentId: room.tournament.id,
    tournamentRound,
    targetWord: prepared?.targetWord || null,
    targetLength: prepared?.targetLength || null,
    targetPath: prepared?.targetPath || null,
    targetWordCellMap: null,
    targetRevealed: new Set(),
    targetSolvedBy: null,
    gobbles: new Map(),
    gobbleFlags: new Map(),
  };

  const roundSubs = new Map();
  for (const p of room.players.values()) {
    if (!isPlayerConnected(p) && !isBotToken(p?.token)) continue;
    roundSubs.set(p.nick, { words: new Set(), score: 0, wordTimes: new Map() });
  }
  room.submissions.set(roundId, roundSubs);
  pruneRoomState(room);

  resetRoomRecords(room);
  room.roundCounter = roundNumber;
  room.tournament.currentRound = tournamentRound;
  let bestPossibleStats =
    quality && dictionary
      ? {
          maxLen: quality.maxLen || 0,
          maxPts: planUsed?.fixedWordScore || quality.maxPts || 0,
        }
      : { maxLen: 0, maxPts: 0 };
    if (planUsed?.fixedWordScore) {
      bestPossibleStats.maxPts = planUsed.fixedWordScore;
    }
    if (planUsed?.type === "bonus_letter" && planUsed?.bonusLetter && dictionary) {
      const scoreConfig = getSpecialScoreConfigFromPlan(planUsed);
      const computed = scoreConfig ? computeBestPossible(grid, scoreConfig) : null;
      if (computed && (computed.maxPts > 0 || computed.maxLen > 0)) {
        bestPossibleStats = computed;
      }
    }
    room.bestPossibleStats = bestPossibleStats;

  const nextTournamentRound =
    tournamentRound >= (room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS)
      ? 1
      : tournamentRound + 1;
  const nextPlan =
    nextTournamentRound === 1 && tournamentRound >= (room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS)
      ? buildBaseTournamentPlan(1, room.config)
      : getTournamentRoundPlan(room, nextTournamentRound);

  console.log(
    `[${room.id}] Nouvelle manche ${planUsed?.isSpecial ? "(speciale)" : ""}`,
    roundId,
    planUsed?.label || ""
  );

  io.to(room.id).emit("roundStarted", {
    roomId: room.id,
    roundId,
    grid,
    gridSize: room.config.gridSize,
    durationMs: room.currentRound.durationMs,
    endsAt: room.currentRound.endsAt,
    targetLength: room.currentRound.targetLength || null,
    special: planUsed?.isSpecial ? planUsed : null,
    gridQuality: quality
      ? {
          words: quality.words ?? 0,
          maxLen: quality.maxLen ?? 0,
          maxPts:
            planUsed?.type === "bonus_letter"
              ? room.bestPossibleStats.maxPts || 0
              : planUsed?.fixedWordScore || quality.maxPts || 0,
          totalPts: quality.totalPts ?? 0,
          possibleScore: quality.possibleScore ?? quality.totalPts ?? 0,
          longWords: quality.longWords ?? 0,
        }
      : null,
    roundNumber,
    tournament: {
      id: room.tournament.id,
      round: tournamentRound,
      totalRounds: room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS,
      isFinalRound: tournamentRound === (room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS),
      nextRound: nextTournamentRound,
      nextStartsNewTournament:
        tournamentRound === (room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS),
    },
    nextSpecial: nextPlan?.isSpecial ? nextPlan : null,
  });

  broadcastProvisionalRanking(room);

  // IMPORTANT: doit venir APRES "roundStarted", car le client purge son flux a la reception.
  if (
    nextPlan?.isSpecial &&
    !planUsed?.isSpecial &&
    room.specialWarningIssuedFor !== `${room.tournament.id}:${nextPlan.roundNumber}`
  ) {
    const warnText = buildSpecialWarning(nextPlan);
    if (warnText) {
      pushAnnouncement(room, { type: "special_warning", text: warnText });
      room.specialWarningIssuedFor = `${room.tournament.id}:${nextPlan.roundNumber}`;
    }
  }

  if (planUsed?.isSpecial) {
    const specialText =
      planUsed.type === "speed"
        ? `MANCHE SPECIALE : ${planUsed.label} - tous les mots valent ${planUsed.fixedWordScore} pts`
        : planUsed.type === "monstrous"
        ? `MANCHE SPECIALE : ${planUsed.label} - gros potentiel de points et de mots longs`
        : planUsed.type === "target_long"
        ? `MANCHE SPECIALE : ${planUsed.label} - objectif: trouver le mot le plus long`
        : planUsed.type === "target_score"
        ? `MANCHE SPECIALE : ${planUsed.label} - objectif: trouver le mot qui rapporte le plus de points`
        : `MANCHE SPECIALE : ${planUsed.label}`;
    pushAnnouncement(room, { type: "special_start", text: specialText });
  }

  // SystÃ¨me d'indices pour les manches "cible"
  if (
    planUsed?.isSpecial &&
    (planUsed.type === "target_long" || planUsed.type === "target_score") &&
    typeof room.currentRound.targetWord === "string" &&
    room.currentRound.targetWord
  ) {
    pushAnnouncement(room, {
      type: "special_hint_soon",
      text: `Indice dans ${TARGET_HINT_FIRST_MS / 1000} secondes...`,
    });

    const emitHint = () => {
      if (!room.currentRound || room.currentRound.id !== roundId) return;
      const word = room.currentRound.targetWord || "";
      const revealed = room.currentRound.targetRevealed || new Set();
      if (revealed.size === 0 && word) {
        const idx = Math.floor(Math.random() * word.length);
        revealed.add(idx);
        room.currentRound.targetRevealed = revealed;
      }
      const chars = word.split("");
      const pattern = chars
        .map((ch, idx) => (revealed.has(idx) ? ch.toUpperCase() : "_"))
        .join(" ");
      const revealCells = resolveTargetHintCells(room, Array.from(revealed));
      io.to(room.id).emit("specialHint", {
        roomId: room.id,
        roundId,
        kind: planUsed.type,
        length: chars.length,
        pattern,
        revealCells,
      });
    };

    room.currentRound.timers.push(setTimeout(emitHint, TARGET_HINT_FIRST_MS));

    // À partir de 40s : révèle 1 lettre toutes les 20s
    for (
      let tMs = TARGET_HINT_FIRST_MS + TARGET_HINT_STEP_MS;
      tMs < roundDurationMs;
      tMs += TARGET_HINT_STEP_MS
    ) {
      room.currentRound.timers.push(
        setTimeout(() => {
          if (!room.currentRound || room.currentRound.id !== roundId) return;
          const word = room.currentRound.targetWord || "";
          const chars = word.split("");
          const revealed = room.currentRound.targetRevealed || new Set();
          if (revealed.size >= chars.length) return;

          const remaining = [];
          for (let i = 0; i < chars.length; i++) {
            if (!revealed.has(i)) remaining.push(i);
          }
          if (!remaining.length) return;
          const idx = remaining[Math.floor(Math.random() * remaining.length)];
          revealed.add(idx);
          room.currentRound.targetRevealed = revealed;
          emitHint();
        }, tMs)
      );
    }
  }

  if (botManager?.onRoundStart) {
    const botKickoffRoundId = roundId;
    const kickoff = setTimeout(() => {
      if (!room.currentRound || room.currentRound.id !== botKickoffRoundId) return;
      botManager.onRoundStart(room);
    }, 1500);
    room.currentRound.timers.push(kickoff);
  }

  room.endSoonTimeout = setTimeout(() => {
    pushAnnouncement(room, {
      type: "timer",
      text: "Il ne reste plus que 30 secondes !",
    });
  }, Math.max(0, roundDurationMs - 30 * 1000));

  room.finalFightScheduled = setTimeout(() => {
    const ranking = getFullRanking(room);
    if (ranking.length >= 2) {
      const [a, b] = ranking;
      const diff = Math.abs((a.score || 0) - (b.score || 0));
      if (diff <= 50 && (a.score || 0) > 0 && (b.score || 0) > 0) {
        pushAnnouncement(room, {
          type: "duel",
          nickA: a.nick,
          nickB: b.nick,
          diff,
          text: `${a.nick} et ${b.nick} se bataillent pour la victoire !`,
        });
      }
    }
  }, Math.max(0, roundDurationMs - 20 * 1000));

  room.currentRound.timers.push(
    setTimeout(() => {
      endRoundForRoom(room).catch((err) =>
        console.warn("endRoundForRoom failed", err)
      );
    }, roundDurationMs)
  );
}

async function endRoundForRoom(room) {
  if (!room || !room.currentRound || room.currentRound.status !== "running") return;
  if (room.currentRound.timers) {
    room.currentRound.timers.forEach((t) => clearTimeout(t));
  }
  if (room.endSoonTimeout) clearTimeout(room.endSoonTimeout);
  if (room.finalFightScheduled) clearTimeout(room.finalFightScheduled);
  if (botManager?.onRoundEnd) {
    botManager.onRoundEnd(room);
  }

  room.currentRound.status = "finished";

  const roundSubs = room.submissions.get(room.currentRound.id) || new Map();
  const results = [];
  const specialType = room.currentRound?.special?.type;
  const isTargetRound = specialType === "target_long" || specialType === "target_score";
  let targetPointsMultiplier = 1;
  let targetSummary = null;

  for (const player of room.players.values()) {
    const connected = isPlayerConnected(player) || isBotToken(player?.token);
    if (!connected) continue;
    if (!roundSubs.has(player.nick)) {
      roundSubs.set(player.nick, { words: new Set(), score: 0, wordTimes: new Map() });
    }
  }

  for (const [nick, data] of roundSubs.entries()) {
    const lookup = findPlayerByNick(room, nick);
    const player = lookup?.player || null;
    const connected = isPlayerConnected(player) || isBotNick(room, nick);
    const participated = hasPlayerActivity(data);
    if (!connected && !participated) {
      continue;
    }
    const rawWords = Array.from(data.words || []);
    const wordTimes =
      data.wordTimes instanceof Map ? Object.fromEntries(data.wordTimes.entries()) : {};
    const uniqueWords = Array.from(
      new Set(
        rawWords
          .map((word) => normalizeWord(word))
          .filter((word) => typeof word === "string" && word)
      )
    );
    results.push({
      nick,
      score: data.score,
      words: rawWords,
      wordTimes,
      uniqueWords,
      newVocabWords: [],
      isBot: isBotNick(room, nick),
      connected,
      participated,
    });
  }

  const endedAt = room.currentRound.endsAt || Date.now();
  const resultsByNick = new Map(results.map((entry) => [entry.nick, entry]));
  const vocabEntries = [];
  const vocabLookups = [];
  for (const entry of results) {
    if (entry.isBot) continue;
    const installId = getInstallIdForNick(room, entry.nick);
    if (!installId) continue;
    const words = Array.isArray(entry.uniqueWords) ? entry.uniqueWords : [];
    if (!words.length) continue;
    vocabEntries.push({ installId, words, ts: endedAt, nick: entry.nick });
    vocabLookups.push({ installId, words, nick: entry.nick });
  }
  if (vocabLookups.length) {
    for (const lookup of vocabLookups) {
      const knownWords = await getKnownVocabWords(lookup.installId, lookup.words);
      const newVocabWords = lookup.words.filter((word) => !knownWords.has(word));
      const resultEntry = resultsByNick.get(lookup.nick);
      if (resultEntry) {
        resultEntry.newVocabWords = newVocabWords;
      }
    }
  }
  let vocabSummary = {};
  if (vocabEntries.length) {
    try {
      vocabSummary = await recordVocabularyBatch(vocabEntries);
    } catch (err) {
      console.warn("Vocabulary batch failed", err);
    }
  }
  if (vocabEntries.length && vocabSummary && typeof vocabSummary === "object") {
    for (const entry of vocabEntries) {
      const summary = vocabSummary[entry.installId];
      if (!summary) continue;
      const playerKey = getMedalKeyForNickLookup(room, entry.nick);
      if (!playerKey) continue;
      if (Number.isFinite(summary.total)) {
        recordVocabCount(playerKey, entry.nick, summary.total, endedAt);
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  assignSpecialGobblesFromResults(room, results);

  const roundId = room.currentRound.id ? `${room.id}#${room.currentRound.id}` : `${room.id}#${Date.now()}`;
  const roundGobbles = room.currentRound.gobbles || new Map();
  const targetFoundAt = room.currentRound.targetFoundAt || new Map();
  const targetScoreForWeekly = 500;
  for (const entry of results) {
    if (entry.isBot) continue;
    if (!entry.participated) continue;
    const playerKey = getMedalKeyForNickLookup(room, entry.nick);
    if (!playerKey) continue;
    const wordsCount = Array.isArray(entry.words) ? entry.words.length : 0;
    recordMostWordsInGame(playerKey, entry.nick, wordsCount, roundId, endedAt);
    recordBestRoundScore(playerKey, entry.nick, entry.score, roundId, endedAt);
    const weeklyScoreToAdd = isTargetRound
      ? targetFoundAt.has(entry.nick)
        ? targetScoreForWeekly
        : 0
      : entry.score;
    recordTotalScore(playerKey, entry.nick, weeklyScoreToAdd, endedAt);
    const gobblesEarned = roundGobbles.get(entry.nick) || 0;
    if (gobblesEarned > 0) {
      recordMostGobbles(playerKey, entry.nick, gobblesEarned, endedAt);
    }
  }

  console.log(`[${room.id}] Manche terminée`, room.currentRound.id, "Résultats:", results);

  // --- Mini-tournoi : attribution points & finale ---
  const tournamentRound = room.currentRound.tournamentRound || 1;
  const tournamentId = room.currentRound.tournamentId || room.tournament?.id || null;
  const t = room.tournament;
  const roundAwarded = new Map(); // nick -> { points, gobbles, total }

  if (t && tournamentId && t.id === tournamentId) {
    const isFinalRound = tournamentRound === (t.totalRounds || TOURNAMENT_TOTAL_ROUNDS);
    const pointsMultiplier = isFinalRound ? 2 : 1;
    targetPointsMultiplier = pointsMultiplier;
    for (const entry of results) {
      if (!t.totals.has(entry.nick)) t.totals.set(entry.nick, { points: 0, gobbles: 0 });
    }

    if (isTargetRound) {
      const foundAt = room.currentRound.targetFoundAt || new Map();
      const foundOrder = Array.from(foundAt.entries())
        .map(([nick, ts]) => ({ nick, ts }))
        .sort((a, b) => {
          const d = (a.ts || 0) - (b.ts || 0);
          if (d !== 0) return d;
          return (a.nick || "").localeCompare(b.nick || "");
        })
        .map((e) => e.nick);

      for (let pos = 1; pos <= foundOrder.length; pos++) {
        const nick = foundOrder[pos - 1];
        const basePts = (TOURNAMENT_POINTS[pos - 1] ?? 0) * pointsMultiplier;
        const gobbles = 0;
        const totalEarned = basePts;
        roundAwarded.set(nick, { points: basePts, gobbles, total: totalEarned });
        t.lastAwarded.set(nick, { points: basePts, gobbles });
        const prev = t.totals.get(nick) || { points: 0, gobbles: 0 };
        t.totals.set(nick, { points: (prev.points || 0) + basePts, gobbles: prev.gobbles || 0 });
      }
    } else {
      let pos = 1;
      for (let i = 0; i < results.length; ) {
        const scoreVal = results[i]?.score ?? 0;
        const tieGroup = [];
        while (i < results.length && (results[i]?.score ?? 0) === scoreVal) {
          tieGroup.push(results[i]);
          i++;
        }

        const basePts = (TOURNAMENT_POINTS[pos - 1] ?? 0) * pointsMultiplier;
        for (const entry of tieGroup) {
          const gobbles = roundGobbles.get(entry.nick) || 0;
          const totalEarned = basePts + gobbles;

          roundAwarded.set(entry.nick, { points: basePts, gobbles, total: totalEarned });
          t.lastAwarded.set(entry.nick, { points: basePts, gobbles });

          const prev = t.totals.get(entry.nick) || { points: 0, gobbles: 0 };
          t.totals.set(entry.nick, {
            points: (prev.points || 0) + basePts,
            gobbles: (prev.gobbles || 0) + gobbles,
          });
        }

        pos += tieGroup.length;
      }
    }

    for (const entry of results) {
      const count = Array.isArray(entry.words) ? entry.words.length : 0;
      if (count > (t.records?.mostWords?.count || 0)) {
        t.records.mostWords = { count, nick: entry.nick, round: tournamentRound };
      }
    }
  }

  if (isTargetRound) {
    const foundAt = room.currentRound.targetFoundAt || new Map();
    const startedAt =
      (room.currentRound.endsAt || Date.now()) -
      (room.currentRound.durationMs || room.config.durationMs || 0);
    const foundList = Array.from(foundAt.entries())
      .map(([nick, ts]) => ({ nick, ts }))
      .sort((a, b) => {
        const d = (a.ts || 0) - (b.ts || 0);
        if (d !== 0) return d;
        return (a.nick || "").localeCompare(b.nick || "");
      });
    const foundOrder = foundList.map((entry) => entry.nick).filter(Boolean);
    targetSummary = {
      word: room.currentRound.targetWord || "",
      foundOrder,
    };
    if (targetSummary.word) {
      const cached = peekDefinitionCache(targetSummary.word);
      const cachedDef = cached?.definition || cached?.extract || "";
      if (cachedDef) {
        targetSummary.definition = cachedDef;
        targetSummary.definitionSource = cached?.source || "";
        targetSummary.definitionUrl = cached?.url || "";
        targetSummary.definitionTitle =
          cached?.title || cached?.word || targetSummary.word;
      }
    }
    const foundMeta = new Map();
    foundList.forEach((entry, idx) => {
      const points = (TOURNAMENT_POINTS[idx] ?? 0) * targetPointsMultiplier;
      foundMeta.set(entry.nick, {
        points,
        ts: entry.ts,
        elapsedMs: Math.max(0, (entry.ts || 0) - startedAt),
      });
    });

    const targetResults = [];
    for (const player of room.players.values()) {
      const connected = isPlayerConnected(player) || isBotToken(player?.token);
      if (!connected) continue;
      const meta = foundMeta.get(player.nick);
      targetResults.push({
        nick: player.nick,
        score: meta ? meta.points : 0,
        words: meta ? [room.currentRound.targetWord || ""] : [],
        targetFoundAt: meta ? meta.ts : null,
        targetFoundMs: meta ? meta.elapsedMs : null,
        isBot: isBotToken(player?.token),
        connected,
        participated: !!meta,
      });
    }

    targetResults.sort((a, b) => {
      const aFound = Number.isFinite(a.targetFoundAt);
      const bFound = Number.isFinite(b.targetFoundAt);
      if (aFound && bFound) {
        const d = a.targetFoundAt - b.targetFoundAt;
        if (d !== 0) return d;
        return (a.nick || "").localeCompare(b.nick || "");
      }
      if (aFound) return -1;
      if (bFound) return 1;
      return (a.nick || "").localeCompare(b.nick || "");
    });

    results.length = 0;
    results.push(...targetResults);
  }

  const endedRoundSnapshot = room.currentRound
    ? {
        grid: room.currentRound.grid,
        special: room.currentRound.special,
        targetWord: room.currentRound.targetWord || null,
      }
    : null;

  let totalRanking = [];
  if (t && tournamentId && t.id === tournamentId) {
    totalRanking = Array.from(t.totals.entries())
      .map(([nick, data]) => {
        const basePoints = data?.points || 0;
        const gobbles = data?.gobbles || 0;
        const points = basePoints + gobbles;
        return { nick, points, basePoints, gobbles, isBot: isBotNick(room, nick) };
      })
      .sort((a, b) => {
        const diff = (b.points || 0) - (a.points || 0);
        if (diff !== 0) return diff;
        const gdiff = (b.gobbles || 0) - (a.gobbles || 0);
        if (gdiff !== 0) return gdiff;
        return (a.nick || "").localeCompare(b.nick || "");
      })
      .map((entry, idx) => {
        const posNow = idx + 1;
        const prevPos = t.prevPositions.get(entry.nick);
        const delta = typeof prevPos === "number" ? prevPos - posNow : 0;
        return { ...entry, pos: posNow, delta };
      });

    t.prevPositions = new Map(totalRanking.map((e) => [e.nick, e.pos]));
  }

  let breakMs = room.config.breakMs;
  let breakKind = "between_rounds";
  let tournamentSummary = null;
  let tournamentSummaryAt = null;

  if (isTargetRound) {
    breakMs = Math.min(breakMs, TARGET_BREAK_DURATION_MS);
  }

  if (t && tournamentRound === (t.totalRounds || TOURNAMENT_TOTAL_ROUNDS)) {
    breakMs = TOURNAMENT_END_TOTAL_BREAK_MS;
    breakKind = "tournament_end";
    tournamentSummaryAt = Date.now() + TOURNAMENT_RESULTS_BREAK_MS;

    const winnerNick = totalRanking[0]?.nick || null;
    const medalWinners = [
      totalRanking[0]?.nick || null,
      totalRanking[1]?.nick || null,
      totalRanking[2]?.nick || null,
    ].filter(Boolean);
    tournamentSummary = {
      id: t.id,
      winnerNick,
      ranking: totalRanking,
      records: t.records,
    };

    try {
      const now = Date.now();
      const participants = totalRanking
        .map((entry, idx) => {
          const rank = Number.isFinite(entry?.pos) ? entry.pos : idx + 1;
          const isBot = entry?.isBot || isBotNick(room, entry?.nick);
          if (isBot) {
            const strength = getBotStrengthForNick(entry?.nick);
            return {
              nick: entry?.nick || "",
              isBot: true,
              botId: entry?.nick || "",
              rank,
              rating: getBotRatingFromStrength(strength),
            };
          }
          const installId = getInstallIdForNick(room, entry?.nick);
          if (!installId) return null;
          return {
            nick: entry?.nick || "",
            installId,
            isBot: false,
            rank,
          };
        })
        .filter(Boolean);
      const trophyUpdates = await updateTrophiesForTournament({
        tournamentId: t.id,
        participants,
        now,
        kBase: TROPHY_K_BASE,
      });
      if (trophyUpdates.length) {
        io.to(room.id).emit("trophiesUpdated", {
          tournamentId: t.id,
          updates: trophyUpdates,
        });
      }
    } catch (err) {
      console.warn(`[${room.id}] Trophy update failed:`, err);
    }

    const medalDelay = Math.max(0, tournamentSummaryAt - Date.now());
    setTimeout(() => {
      if (room.breakState?.breakKind !== "tournament_end") return;
      if (medalWinners[0]) addMedal(room, medalWinners[0], "gold");
      if (medalWinners[1]) addMedal(room, medalWinners[1], "silver");
      if (medalWinners[2]) addMedal(room, medalWinners[2], "bronze");
      emitMedals(room);
    }, medalDelay);

    resetTournament(room);
  }

  const nextRoundNumber = (room.roundCounter || 0) + 1;
  const nextTournamentRoundForBreak = breakKind === "tournament_end" ? 1 : tournamentRound + 1;
  const nextPlanForBreak =
    breakKind === "tournament_end" ? null : getTournamentRoundPlan(room, nextTournamentRoundForBreak);
  const nextPlan = getTournamentRoundPlan(room, nextTournamentRoundForBreak);
  const nextSpecialForBreak = nextPlanForBreak?.isSpecial ? nextPlanForBreak : null;
  const roundEndedPayload = {
    roomId: room.id,
    roundId: room.currentRound.id,
    results,
    tournament: {
      id: tournamentId,
      round: tournamentRound,
      totalRounds: t?.totalRounds || TOURNAMENT_TOTAL_ROUNDS,
      nextRound: nextTournamentRoundForBreak,
      roundAwarded: Object.fromEntries(roundAwarded.entries()),
      totals: t
        ? Object.fromEntries(
            Array.from(t.totals.entries()).map(([nick, data]) => [
              nick,
              { points: data?.points || 0, gobbles: data?.gobbles || 0 },
            ])
          )
        : {},
      ranking: totalRanking,
      breakKind,
    },
    nextSpecial: nextSpecialForBreak,
    tournamentSummary,
    tournamentSummaryAt,
    targetSummary,
  };

  room.lastRoundResults = {
    endedAt: room.currentRound.endsAt || Date.now(),
    round: {
      id: room.currentRound.id,
      grid: room.currentRound.grid,
      gridSize: room.config.gridSize,
      durationMs: room.currentRound.durationMs,
      endsAt: room.currentRound.endsAt,
      roundNumber: room.currentRound.roundNumber,
      special: room.currentRound.special?.isSpecial ? room.currentRound.special : null,
      gridQuality: room.currentRound.quality || null,
    },
    payload: roundEndedPayload,
  };

  io.to(room.id).emit("roundEnded", roundEndedPayload);

  const nextStartAt = Date.now() + breakMs;
  io.to(room.id).emit("breakStarted", {
    roomId: room.id,
    nextStartAt,
    breakKind,
    tournament: {
      id: room.tournament?.id || null,
      round: room.tournament?.currentRound || 0,
      totalRounds: room.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS,
      nextRound: nextTournamentRoundForBreak,
    },
    nextSpecial: nextSpecialForBreak,
    tournamentSummary,
    tournamentSummaryAt,
    targetSummary,
  });
  room.breakState = {
    nextStartAt,
    breakKind,
    tournament: {
      id: room.tournament?.id || null,
      round: room.tournament?.currentRound || 0,
      totalRounds: room.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS,
      nextRound: nextTournamentRoundForBreak,
    },
    nextSpecial: nextSpecialForBreak,
    tournamentSummary,
    tournamentSummaryAt,
    targetSummary,
    lastRoundResults: room.lastRoundResults || null,
  };

  scheduleBreakPrecompute(
    room,
    endedRoundSnapshot,
    results,
    targetSummary,
    nextPlan,
    nextRoundNumber
  );
  setTimeout(() => {
    startRoundForRoom(room).catch((e) => console.warn("startRoundForRoom failed", e));
  }, breakMs);
  pruneRoomState(room);
}

io.on("connection", (socket) => {
  console.log("Client connecté", socket.id);
  emitRoomsStats();

  socket.on("timeSync", (_payload, cb) => {
    cb?.({ ok: true, serverNow: Date.now() });
  });

  socket.on("session:resume", (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const installId = normalizeInstallId(payload?.installId);
    const roomId = payload?.roomId;
    if (!installId || !roomId) {
      cb?.({ ok: false, available: false, error: "invalid_payload" });
      return;
    }
    const room = getRoom(roomId);
    if (!room) {
      cb?.({ ok: false, available: false, error: "invalid_room" });
      return;
    }
    const match = findPlayerByInstallId(room, installId);
    if (!match?.player) {
      cb?.({ ok: true, available: false });
      return;
    }
    const now = Date.now();
    const takeover = !!payload?.takeover;
    let player = match.player;
    if (takeover) {
      if (match.socketId && match.socketId !== socket.id) {
        clearPendingDisconnect(room, match.socketId);
        room.players.delete(match.socketId);
        const oldSocket = io.sockets.sockets.get(match.socketId);
        if (oldSocket) {
          try {
            oldSocket.leave(room.id);
          } catch (_) {}
          oldSocket.disconnect(true);
        }
      }
      player = {
        ...player,
        connected: true,
        lastSeenAt: now,
      };
      room.players.set(socket.id, player);
      room.nickToInstallId.set(player.nick, player.installId || installId);
      void upsertVocabularyProfile(installId, player.nick, now);
      socket.data.installId = installId;
      socket.data.nick = player.nick;
      socket.data.roomId = room.id;
      socket.roomId = room.id;
      socket.join(room.id);
      emitPlayers(room);
      emitMedals(room);
      broadcastProvisionalRanking(room);
      emitRoomsStats();
    }
    const snapshot = buildSessionSnapshot(room, player);
    cb?.({ ok: true, available: true, snapshot });
  });

  socket.on("login", (payload, cb) => {
    const nick = typeof payload === "string" ? payload : payload?.nick;
    const token = typeof payload === "object" ? payload?.clientId : null;
    const installId = normalizeInstallId(
      typeof payload === "object" ? payload?.installId || payload?.clientId : null
    );
    const requestedRoomId =
      typeof payload === "object" && payload?.roomId
        ? payload.roomId
        : "room-4x4";
    const room = getRoom(requestedRoomId);

    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }

    const trimmed = (nick || "").trim();
    if (!trimmed) {
      cb?.({ ok: false, error: "empty_nick" });
      return;
    }

    if (!installId) {
      cb?.({ ok: false, error: "invalid_install_id" });
      return;
    }

    if (trimmed.length > NICK_MAX_LEN) {
      cb?.({ ok: false, error: "nick_too_long" });
      return;
    }

    const now = Date.now();
    let resumeSocketId = null;
    for (const [socketId, p] of room.players.entries()) {
      if (p.nick !== trimmed) continue;
      const sameInstall = normalizeInstallId(p.installId) === installId;
      if (sameInstall) {
        resumeSocketId = socketId;
        break;
      }
      cb?.({ ok: false, error: "pseudo_taken" });
      return;
    }

    if (resumeSocketId) {
      clearPendingDisconnect(room, resumeSocketId);
      room.players.delete(resumeSocketId);
      const oldSocket = io.sockets.sockets.get(resumeSocketId);
      if (oldSocket) {
        try {
          oldSocket.leave(room.id);
        } catch (_) {}
        oldSocket.disconnect(true);
      }
    }

    // Réservation de pseudo désactivée (trop gênant sur mobile lors des retours d'appli)
    cleanupExpiredMedals(room);

    room.players.set(socket.id, {
      nick: trimmed,
      token: token || null,
      installId,
      connected: true,
      lastSeenAt: now,
    });
    room.nickToInstallId.set(trimmed, installId);
    void upsertVocabularyProfile(installId, trimmed, now);
    socket.data.installId = installId;
    socket.data.nick = trimmed;
    socket.data.roomId = room.id;
    socket.roomId = room.id;
    socket.join(room.id);
    console.log("Login:", socket.id, trimmed, "->", room.id);
    appendConnectionLog({
      nick: trimmed,
      roomId: room.id,
      ip: getClientIpFromSocket(socket),
      userAgent: socket?.handshake?.headers?.["user-agent"],
    });
    cb?.({ ok: true, roomId: room.id });

    emitPlayers(room);
    emitMedals(room);
    emitRoomsStats();
    socket.emit("chat:history", room.chatMessages);

    if (room.currentRound && room.currentRound.status === "running") {
      ensurePlayerInRound(room, trimmed);
      const currentQuality = room.currentRound.quality;

      const totalRounds = room.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS;
      const currentTournamentRound = room.currentRound.tournamentRound || 1;
      const nextTournamentRound =
        currentTournamentRound >= totalRounds ? 1 : currentTournamentRound + 1;
      const nextPlan = getTournamentRoundPlan(room, nextTournamentRound);

      socket.emit("roundStarted", {
        roomId: room.id,
        roundId: room.currentRound.id,
        grid: room.currentRound.grid,
        gridSize: room.config.gridSize,
        durationMs: room.currentRound.durationMs,
        endsAt: room.currentRound.endsAt,
        targetLength: room.currentRound.targetLength || null,
        special: room.currentRound.special?.isSpecial ? room.currentRound.special : null,
        gridQuality: currentQuality
          ? {
              words: currentQuality.words ?? 0,
              maxLen: currentQuality.maxLen ?? 0,
              maxPts:
                room.currentRound.special?.fixedWordScore ||
                currentQuality.maxPts ||
                0,
              totalPts: currentQuality.totalPts ?? 0,
              possibleScore: currentQuality.possibleScore ?? currentQuality.totalPts ?? 0,
              longWords: currentQuality.longWords ?? 0,
            }
          : null,
        roundNumber: room.currentRound.roundNumber,
        tournament: {
          id: room.tournament?.id || null,
          round: currentTournamentRound,
          totalRounds,
          isFinalRound: currentTournamentRound === totalRounds,
          nextRound: nextTournamentRound,
          nextStartsNewTournament: currentTournamentRound === totalRounds,
        },
        nextSpecial: nextPlan?.isSpecial ? nextPlan : null,
      });

      // Si on rejoint en cours de manche "cible", renvoyer l'etat courant de l'indice
      // (sinon le joueur ne verra le pattern qu'au hint suivant).
      const specialType = room.currentRound?.special?.type;
      const isTargetRound = specialType === "target_long" || specialType === "target_score";
      if (isTargetRound && typeof room.currentRound.targetWord === "string" && room.currentRound.targetWord) {
        const startedAt =
          (room.currentRound.endsAt || Date.now()) -
          (room.currentRound.durationMs || room.config.durationMs || 0);
        const elapsed = Date.now() - startedAt;
        if (elapsed >= TARGET_HINT_FIRST_MS) {
      const word = room.currentRound.targetWord || "";
      const revealed = room.currentRound.targetRevealed || new Set();
      const chars = word.split("");
      const pattern = chars
        .map((ch, idx) => (revealed.has(idx) ? ch.toUpperCase() : "_"))
        .join(" ");
      socket.emit("specialHint", {
        roomId: room.id,
        roundId: room.currentRound.id,
        kind: specialType,
        length: chars.length,
        pattern,
        revealCells: resolveTargetHintCells(room, Array.from(revealed)),
      });
    }
      }
      broadcastProvisionalRanking(room);
    } else if (room.breakState && typeof room.breakState.nextStartAt === "number") {
      socket.emit("breakStarted", {
        roomId: room.id,
        nextStartAt: room.breakState.nextStartAt,
        breakKind: room.breakState.breakKind,
        tournament: room.breakState.tournament,
        nextSpecial: room.breakState.nextSpecial || null,
        tournamentSummary: room.breakState.tournamentSummary || null,
        tournamentSummaryAt: room.breakState.tournamentSummaryAt || null,
        targetSummary: room.breakState.targetSummary || null,
      });
    }
  });

  socket.on("chat:send", (text, cb) => {
    const room = getRoom(socket.roomId);
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    if (typeof text !== "string") {
      cb?.({ ok: false });
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      cb?.({ ok: false });
      return;
    }
    const player = room.players.get(socket.id);
    if (!player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const installId = normalizeInstallId(player.installId || socket.data?.installId);
    if (!installId) {
      cb?.({ ok: false, error: "invalid_install_id" });
      return;
    }
    if (isInstallIdMuted(installId)) {
      cb?.({ ok: false, error: "muted" });
      return;
    }
    const message = {
      id: randomUUID(),
      t: Date.now(),
      roomId: room.id,
      nick: player.nick,
      installId,
      text: trimmed,
    };
    pushChatMessage(room, message);
    cb?.({ ok: true });
  });

  socket.on("reportMessage", (payload, cb) => {
    const room = getRoom(socket.roomId);
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const reporterInstallId = normalizeInstallId(socket.data?.installId);
    if (!reporterInstallId) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    if (!payload || typeof payload !== "object") {
      cb?.({ ok: false, error: "invalid_payload" });
      return;
    }
    const reportedInstallId = normalizeInstallId(payload.reportedInstallId);
    if (!reportedInstallId) {
      cb?.({ ok: false, error: "invalid_reported_id" });
      return;
    }
    const messageId =
      typeof payload.messageId === "string" && payload.messageId.trim()
        ? payload.messageId.trim()
        : null;
    const reason = sanitizeReportReason(payload.reason);
    if (!reason) {
      cb?.({ ok: false, error: "invalid_reason" });
      return;
    }

    const now = Date.now();
    const reportedMessage =
      messageId && Array.isArray(room.chatMessages)
        ? room.chatMessages.find((msg) => msg?.id === messageId)
        : null;
    const snippet = reportedMessage?.text
      ? String(reportedMessage.text).slice(0, 200)
      : null;
    const entry = {
      ts: now,
      iso: new Date(now).toISOString(),
      roomId: room.id,
      reporterInstallId,
      reportedInstallId,
      messageId,
      reason,
      snippet,
    };
    reportEntries.push(entry);
    appendReportLog(entry);

    const count = registerReportForInstallId(reportedInstallId, now);
    let mutedUntil = null;
    if (count >= REPORT_MUTE_THRESHOLD) {
      mutedUntil = muteInstallId(reportedInstallId, now);
    }
    cb?.({ ok: true, mutedUntil });
  });

  socket.on("getVocabCount", async (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const socketInstallId = normalizeInstallId(socket.data?.installId);
    const payloadInstallId = normalizeInstallId(payload?.installId);
    const installId = socketInstallId || payloadInstallId;
    if (!installId) {
      cb?.({ count: 0 });
      return;
    }
    try {
      const count = await getVocabularyCount(installId);
      cb?.({ count });
    } catch (err) {
      console.warn("getVocabCount failed", err);
      cb?.({ count: 0 });
    }
  });

  socket.on("getTrophyStatus", async (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const socketInstallId = normalizeInstallId(socket.data?.installId);
    const payloadInstallId = normalizeInstallId(payload?.installId);
    const installId = socketInstallId || payloadInstallId;
    if (!installId) {
      cb?.({ ok: false, status: null });
      return;
    }
    try {
      const status = await getTrophyStatus(installId);
      cb?.({ ok: true, status });
    } catch (err) {
      console.warn("getTrophyStatus failed", err);
      cb?.({ ok: false, status: null });
    }
  });

  socket.on("submitWord", ({ roundId, word, path }, cb) => {
    const room = getRoom(socket.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const result = submitWordForNick(room, {
      roundId,
      word,
      path,
      nick: player?.nick,
    });
    cb?.(result);
  });

  socket.on("submitWordsBatch", (payload, cb) => {
    const clientSeq = Number.isFinite(payload?.clientSeq) ? payload.clientSeq : null;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const room = getRoom(socket.roomId);
    const player = room?.players.get(socket.id);
    const roundId = payload?.roundId || null;

    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in", clientSeq, results: [] });
      return;
    }
    if (!roundId || items.length === 0) {
      cb?.({ ok: false, error: "invalid_payload", clientSeq, results: [] });
      return;
    }

    const results = [];
    for (const item of items) {
      const rawWord = typeof item?.word === "string" ? item.word : "";
      if (!rawWord) {
        results.push({ word: "", ok: false, error: "empty_word" });
        continue;
      }
      const res = submitWordForNick(room, {
        roundId,
        word: rawWord,
        path: item?.path,
        nick: player.nick,
      });
      const normalized = normalizeWord(rawWord) || rawWord;
      results.push({
        word: normalized,
        ...res,
        points:
          Number.isFinite(res?.points) || Number.isFinite(res?.wordScore)
            ? res?.points ?? res?.wordScore
            : undefined,
        totalScore:
          Number.isFinite(res?.totalScore) || Number.isFinite(res?.score)
            ? res?.totalScore ?? res?.score
            : undefined,
      });
    }

    cb?.({ ok: true, clientSeq, results });
  });

  socket.on("disconnect", () => {
    const room = getRoom(socket.roomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    const now = Date.now();
    const medalKey = getMedalKeyForPlayer(player);
    const isBot = isBotToken(player?.token);
    if (medalKey && isBot) {
      room.medals.delete(medalKey);
      room.medalExpiry.delete(medalKey);
      persistRoomMedals(room);
    }
    if (medalKey && !medalKey.startsWith("install:") && !isBot) {
      room.medalExpiry.set(medalKey, now + MEDALS_TTL_AFTER_DISCONNECT_MS);
      persistRoomMedals(room);
    }
    if (!player) return;
    player.connected = false;
    player.lastSeenAt = now;
    clearPendingDisconnect(room, socket.id);
    emitPlayers(room);
    emitRoomsStats();
    broadcastProvisionalRanking(room);
    const timer = setTimeout(() => {
      clearPendingDisconnect(room, socket.id);
      const current = room.players.get(socket.id);
      if (current) {
        room.players.delete(socket.id);
        console.log("Client déconnecté", socket.id, current?.nick, "from", room.id);
        emitPlayers(room);
        emitMedals(room);
        broadcastProvisionalRanking(room);
        emitRoomsStats();
      }
    }, DISCONNECT_GRACE_MS);
    room.pendingDisconnects.set(socket.id, {
      timer,
      installId: player.installId || null,
      nick: player.nick || "",
    });
  });
});

botManager = createBotManager({
  rooms,
  dictionary,
  solveGrid,
  ensurePlayerInRound,
  submitWordForNick,
  emitPlayers,
  emitMedals,
  broadcastProvisionalRanking,
});

const PORT = 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on *:${PORT}`);
});

rooms.forEach((room) =>
  startRoundForRoom(room).catch((e) => console.warn("startRoundForRoom failed", e))
);

const dailyToday = getParisDateId();
void ensureDaily(dailyToday);
void ensureDaily(addDaysToDateId(dailyToday, 1));
void refreshDailyChampionCache();

const DAILY_MAINTENANCE_MS = 5 * 60 * 1000;
const dailyMaintenanceTimer = setInterval(() => {
  const today = getParisDateId();
  const tomorrow = addDaysToDateId(today, 1);
  void ensureDaily(today);
  void ensureDaily(tomorrow);
  void refreshDailyChampionCache();
}, DAILY_MAINTENANCE_MS);
dailyMaintenanceTimer.unref?.();
