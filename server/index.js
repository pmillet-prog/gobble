// server/index.js
import path from "path";
import { fileURLToPath } from "url";

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

import {
  FAKE_TWINS_MIN_WORD_LENGTH,
  FAKE_TWINS_TYPE,
  generateGrid,
  MOVABLE_BONUS_KEYS,
  scoreWordOnGrid,
  scoreWordOnGridWithPath,
  solveGrid,
  findBestPathForWord,
  normalizeWord,
} from "../shared/gameLogic.js";
import { createBotManager, BOT_ROSTER_4X4 } from "./bots/botManager.js";
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
  recordBestSpecial3Score,
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
  getVocabularyCountForInstallIds,
  getVocabularyLeaderboard,
  migrateVocabularyProfile,
  upsertVocabularyProfile,
  getKnownVocabWords,
  getKnownVocabWordsForInstallIds,
} from "./stats/vocabularyService.js";
import {
  initTrophyService,
  updateTrophiesForTournament,
  getTrophyStatus,
  migrateTrophyProfile,
  getBotRatingFromStrength,
  K_BASE as TROPHY_K_BASE,
} from "./stats/trophyService.js";
import {
  initGobblarsService,
  getGobblarProfile,
  addGobblars,
  grantWeeklyWinnerGobblars,
  applyThemeSelection,
  migrateGobblarProfile,
  THEME_UNLOCK_COST,
  WEEKLY_WIN_GOBBLARS_BONUS,
} from "./stats/gobblarsService.js";
import {
  initWordVaultService,
  listWordVaultEntriesForUser,
  addWordVaultEntryForUser,
  removeWordVaultEntryForUser,
} from "./stats/wordVaultService.js";
import {
  getDailyMedalsForRoom,
  persistDailyMedalsForRoom,
} from "./stats/dailyMedalsService.js";
import {
  DAILY_FAKE_TWINS_MODE,
  addDaysToDateId,
  DAILY_MONSTROUS_MODE,
  DAILY_SPECIAL_MODE,
  ensureDaily,
  getDailyBoard,
  getDailyHistory,
  getDailyStatus,
  getDailyResultsSnapshot,
  getParisDateId,
  startDailyAttempt,
  submitDailyResult,
} from "./daily/dailyService.js";
import {
  annotateEntriesWithTeam,
  getDailyBattleResult,
  getDuelStatus,
  getObjectivesStatus,
  getParisWeekId as getDuelParisWeekId,
  getTeamForInstall,
  getWeeklyDuelScore,
  isInstallCrowned,
  recordDailyBattleFromEntries,
  recordDailyPlayed,
  recordMainRoundCompleted,
  recordTournamentMedalPoints,
  recordMainWordAccepted,
  rerollObjective,
} from "./stats/teamDuelService.js";
import {
  clearBroadcastMessage,
  getActiveBroadcast,
  getBroadcastAdminState,
  setBroadcastMessage,
} from "./admin/broadcastService.js";
import { createAuthRouter } from "./auth/authRouter.js";
import {
  consumeSocketTicket,
  findUserById,
  getSessionByToken,
  getUserIdentityMigrationSignature,
  listDevicesForUser,
  setUserIdentityMigrationSignature,
} from "./auth/authService.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
});

const computePool = createComputePool();
void initVocabularyService().catch((err) =>
  console.warn("Vocabulary service init failed", err)
);
void initTrophyService().catch((err) =>
  console.warn("Trophy service init failed", err)
);
void initGobblarsService().catch((err) =>
  console.warn("Gobblars service init failed", err)
);
void initWordVaultService().catch((err) =>
  console.warn("Word vault service init failed", err)
);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.set("trust proxy", true);
app.use(
  "/api/auth",
  createAuthRouter({
    normalizeInstallIdRaw,
    resolveCanonicalInstallId,
  })
);

app.post("/api/client-crash", async (req, res) => {
  try {
    const rawReport = req?.body?.report && typeof req.body.report === "object" ? req.body.report : {};
    const auth = await getAuthFromCookieHeader(req?.headers?.cookie);
    const userId = Number(auth?.user?.id);
    const entry = {
      at: new Date().toISOString(),
      manual: !!req?.body?.manual,
      ip: normalizeIp(req.ip || req.headers?.["x-forwarded-for"] || ""),
      userId: Number.isInteger(userId) && userId > 0 ? userId : null,
      kind: sanitizeCrashText(String(rawReport?.kind || ""), 80),
      message: sanitizeCrashText(String(rawReport?.message || ""), 1000),
      stack: sanitizeCrashText(String(rawReport?.stack || ""), 12000),
      componentStack: sanitizeCrashText(String(rawReport?.componentStack || ""), 12000),
      source: sanitizeCrashText(String(rawReport?.source || ""), 400),
      line: Number(rawReport?.line) || null,
      col: Number(rawReport?.col) || null,
      context:
        rawReport?.context && typeof rawReport.context === "object"
          ? sanitizeCrashValue(rawReport.context)
          : null,
    };
    appendClientCrashLog(entry);
    res.json({ ok: true });
  } catch (err) {
    console.warn("client crash report failed", err);
    res.status(500).json({ ok: false, error: "internal" });
  }
});

const BOT_NICK_SET = new Set(
  [...(BOT_ROSTER_4X4 || [])].map((bot) => bot?.nick).filter(Boolean)
);
const BOT_STRENGTH_BY_NICK = new Map(
  [...(BOT_ROSTER_4X4 || [])]
    .filter((bot) => bot?.nick)
    .map((bot) => [bot.nick, bot.skill ?? 0])
);

const SOLVE_CACHE_MAX = 8;
const solveCache = new Map();
const ANNOUNCEMENT_BATCH_MS = 220;
const ANNOUNCEMENT_BATCH_MAX = 12;
const ADMIN_BROADCAST_TOKEN = String(process.env.ADMIN_BROADCAST_TOKEN || "").trim();

function isBroadcastAdminAuthorized(req) {
  if (!ADMIN_BROADCAST_TOKEN) return false;
  const auth = String(req.headers?.authorization || "");
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  return token === ADMIN_BROADCAST_TOKEN;
}

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
    const altLetter = cell?.altLetter ? String(cell.altLetter) : "";
    const specialType = cell?.specialType ? String(cell.specialType) : "";
    cells.push([letter, bonus, altLetter, specialType].join(":"));
  }
  if (!special) return cells.join("|");
  const specialType = special?.type ? String(special.type) : "";
  const bonusLetter = special?.bonusLetter ? normalizeLetterKey(special.bonusLetter) : "";
  const bonusLetterScore =
    Number.isFinite(special?.bonusLetterScore) ? special.bonusLetterScore : "";
  const disableBonuses = special?.disableBonuses ? 1 : 0;
  const minWordLength =
    Number.isFinite(special?.minWordLength) && special.minWordLength > 0
      ? Math.trunc(special.minWordLength)
      : "";
  return [
    cells.join("|"),
    specialType,
    bonusLetter,
    bonusLetterScore,
    disableBonuses,
    minWordLength,
  ].join("|");
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
  const wantFullDefinition = String(req.query?.full || "") === "1";
  if (skipCache) {
    clearDefinitionCache(word);
  }
  const payload = await getDefinition(word, {
    timeoutMs: wantFullDefinition ? 3500 : 2500,
    skipCache,
    definitionMaxLen: wantFullDefinition ? 2200 : 600,
  });
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
    const normalizeWeeklyNick = (rawNick) =>
      typeof rawNick === "string" ? rawNick.trim().toLowerCase() : "";
    const buildWeeklyNickKey = (rawNick) => {
      const nick = normalizeWeeklyNick(rawNick);
      return nick ? `nick:${nick}` : "";
    };
    const canonicalizeVocabPlayerKey = (rawPlayerKey, rawInstallId = "") => {
      const playerKey = typeof rawPlayerKey === "string" ? rawPlayerKey.trim() : "";
      if (playerKey.startsWith("install:")) {
        const installId = playerKey.slice("install:".length);
        return getMedalKeyForInstallId(installId) || playerKey;
      }
      if (playerKey.startsWith("nick:")) {
        return buildWeeklyNickKey(playerKey.slice("nick:".length)) || playerKey;
      }
      if (rawInstallId) {
        return getMedalKeyForInstallId(rawInstallId) || `install:${rawInstallId}`;
      }
      return playerKey;
    };
    const nickByPlayerKey = new Map();
    const installKeyByNick = new Map();
    for (const value of Object.values(boards)) {
      if (!Array.isArray(value)) continue;
      for (const entry of value) {
        const key = canonicalizeVocabPlayerKey(entry?.playerKey, entry?.installId);
        const nick = typeof entry?.nick === "string" ? entry.nick.trim() : "";
        const nickLower = normalizeWeeklyNick(entry?.nick);
        if (key && nick && !nickByPlayerKey.has(key)) {
          nickByPlayerKey.set(key, nick);
        }
        if (key.startsWith("install:") && nickLower && !installKeyByNick.has(nickLower)) {
          installKeyByNick.set(nickLower, key);
        }
      }
    }
    const vocabularyFallback = await getVocabularyLeaderboard(payload?.topN || topN || 50);
    for (const entry of vocabularyFallback) {
      const key = canonicalizeVocabPlayerKey("", entry?.installId);
      const nickLower = normalizeWeeklyNick(entry?.nick);
      if (key.startsWith("install:") && nickLower && !installKeyByNick.has(nickLower)) {
        installKeyByNick.set(nickLower, key);
      }
    }
    const vocabByKey = new Map();
    const vocabFromWeekly = Array.isArray(boards?.vocab) ? boards.vocab : [];
    for (const entry of vocabFromWeekly) {
      const nickLower = normalizeWeeklyNick(entry?.nick);
      const rawKey = canonicalizeVocabPlayerKey(entry?.playerKey, entry?.installId);
      const key =
        nickLower && (!rawKey || rawKey.startsWith("nick:")) && installKeyByNick.has(nickLower)
          ? installKeyByNick.get(nickLower)
          : rawKey || buildWeeklyNickKey(entry?.nick);
      if (!key) continue;
      const current = vocabByKey.get(key);
      if (!current || (Number(entry?.vocabCount) || 0) > (Number(current?.vocabCount) || 0)) {
        vocabByKey.set(key, { ...entry, playerKey: key });
      }
    }
    for (const entry of vocabularyFallback) {
      if (!entry?.installId) continue;
      const key = canonicalizeVocabPlayerKey("", entry.installId);
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
      bestSpecial3Score: filterBots(boards.bestSpecial3Score),
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

function sanitizeDailyMode(raw) {
  const mode = String(raw || "").trim();
  if (mode === DAILY_SPECIAL_MODE) return DAILY_SPECIAL_MODE;
  if (mode === DAILY_FAKE_TWINS_MODE) return DAILY_FAKE_TWINS_MODE;
  return DAILY_MONSTROUS_MODE;
}

async function runDailyStartFlow({ installId, pseudo, dailyMode }) {
  const result = await startDailyAttempt(null, installId, pseudo, { dailyMode });
  if (!result?.ok) return result;
  await refreshInstallDuelCache(installId);
  const duel = await getDuelStatus(installId, { dateId: result?.dateId || null });
  return { ...result, duel };
}

async function runDailySubmitFlow({
  dateId = null,
  installId,
  pseudo,
  foundWords,
  wordSubmissions,
  specialPlacements,
  dailyMode,
  durationMs,
}) {
  const result = await submitDailyResult({
    dateId: typeof dateId === "string" ? dateId : null,
    installId,
    pseudo,
    foundWords,
    wordSubmissions,
    specialPlacements,
    dailyMode,
    durationMs,
    dictionary,
  });
  if (!result?.ok) return result;

  const dailyGobbles = Number(result?.gobbles) || 0;
  if (dailyGobbles > 0) {
    await addGobblars({
      installId,
      amount: dailyGobbles,
      reason: "daily_gobbles",
      meta: { dateId: result?.dateId || null },
    }).catch(() => {});
  }

  await recordDailyPlayed({ installId, dateId: result?.dateId || null });
  let boardWithTeams = Array.isArray(result?.board) ? result.board : [];
  if (boardWithTeams.length) {
    boardWithTeams = await annotateEntriesWithTeam(boardWithTeams, {
      dateId: result?.dateId || null,
    });
    await recordDailyBattleFromEntries(result.dateId || null, boardWithTeams);
  }
  const dailyEntry = Array.isArray(boardWithTeams)
    ? boardWithTeams.find((entry) => normalizeInstallId(entry?.installId) === installId)
    : null;
  const dailyTeam = dailyEntry?.team === "red" || dailyEntry?.team === "blue"
    ? dailyEntry.team
    : getTeamForInstallCached(installId);
  const dailyNick = String(dailyEntry?.nick || pseudo || "Joueur").trim() || "Joueur";
  const dailyScore = Number(dailyEntry?.score ?? result?.score) || 0;
  const dailyWords = Number(dailyEntry?.wordsCount ?? dailyEntry?.wordCount) || 0;
  broadcastSystemChatMessage(
    `${dailyNick} ${getTeamDot(dailyTeam)} a validé la grille du jour avec ${dailyScore} points - ${dailyWords} mots`,
    {
      installId,
      team: dailyTeam,
      nick: dailyNick,
      meta: {
        kind: "daily_completed",
        dateId: result?.dateId || null,
        score: dailyScore,
        wordsCount: dailyWords,
      },
    }
  );
  await refreshInstallDuelCache(installId);
  const duel = await getDuelStatus(installId, { dateId: result?.dateId || null });
  return { ...result, board: boardWithTeams, duel };
}

app.get("/api/daily/status", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await getRequestPlayerIdentity(req);
  const installId = identity?.installId || null;
  const payload = await getDailyStatus(null, installId || null);
  let duel = null;
  if (installId) {
    try {
      await refreshInstallDuelCache(installId);
      duel = await getDuelStatus(installId, { dateId: payload?.dateId || null });
    } catch (_) {}
  }
  res.json({ ...payload, champion: null, duel });
});

app.get("/api/daily/board", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const dateId = typeof req.query?.dateId === "string" ? req.query.dateId : null;
  const payload = await getDailyBoard(dateId || null);
  const safeDateId = payload?.dateId || dateId || getParisDateId();
  let entries = Array.isArray(payload?.entries) ? payload.entries : [];
  entries = await annotateEntriesWithTeam(entries, { dateId: safeDateId });
  let battle = await getDailyBattleResult(safeDateId);
  if (payload?.ready && entries.length > 0) {
    battle = await recordDailyBattleFromEntries(safeDateId, entries);
  }
  res.json({ ...payload, entries, battle });
});

app.get("/api/daily/history", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const rawDays = Number(req.query?.days);
  const identity = await getRequestPlayerIdentity(req);
  const installId = identity?.installId || null;
  const days = Number.isFinite(rawDays)
    ? Math.min(30, Math.max(1, Math.round(rawDays)))
    : 7;
  const payload = await getDailyHistory({ days, installId, dictionary });
  const safeDays = Array.isArray(payload?.days) ? payload.days : [];
  const enrichedDays = [];
  for (const day of safeDays) {
    const dateIdForDay = day?.dateId || null;
    const entries = await annotateEntriesWithTeam(day?.entries || [], {
      dateId: dateIdForDay,
    });
    let battle = dateIdForDay ? await getDailyBattleResult(dateIdForDay) : null;
    if (dateIdForDay && !battle) {
      const snapshot = await getDailyResultsSnapshot(dateIdForDay);
      if (Array.isArray(snapshot?.results) && snapshot.results.length > 0) {
        battle = await recordDailyBattleFromEntries(dateIdForDay, snapshot.results);
      }
    }
    enrichedDays.push({ ...day, entries, battle: battle || null });
  }
  res.json({
    ...payload,
    days: enrichedDays,
    crownTotals: [],
  });
});

app.post("/api/daily/start", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await requireRequestPlayerIdentity(req, res);
  if (!identity) return;
  const installId = identity.installId;
  const pseudo = sanitizeDailyNick(req.body?.pseudo || "");
  const dailyMode = sanitizeDailyMode(req.body?.dailyMode);
  if (!installId || !pseudo) {
    res.status(400);
    return res.json({ ok: false, error: "bad_request" });
  }
  const result = await runDailyStartFlow({ installId, pseudo, dailyMode });
  if (!result.ok) {
    if (result.error === "already_played") {
      res.status(409);
    } else if (result.error === "not_ready") {
      res.status(503);
    } else if (result.error === "bad_grid") {
      res.status(500);
    } else if (result.error === "results_unavailable") {
      res.status(503);
    } else {
      res.status(500);
    }
    return res.json(result);
  }
  return res.json(result);
});

app.post("/api/daily/submit", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await requireRequestPlayerIdentity(req, res);
  if (!identity) return;
  const installId = identity.installId;
  const pseudo = sanitizeDailyNick(req.body?.pseudo || "");
  const dailyMode = sanitizeDailyMode(req.body?.dailyMode);
  if (!installId || !pseudo) {
    res.status(400);
    return res.json({ ok: false, error: "bad_request" });
  }
  const result = await runDailySubmitFlow({
    dateId: typeof req.body?.dateId === "string" ? req.body.dateId : null,
    installId,
    pseudo,
    foundWords: req.body?.foundWords,
    wordSubmissions: req.body?.wordSubmissions,
    specialPlacements: req.body?.specialPlacements,
    dailyMode,
    durationMs: req.body?.durationMs,
  });
  if (!result.ok) {
    if (result.error === "already_played") {
      res.status(409);
    } else if (result.error === "not_ready") {
      res.status(503);
    } else if (result.error === "bad_grid") {
      res.status(500);
    } else if (result.error === "no_dictionary") {
      res.status(500);
    } else if (result.error === "results_unavailable") {
      res.status(503);
    } else {
      res.status(400);
    }
    return res.json(result);
  }
  return res.json(result);
});

app.get("/api/theme/profile", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await requireRequestPlayerIdentity(req, res);
  if (!identity) return;
  const installId = identity.installId;
  try {
    await refreshInstallDuelCache(installId).catch(() => {});
    const profile = await getGobblarProfile(installId);
    if (!profile) {
      res.status(500);
      return res.json({ ok: false, error: "profile_unavailable" });
    }
    return res.json({
      ok: true,
      installId,
      balance: Number(profile.balance) || 0,
      themeApplied: profile.themeApplied || {},
      themeUnlocks: profile.themeUnlocks || {},
      unlockCost: Number.isFinite(Number(profile.unlockCost))
        ? Number(profile.unlockCost)
        : THEME_UNLOCK_COST,
      lockableCategories: Array.isArray(profile.lockableCategories)
        ? profile.lockableCategories
        : [],
    });
  } catch (err) {
    console.warn("Theme profile route failed", err);
    res.status(500);
    return res.json({ ok: false, error: "profile_unavailable" });
  }
});

app.post("/api/theme/apply", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await requireRequestPlayerIdentity(req, res);
  if (!identity) return;
  const installId = identity.installId;
  const mode = req.body?.mode === "single" ? "single" : "full";
  const category = typeof req.body?.category === "string" ? req.body.category : "";
  const draftTheme =
    req.body?.draftTheme && typeof req.body.draftTheme === "object"
      ? req.body.draftTheme
      : {};
  try {
    const result = await applyThemeSelection({
      installId,
      mode,
      category,
      draftTheme,
      unlockCost: THEME_UNLOCK_COST,
    });
    if (!result) {
      res.status(500);
      return res.json({ ok: false, error: "theme_apply_failed" });
    }
    if (result.ok === false) {
      res.status(409);
      return res.json(result);
    }
    return res.json({
      ok: true,
      installId,
      balance: Number(result.balance) || 0,
      spent: Number(result.spent) || 0,
      requiredUnlocks: Array.isArray(result.requiredUnlocks) ? result.requiredUnlocks : [],
      changedCategories: Array.isArray(result.changedCategories) ? result.changedCategories : [],
      themeApplied: result.themeApplied || {},
      themeUnlocks: result.themeUnlocks || {},
      unlockCost: THEME_UNLOCK_COST,
    });
  } catch (err) {
    console.warn("Theme apply route failed", err);
    res.status(500);
    return res.json({ ok: false, error: "theme_apply_failed" });
  }
});

app.get("/api/duel/status", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await requireRequestPlayerIdentity(req, res);
  if (!identity) return;
  const installId = identity.installId;
  await refreshInstallDuelCache(installId);
  const dateId = typeof req.query?.dateId === "string" ? req.query.dateId : null;
  const payload = await getDuelStatus(installId, { dateId });
  return res.json({ ok: true, ...payload });
});

app.get("/api/duel/weekly", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const weekId = typeof req.query?.weekId === "string" ? req.query.weekId : null;
  const payload = await getWeeklyDuelScore(weekId);
  return res.json(payload);
});

app.get("/api/duel/daily", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const dateId = typeof req.query?.dateId === "string" ? req.query.dateId : null;
  const safeDateId = dateId || getParisDateId();
  let battle = await getDailyBattleResult(safeDateId);
  if (!battle) {
    const snapshot = await getDailyResultsSnapshot(safeDateId);
    if (Array.isArray(snapshot?.results) && snapshot.results.length > 0) {
      battle = await recordDailyBattleFromEntries(safeDateId, snapshot.results);
    }
  }
  return res.json({ dateId: safeDateId, battle: battle || null });
});

app.get("/api/duel/objectives", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await requireRequestPlayerIdentity(req, res);
  if (!identity) return;
  const installId = identity.installId;
  const dateId = typeof req.query?.dateId === "string" ? req.query.dateId : null;
  const payload = await getObjectivesStatus(installId, dateId);
  return res.json(payload);
});

app.post("/api/duel/objectives/reroll", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await requireRequestPlayerIdentity(req, res);
  if (!identity) return;
  const installId = identity.installId;
  const dateId = typeof req.body?.dateId === "string" ? req.body.dateId : null;
  const bucket = typeof req.body?.bucket === "string" ? req.body.bucket : null;
  const payload = await rerollObjective({ installId, dateId, bucket });
  if (!payload?.ok) {
    res.status(409);
  }
  return res.json(payload);
});

app.post("/api/duel/objectives/submit", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await requireRequestPlayerIdentity(req, res);
  if (!identity) return;
  const installId = identity.installId;
  const dateId = typeof req.body?.dateId === "string" ? req.body.dateId : null;
  const eventType = typeof req.body?.eventType === "string" ? req.body.eventType : "";
  let payload = { ok: false, error: "invalid_event" };
  if (eventType === "word") {
    payload = await recordMainWordAccepted({
      installId,
      nick: typeof req.body?.nick === "string" ? req.body.nick : "",
      dateId,
      roundSpecialType: req.body?.roundSpecialType || null,
      wordLength: Number(req.body?.wordLength) || 0,
      wordPoints: Number(req.body?.wordPoints) || 0,
      usedBonusTile: !!req.body?.usedBonusTile,
      usedRareLetter: !!req.body?.usedRareLetter,
    });
  } else if (eventType === "round") {
    payload = await recordMainRoundCompleted({
      installId,
      nick: typeof req.body?.nick === "string" ? req.body.nick : "",
      dateId,
      isTargetRound: !!req.body?.isTargetRound,
      roundScore: Number(req.body?.roundScore) || 0,
      gobblesEarned: Number(req.body?.gobblesEarned) || 0,
      targetFound: !!req.body?.targetFound,
      participated: !!req.body?.participated,
    });
  } else if (eventType === "daily_played") {
    await recordDailyPlayed({ installId, dateId });
    payload = { ok: true };
  }
  if (!payload?.ok) {
    res.status(400);
  }
  return res.json(payload);
});

app.get("/api/vault/words", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await requireRequestPlayerIdentity(req, res);
  if (!identity) return;
  const items = await listWordVaultEntriesForUser(identity.userId);
  return res.json({
    ok: true,
    items,
    count: Array.isArray(items) ? items.length : 0,
  });
});

app.post("/api/vault/words", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await requireRequestPlayerIdentity(req, res);
  if (!identity) return;
  const result = await addWordVaultEntryForUser(identity.userId, req.body?.word);
  if (!result?.ok) {
    res.status(
      result?.error === "word_required" || result?.error === "word_invalid" ? 400 : 500
    );
  }
  return res.json(result);
});

app.delete("/api/vault/words", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  const identity = await requireRequestPlayerIdentity(req, res);
  if (!identity) return;
  const result = await removeWordVaultEntryForUser(identity.userId, req.body?.word);
  if (!result?.ok) {
    res.status(
      result?.error === "word_required" || result?.error === "word_invalid" ? 400 : 500
    );
  }
  return res.json(result);
});

app.get("/api/broadcast/current", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  try {
    const message = await getActiveBroadcast();
    return res.json({ ok: true, message });
  } catch (err) {
    console.warn("getActiveBroadcast failed", err);
    return res.json({ ok: false, error: "broadcast_unavailable", message: null });
  }
});

app.get("/api/admin/broadcast", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  if (!isBroadcastAdminAuthorized(req)) {
    res.status(401);
    return res.json({ ok: false, error: "unauthorized" });
  }
  try {
    const payload = await getBroadcastAdminState();
    return res.json({ ok: true, ...payload });
  } catch (err) {
    console.warn("getBroadcastAdminState failed", err);
    res.status(500);
    return res.json({ ok: false, error: "broadcast_unavailable" });
  }
});

app.post("/api/admin/broadcast", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  if (!isBroadcastAdminAuthorized(req)) {
    res.status(401);
    return res.json({ ok: false, error: "unauthorized" });
  }
  try {
    const payload = await setBroadcastMessage(req.body || {});
    if (!payload?.ok) {
      res.status(400);
    }
    return res.json(payload);
  } catch (err) {
    console.warn("setBroadcastMessage failed", err);
    res.status(500);
    return res.json({ ok: false, error: "broadcast_unavailable" });
  }
});

app.delete("/api/admin/broadcast", async (req, res) => {
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  if (!isBroadcastAdminAuthorized(req)) {
    res.status(401);
    return res.json({ ok: false, error: "unauthorized" });
  }
  try {
    const payload = await clearBroadcastMessage();
    return res.json(payload);
  } catch (err) {
    console.warn("clearBroadcastMessage failed", err);
    res.status(500);
    return res.json({ ok: false, error: "broadcast_unavailable" });
  }
});

app.get("/api/players", async (req, res) => {
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
  const roomPlayers = Array.from(room.players.values());
  await Promise.all(
    roomPlayers.map(async (player) => {
      const installId = normalizeInstallId(player?.installId);
      if (!installId || isBotToken(player?.token)) return;
      try {
        await refreshInstallDuelCache(installId);
      } catch (_) {}
    })
  );
  const players = roomPlayers
    .filter((p) => isPlayerConnected(p) || isBotToken(p?.token))
    .map((p) => ({
      nick: p?.nick || "",
      userId: Number.isInteger(Number(p?.userId)) ? Number(p.userId) : null,
      installId: p?.installId || null,
      team: getTeamForInstallCached(p?.installId),
      isBot: isBotToken(p?.token),
      isDailyChampion: isDailyChampionInstallId(p?.installId),
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
    roundStartsAt: currentRound?.startsAt ?? null,
    roundIntroMs: currentRound?.introMs ?? 0,
    roundStatus: currentRound?.status ?? null,
    roundDurationMs: currentRound?.durationMs ?? room.config?.durationMs ?? DEFAULT_ROUND_DURATION_MS,
    tournamentRound: currentRound?.tournamentRound ?? room.tournament?.currentRound ?? null,
    tournamentTotalRounds: room.tournament?.totalRounds ?? TOURNAMENT_TOTAL_ROUNDS,
    breakKind: breakState?.breakKind ?? null,
    breakEndsAt: breakState?.nextStartAt ?? null,
    breakDurationMs: room.config?.breakMs ?? DEFAULT_BREAK_DURATION_MS,
    isRoundRunning: isRoundActive(currentRound),
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
    origin: true,
    credentials: true,
  },
  pingTimeout: 60000,
});

io.use(async (socket, next) => {
  let auth = await getAuthFromCookieHeader(socket?.handshake?.headers?.cookie);
  let authUser = auth?.user || null;
  let authSession = auth?.session || null;
  if (!authUser) {
    const ticket =
      socket?.handshake?.auth?.socketTicket ||
      socket?.handshake?.auth?.ticket ||
      socket?.handshake?.query?.socketTicket ||
      socket?.handshake?.query?.ticket;
    const ticketUser = await consumeSocketTicket(ticket);
    if (ticketUser) {
      authUser = ticketUser;
      authSession = null;
    }
  }
  socket.data.authUser = authUser;
  socket.data.authSession = authSession;
  if (authUser) {
    await ensureUserIdentityMigration(authUser);
  }
  next();
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
const DEFAULT_BREAK_DURATION_MS = 45 * 1000; // 60s - 15s hors manches cibles
const TARGET_BREAK_DURATION_MS = 30 * 1000; // manches cibles déjà plus courtes
const ROUND_INTRO_DURATION_MS = 6900; // Intro visuelle avant manche jouable (3..0 + arrivée des tuiles)
const MAX_CHAT_HISTORY = 200;
const MAX_SYSTEM_CHAT_HISTORY = 100;
const NICK_MAX_LEN = 25;
const CHAT_REPLY_TEXT_MAX_LEN = 280;
const CHAT_MESSAGE_TEXT_MAX_LEN = 300;
const CHAT_REACTION_MAX_USERS_PER_EMOJI = 200;
const CHAT_REACTION_ALLOWED_EMOJIS = new Set([
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "😡",
  "🍻",
  "🙏",
  "👏",
  "🎉",
  "👋",
  "😎",
]);
const LIVE_ROUND_END_GRACE_MS = 250;
const MIN_BIG_WORD = 50;
const MIN_LONG_WORD = 6;
const DEFAULT_MIN_WORDS = 150;
const SPECIAL_ROUND_EVERY = 5;
const LIVE_SPECIAL_ROUND_DURATION_MS = 120 * 1000;
const TARGET_SPECIAL_ROUND_DURATION_MS = 90 * 1000;
const SPEED_MIN_WORDS = 300;
const SPEED_WORD_SCORE = 11;
const MONSTROUS_MIN_TOTAL_SCORE = 4000;
const MONSTROUS_EXTRA_MIN_WORDS = 50;
const MONSTROUS_MIN_LONG_WORD_LEN = 10;
const MONSTROUS_MIN_LONG_WORD_COUNT = 3;
const SPECIAL_QUALITY_ATTEMPTS = 220;
const MONSTROUS_QUALITY_ATTEMPTS = 320;

const TOURNAMENT_TOTAL_ROUNDS = 5;
const TOURNAMENT_SPECIAL_ROUNDS = [2, 4];
const TOURNAMENT_RESULTS_BREAK_MS = 40 * 1000;
const TOURNAMENT_FINAL_BREAK_MS = 35 * 1000;
const TOURNAMENT_END_TOTAL_BREAK_MS = TOURNAMENT_RESULTS_BREAK_MS + TOURNAMENT_FINAL_BREAK_MS;
const MEDALS_TTL_AFTER_DISCONNECT_MS = 5 * 60 * 1000;
const TOURNAMENT_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const MEDAL_GOBBLARS = Object.freeze({
  gold: 10,
  silver: 5,
  bronze: 3,
});
const DISCONNECT_GRACE_MS = 120 * 1000;
const RANKING_BROADCAST_MIN_MS = 90;
const DUEL_CACHE_REFRESH_MIN_MS = 45 * 1000;


const TARGET_HINT_SCHEDULE_SECONDS_BY_LENGTH = Object.freeze({
  8: [14, 29, 43, 56, 68, 77, 84],
  9: [13, 27, 40, 52, 63, 72, 79, 84],
  10: [12, 25, 37, 48, 58, 67, 74, 80, 84],
  11: [11, 23, 34, 44, 53, 61, 68, 74, 79, 84],
  12: [10, 21, 32, 42, 51, 59, 66, 72, 78, 84],
  "13+": [9, 20, 31, 41, 50, 58, 65, 71, 77, 82, 85],
});
const TARGET_HINT_SCHEDULE_SECONDS_SCORE_BY_LENGTH = Object.freeze({
  5: [22, 39, 55, 70],
  6: [20, 36, 51, 65, 78],
  7: [18, 33, 47, 60, 72, 83],
  8: [16, 30, 43, 55, 66, 76, 84],
  9: [15, 28, 40, 51, 61, 70, 78, 84],
  10: [14, 26, 37, 47, 56, 64, 71, 77, 84],
  11: [13, 24, 34, 43, 51, 58, 64, 70, 76, 84],
  12: [12, 22, 31, 39, 46, 52, 58, 64, 70, 76, 84],
  "13+": [11, 20, 28, 35, 42, 48, 54, 60, 66, 72, 78, 84],
});
const TARGET_HINT_DEFAULT_SECONDS = TARGET_HINT_SCHEDULE_SECONDS_BY_LENGTH[11];
const TARGET_HINT_SCORE_DEFAULT_SECONDS =
  TARGET_HINT_SCHEDULE_SECONDS_SCORE_BY_LENGTH[9];

const BONUS_LETTER_SCORE = 20;
const BONUS_LETTER_MIN_WORDS = 30;
const FUTURE_SPECIAL_BUFFER_TYPES = new Set([
  "monstrous",
  "fake_twins",
  "target_long",
  "target_score",
  "bonus_letter",
]);
const FORCE_BONUS_LETTER_ALL_ROUNDS = false;
const SELF_SPECIAL_3_WORDS_TYPE = "self_specials_3_words";
const SELF_SPECIAL_3_WORDS_WORD_TARGET = 3;
const FAKE_TWINS_LABEL = "Faux jumeaux";
const FORCE_FAKE_TWINS_ALL_ROUNDS = false;
const FORCE_SELF_SPECIAL_3_WORDS_ALL_ROUNDS = false;
const FORCE_SELF_SPECIAL_3_WORDS_ALL_SPECIALS = false;
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
if (FORCE_FAKE_TWINS_ALL_ROUNDS) {
  console.log("[temp] Toutes les manches live sont forcées en mode Faux jumeaux.");
}
if (FORCE_SELF_SPECIAL_3_WORDS_ALL_SPECIALS) {
  console.log("[temp] Toutes les manches spéciales live sont forcées en mode 3 mots.");
}
if (FORCE_SELF_SPECIAL_3_WORDS_ALL_ROUNDS) {
  console.log("[temp] Toutes les manches live sont forcées en mode 3 mots.");
}

const ROOM_CONFIGS = {
  "room-4x4": {
    label: "Grille 4x4",
    gridSize: 4,
    durationMs: DEFAULT_ROUND_DURATION_MS,
    breakMs: DEFAULT_BREAK_DURATION_MS,
    minWords: DEFAULT_MIN_WORDS,
  },
};



const LOG_DIR = path.join(__dirname, "logs");
const CONNECTIONS_LOG_PATH = path.join(LOG_DIR, "connections.log");
const REPORTS_LOG_PATH = path.join(LOG_DIR, "reports.jsonl");
const CLIENT_CRASHES_LOG_PATH = path.join(LOG_DIR, "client-crashes.jsonl");
const REPORT_WINDOW_MS = 10 * 60 * 1000;
const REPORT_MUTE_THRESHOLD = 3;
const REPORT_REASON_MAX_LEN = 160;
const MUTE_DURATION_MS = 10 * 60 * 1000;
const INSTALL_ID_MAX_LEN = 128;
const AUTH_SESSION_COOKIE_NAME = "gobble_session";
const RUNTIME_DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : path.join(__dirname, "../data");
const INSTALL_ALIASES_PATH = path.join(RUNTIME_DATA_DIR, "install-aliases.json");
const reportEntries = [];
const reportsByInstallId = new Map();
const mutedInstallIds = new Map();
const reportLogger = createAsyncFileLogger({ filePath: REPORTS_LOG_PATH });
const clientCrashLogger = createAsyncFileLogger({ filePath: CLIENT_CRASHES_LOG_PATH });
const connectionLogger = createAsyncFileLogger({ filePath: CONNECTIONS_LOG_PATH });
const duelInstallCache = new Map(); // installId -> { weekId, team, crowned, updatedAt }
const duelCacheRefreshAt = new Map(); // installId -> ts
const duelWinnerGrantJobs = new Map(); // `${weekId}:${installId}` -> Promise | "done"
const installAliasByInstallId = new Map();
let duelWeekCacheKey = getDuelParisWeekId();

function normalizeInstallIdRaw(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > INSTALL_ID_MAX_LEN) return "";
  return trimmed;
}

function parseCookieHeader(rawCookieHeader) {
  const out = {};
  const input = String(rawCookieHeader || "");
  if (!input) return out;
  for (const part of input.split(";")) {
    const [keyRaw, ...valueParts] = part.split("=");
    const key = String(keyRaw || "").trim();
    if (!key) continue;
    const rawValue = valueParts.join("=").trim();
    try {
      out[key] = decodeURIComponent(rawValue);
    } catch (_) {
      out[key] = rawValue;
    }
  }
  return out;
}

function buildUserPlayerId(userId) {
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) return "";
  return String(safeUserId);
}

async function getAuthFromCookieHeader(rawCookieHeader) {
  const cookies = parseCookieHeader(rawCookieHeader);
  const token = String(cookies[AUTH_SESSION_COOKIE_NAME] || "").trim();
  if (!token) return null;
  try {
    return await getSessionByToken(token);
  } catch (_) {
    return null;
  }
}

async function getRequestPlayerIdentity(req) {
  const auth = await getAuthFromCookieHeader(req?.headers?.cookie);
  const user = auth?.user || null;
  const installId = buildUserPlayerId(user?.id);
  if (!user || !installId) return null;
  await ensureUserIdentityMigration(user);
  return {
    user,
    userId: Number(user.id),
    installId,
  };
}

async function requireRequestPlayerIdentity(req, res) {
  const identity = await getRequestPlayerIdentity(req);
  if (identity) return identity;
  res.status(401);
  res.json({ ok: false, error: "auth_required" });
  return null;
}

function getSocketPlayerIdentity(socket) {
  const user = socket?.data?.authUser || null;
  const installId = buildUserPlayerId(user?.id);
  if (!user || !installId) return null;
  return {
    user,
    userId: Number(user.id),
    installId,
  };
}

function requireSocketPlayerIdentity(socket, cb) {
  const identity = getSocketPlayerIdentity(socket);
  if (identity) return identity;
  cb?.({ ok: false, error: "auth_required" });
  return null;
}

const migratedUserSignatures = new Map();
const userMigrationPromises = new Map();

async function ensureUserIdentityMigration(user) {
  const userId = Number(user?.id);
  if (!Number.isInteger(userId) || userId <= 0) return;
  const targetInstallId = buildUserPlayerId(userId);
  if (!targetInstallId) return;
  const primaryInstallId = normalizeInstallIdRaw(user?.primaryInstallId);
  const devices = await listDevicesForUser(userId).catch(() => []);
  const sourceInstallIds = Array.from(
    new Set(
      [primaryInstallId, ...(Array.isArray(devices) ? devices.map((entry) => entry?.installId) : [])]
        .map((installId) => normalizeInstallIdRaw(installId))
        .filter((installId) => installId && installId !== targetInstallId)
    )
  ).sort();
  const migrationSignature = `${targetInstallId}|${sourceInstallIds.join(",")}`;
  if (migratedUserSignatures.get(userId) === migrationSignature) return;
  const persistedSignature = await getUserIdentityMigrationSignature(userId).catch(() => "");
  if (persistedSignature === migrationSignature) {
    migratedUserSignatures.set(userId, migrationSignature);
    return;
  }
  const inFlight = userMigrationPromises.get(userId);
  if (inFlight) {
    await inFlight;
    return;
  }

  const task = (async () => {
    let hadFailure = false;
    if (sourceInstallIds.length > 0) {
      const migrations = [
        ["vocabulary", migrateVocabularyProfile],
        ["gobblars", migrateGobblarProfile],
        ["trophies", migrateTrophyProfile],
      ];
      for (const [label, migrate] of migrations) {
        try {
          await migrate(targetInstallId, sourceInstallIds);
        } catch (err) {
          hadFailure = true;
          console.warn(`identity ${label} migration failed user=${userId}`, err);
        }
      }
      if (!hadFailure) {
        sourceInstallIds.forEach((sourceInstallId) => {
          linkInstallIds(sourceInstallId, targetInstallId);
        });
      }
    }
    if (!hadFailure) {
      await setUserIdentityMigrationSignature(userId, migrationSignature).catch((err) => {
        console.warn(`identity migration signature save failed user=${userId}`, err);
      });
      migratedUserSignatures.set(userId, migrationSignature);
    }
  })().finally(() => {
    userMigrationPromises.delete(userId);
  });

  userMigrationPromises.set(userId, task);
  await task;
}

async function listIdentityInstallIds({
  userId,
  currentInstallId = "",
  primaryInstallId = "",
} = {}) {
  const safeUserId = Number(userId);
  const normalizedCurrentInstallId = normalizeInstallIdRaw(currentInstallId);
  const fallbackIds = normalizedCurrentInstallId ? [normalizedCurrentInstallId] : [];
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
    return fallbackIds;
  }
  let primary = normalizeInstallIdRaw(primaryInstallId);
  if (!primary) {
    const user = await findUserById(safeUserId).catch(() => null);
    primary = normalizeInstallIdRaw(user?.primaryInstallId);
  }
  const devices = await listDevicesForUser(safeUserId).catch(() => []);
  return Array.from(
    new Set(
      [
        buildUserPlayerId(safeUserId),
        normalizedCurrentInstallId,
        primary,
        ...(Array.isArray(devices) ? devices.map((entry) => normalizeInstallIdRaw(entry?.installId)) : []),
      ].filter(Boolean)
    )
  );
}

function resolveCanonicalInstallId(rawInstallId, { maxDepth = 16 } = {}) {
  let current = normalizeInstallIdRaw(rawInstallId);
  if (!current) return "";
  const visited = new Set([current]);
  for (let i = 0; i < maxDepth; i += 1) {
    const next = normalizeInstallIdRaw(installAliasByInstallId.get(current));
    if (!next || next === current || visited.has(next)) break;
    current = next;
    visited.add(current);
  }
  return current;
}

function normalizeInstallId(raw) {
  return resolveCanonicalInstallId(raw);
}

function saveInstallAliases() {
  try {
    mkdirSync(RUNTIME_DATA_DIR, { recursive: true });
    const aliases = {};
    for (const [from, to] of installAliasByInstallId.entries()) {
      const safeFrom = normalizeInstallIdRaw(from);
      const safeTo = normalizeInstallIdRaw(to);
      if (!safeFrom || !safeTo || safeFrom === safeTo) continue;
      aliases[safeFrom] = safeTo;
    }
    writeFileSync(
      INSTALL_ALIASES_PATH,
      JSON.stringify(
        {
          version: 1,
          updatedAt: Date.now(),
          aliases,
        },
        null,
        2
      ),
      "utf8"
    );
  } catch (err) {
    console.warn("install alias save failed", err);
  }
}

function loadInstallAliases() {
  installAliasByInstallId.clear();
  try {
    const raw = readFileSync(INSTALL_ALIASES_PATH, "utf8");
    const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const parsed = JSON.parse(cleaned);
    const source =
      parsed?.aliases && typeof parsed.aliases === "object"
        ? parsed.aliases
        : parsed && typeof parsed === "object"
        ? parsed
        : {};
    for (const [fromRaw, toRaw] of Object.entries(source)) {
      const from = normalizeInstallIdRaw(fromRaw);
      const to = normalizeInstallIdRaw(toRaw);
      if (!from || !to || from === to) continue;
      installAliasByInstallId.set(from, to);
    }
    // Compaction: resolve chains and drop invalid/self links.
    for (const [fromRaw, toRaw] of Array.from(installAliasByInstallId.entries())) {
      const from = normalizeInstallIdRaw(fromRaw);
      const to = resolveCanonicalInstallId(toRaw);
      if (!from || !to || from === to) {
        installAliasByInstallId.delete(fromRaw);
        continue;
      }
      installAliasByInstallId.set(from, to);
    }
  } catch (_) {}
}

function linkInstallIds(fromInstallId, targetInstallId) {
  const from = normalizeInstallIdRaw(fromInstallId);
  const target = resolveCanonicalInstallId(targetInstallId);
  if (!from || !target || from === target) return false;
  installAliasByInstallId.set(from, target);
  for (const [keyRaw, valueRaw] of Array.from(installAliasByInstallId.entries())) {
    const key = normalizeInstallIdRaw(keyRaw);
    const value = resolveCanonicalInstallId(valueRaw);
    if (!key || !value || key === value) {
      installAliasByInstallId.delete(keyRaw);
      continue;
    }
    installAliasByInstallId.set(key, value);
  }
  saveInstallAliases();
  duelInstallCache.clear();
  duelCacheRefreshAt.clear();
  duelWinnerGrantJobs.clear();
  return true;
}

function getDuelCacheEntry(rawInstallId) {
  const installId = normalizeInstallId(rawInstallId);
  if (!installId) return null;
  const currentWeek = getDuelParisWeekId();
  if (duelWeekCacheKey !== currentWeek) {
    duelWeekCacheKey = currentWeek;
    for (const [key, value] of duelInstallCache.entries()) {
      if (!value || value.weekId !== currentWeek) {
        duelInstallCache.delete(key);
      }
    }
    for (const key of duelWinnerGrantJobs.keys()) {
      if (!String(key).startsWith(`${currentWeek}:`)) {
        duelWinnerGrantJobs.delete(key);
      }
    }
  }
  return duelInstallCache.get(installId) || null;
}

function scheduleWeeklyWinnerGobblarsGrant(rawInstallId, weekId) {
  const installId = normalizeInstallId(rawInstallId);
  const safeWeekId = String(weekId || "").trim();
  if (!installId || !safeWeekId) return;
  const jobKey = `${safeWeekId}:${installId}`;
  const existing = duelWinnerGrantJobs.get(jobKey);
  if (existing) return;
  const job = grantWeeklyWinnerGobblars({
    installId,
    weekId: safeWeekId,
    amount: WEEKLY_WIN_GOBBLARS_BONUS,
  })
    .catch(() => {})
    .finally(() => {
      duelWinnerGrantJobs.set(jobKey, "done");
    });
  duelWinnerGrantJobs.set(jobKey, job);
}

function isDailyChampionInstallId(raw) {
  const entry = getDuelCacheEntry(raw);
  return !!entry?.crowned;
}

function getTeamForInstallCached(rawInstallId) {
  const entry = getDuelCacheEntry(rawInstallId);
  const team = entry?.team;
  return team === "red" || team === "blue" ? team : null;
}

async function refreshInstallDuelCache(rawInstallId) {
  const installId = normalizeInstallId(rawInstallId);
  if (!installId) return null;
  const weekId = getDuelParisWeekId();
  const [team, crowned] = await Promise.all([
    getTeamForInstall(installId, { weekId }),
    isInstallCrowned(installId, weekId),
  ]);
  const entry = {
    weekId,
    team: team === "red" || team === "blue" ? team : null,
    crowned: !!crowned,
    updatedAt: Date.now(),
  };
  duelInstallCache.set(installId, entry);
  if (entry.crowned && entry.weekId) {
    scheduleWeeklyWinnerGobblarsGrant(installId, entry.weekId);
  }
  return entry;
}

function scheduleInstallDuelCacheRefresh(rawInstallId, minIntervalMs = DUEL_CACHE_REFRESH_MIN_MS) {
  const installId = normalizeInstallId(rawInstallId);
  if (!installId) return;
  const now = Date.now();
  const lastAt = Number(duelCacheRefreshAt.get(installId)) || 0;
  if (now - lastAt < minIntervalMs) return;
  duelCacheRefreshAt.set(installId, now);
  void refreshInstallDuelCache(installId).catch(() => {});
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

function sanitizeCrashText(raw, maxLen = 4000) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.length <= maxLen ? trimmed : trimmed.slice(0, maxLen);
}

function sanitizeCrashValue(raw, depth = 0) {
  if (raw == null) return null;
  if (typeof raw === "string") return sanitizeCrashText(raw, 4000);
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "boolean") return raw;
  if (Array.isArray(raw)) {
    if (depth >= 5) return [`[truncated:${raw.length}]`];
    return raw.slice(0, 80).map((value) => sanitizeCrashValue(value, depth + 1));
  }
  if (typeof raw === "object") {
    if (depth >= 5) return "[max-depth]";
    const sanitized = {};
    for (const [key, value] of Object.entries(raw).slice(0, 80)) {
      const safeKey = sanitizeCrashText(String(key || ""), 120);
      if (!safeKey) continue;
      sanitized[safeKey] = sanitizeCrashValue(value, depth + 1);
    }
    return sanitized;
  }
  return sanitizeCrashText(String(raw), 1000);
}

function appendClientCrashLog(entry) {
  try {
    clientCrashLogger.logLine(`${JSON.stringify(entry)}\n`);
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
loadInstallAliases();

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

function getRoundPlan(roundNumber, roomConfig) {
  const base = {
    roundNumber,
    gridSize: roomConfig?.gridSize || 4,
    isSpecial: false,
    type: "normal",
    label: "Manche classique",
    description: null,
    minWords: roomConfig?.minWords || 0,
  };

  if (FORCE_SELF_SPECIAL_3_WORDS_ALL_ROUNDS) {
    return buildSelfSpecial3WordsRoundPlan(roundNumber, roomConfig);
  }

  if (FORCE_TARGET_SPECIALS_LOCAL) {
    const useLong = roundNumber % 2 === 0;
    return useLong
      ? buildTargetLongTournamentPlan(roundNumber, roomConfig)
      : buildTargetScoreTournamentPlan(roundNumber, roomConfig);
  }

  if (roundNumber > 0 && roundNumber % SPECIAL_ROUND_EVERY === 0) {
    if (FORCE_SELF_SPECIAL_3_WORDS_ALL_SPECIALS) {
      return {
        ...base,
        isSpecial: true,
        type: SELF_SPECIAL_3_WORDS_TYPE,
        label: "3 mots",
        description:
          "Glisse les 4 tuiles spéciales sur la grille et valide 3 mots avec des tuiles de départ différentes",
        disableBonuses: true,
        qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
      };
    }
    const specialIndex = Math.floor(roundNumber / SPECIAL_ROUND_EVERY) - 1;
    const speedTurn = specialIndex % 2 === 0;
    if (speedTurn) {
      return {
        ...base,
        isSpecial: true,
        type: "speed",
        label: "Manche rapidité",
        description: "Tous les mots valent 11 pts, on vise la rafale",
        minWords: SPEED_MIN_WORDS,
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
      minWords: (roomConfig?.minWords || 0) + MONSTROUS_EXTRA_MIN_WORDS,
      minTotalScore: MONSTROUS_MIN_TOTAL_SCORE,
      minLongWordLen: MONSTROUS_MIN_LONG_WORD_LEN,
      minLongWordCount: MONSTROUS_MIN_LONG_WORD_COUNT,
      qualityAttempts: MONSTROUS_QUALITY_ATTEMPTS,
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
  return {
    ...base,
    isSpecial: true,
    type: "speed",
    label: "Manche rapidité",
    description: `Tous les mots valent ${SPEED_WORD_SCORE} pts, on vise la rafale`,
    minWords: SPEED_MIN_WORDS,
    fixedWordScore: SPEED_WORD_SCORE,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildMonstrousTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: "monstrous",
    label: "Grille monstrueuse",
    description: "Grille chargée en mots très longs et gros score potentiel",
    minWords: (roomConfig?.minWords || 0) + MONSTROUS_EXTRA_MIN_WORDS,
    minTotalScore: MONSTROUS_MIN_TOTAL_SCORE,
    minLongWordLen: MONSTROUS_MIN_LONG_WORD_LEN,
    minLongWordCount: MONSTROUS_MIN_LONG_WORD_COUNT,
    qualityAttempts: MONSTROUS_QUALITY_ATTEMPTS,
  };
}

function buildTargetLongTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: "target_long",
    label: "Mot le plus long",
    description: "Trouve le mot le plus long (indices progressifs pendant la manche)",
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
    description:
      "Trouve le meilleur mot (celui qui rapporte le plus de points, indices progressifs)",
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

function buildFakeTwinsTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: FAKE_TWINS_TYPE,
    label: FAKE_TWINS_LABEL,
    description:
      "Une case de la grille peut valoir l'une ou l'autre de deux lettres. Seuls les mots de 4 lettres ou plus sont valides",
    minWordLength: FAKE_TWINS_MIN_WORD_LENGTH,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildSelfSpecial3WordsTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: SELF_SPECIAL_3_WORDS_TYPE,
    label: "3 mots",
    description:
      "Glisse les 4 tuiles spéciales sur la grille et valide 3 mots avec des tuiles de départ différentes",
    disableBonuses: true,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildSelfSpecial3WordsRoundPlan(roundNumber, roomConfig) {
  const size = roomConfig?.gridSize || 4;
  return {
    roundNumber,
    gridSize: size,
    isSpecial: true,
    type: SELF_SPECIAL_3_WORDS_TYPE,
    label: "3 mots",
    description:
      "Glisse les 4 tuiles spéciales sur la grille et valide 3 mots avec des tuiles de départ différentes",
    minWords: roomConfig?.minWords || 0,
    disableBonuses: true,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function pickWeightedItem(items) {
  const weightedItems = Array.isArray(items) ? items : [];
  const totalWeight = weightedItems.reduce((sum, item) => {
    const weight = Number(item?.weight);
    return sum + (Number.isFinite(weight) && weight > 0 ? weight : 0);
  }, 0);
  if (!(totalWeight > 0)) return null;
  let roll = Math.random() * totalWeight;
  for (const item of weightedItems) {
    const weight = Number(item?.weight);
    if (!(Number.isFinite(weight) && weight > 0)) continue;
    roll -= weight;
    if (roll <= 0) return item?.value ?? null;
  }
  return weightedItems[weightedItems.length - 1]?.value ?? null;
}

function buildTournamentSpecials(roomConfig) {
  const specials = new Map();
  if (FORCE_SELF_SPECIAL_3_WORDS_ALL_SPECIALS) {
    for (const round of TOURNAMENT_SPECIAL_ROUNDS) {
      specials.set(round, buildSelfSpecial3WordsTournamentPlan(round, roomConfig));
    }
    return specials;
  }
  const weightedFactories = [
    { weight: 0.5, value: (round) => buildSpeedTournamentPlan(round, roomConfig) },
    { weight: 1, value: (round) => buildMonstrousTournamentPlan(round, roomConfig) },
    { weight: 1, value: (round) => buildSelfSpecial3WordsTournamentPlan(round, roomConfig) },
    { weight: 1, value: (round) => buildTargetLongTournamentPlan(round, roomConfig) },
    { weight: 1, value: (round) => buildTargetScoreTournamentPlan(round, roomConfig) },
    { weight: 1, value: (round) => buildBonusLetterTournamentPlan(round, roomConfig) },
    { weight: 1, value: (round) => buildFakeTwinsTournamentPlan(round, roomConfig) },
  ];
  for (const round of TOURNAMENT_SPECIAL_ROUNDS) {
    const pick = pickWeightedItem(weightedFactories);
    if (typeof pick !== "function") continue;
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
    totals: new Map(), // nick -> { points, gobbles, roundScoreSum }
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
  room.bufferedPreparedGrid = null;
  room.bufferedPreparedGridPromise = null;
  room.bufferedPreparedGridPromiseMeta = null;
}

function getTournamentRoundPlan(room, tournamentRound) {
  if (FORCE_FAKE_TWINS_ALL_ROUNDS) {
    return buildFakeTwinsTournamentPlan(tournamentRound, room.config);
  }
  if (FORCE_SELF_SPECIAL_3_WORDS_ALL_ROUNDS) {
    return buildSelfSpecial3WordsTournamentPlan(tournamentRound, room.config);
  }
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
  if (plan.type === SELF_SPECIAL_3_WORDS_TYPE) {
    return `ATTENTION, MANCHE SPECIALE A SUIVRE : ${label} (3 mots, tuiles de départ différentes)`;
  }
  if (plan.type === FAKE_TWINS_TYPE) {
    return `ATTENTION, MANCHE SPECIALE A SUIVRE : ${label} (une case vaut 2 lettres, mots de 4+ lettres)`;
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
    nextPreparedGridPromise: null,
    nextPreparedGridPromiseRoundNumber: null,
    bufferedPreparedGrid: null,
    bufferedPreparedGridPromise: null,
    bufferedPreparedGridPromiseMeta: null,
    roundCounter: 0,
    specialWarningIssuedFor: null,
    breakState: null, // { nextStartAt, breakKind, tournament, nextSpecial }
    lastRoundResults: null,
    pendingDisconnects: new Map(), // socket.id -> { timer, installId, nick }
    presenceAnnouncedAt: new Map(), // installId -> last join announcement ts
    rankingBroadcastTimer: null,
    rankingLastBroadcastAt: 0,
    rankingLastSignature: null,
    rankingPendingPayload: null,
    rankingPendingSignature: null,
  };
}

const rooms = new Map(
  Object.entries(ROOM_CONFIGS)
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
        userId: Number.isInteger(Number(p?.userId)) ? Number(p.userId) : null,
        installId: p.installId || null,
        team: getTeamForInstallCached(p.installId),
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
  const installId = getInstallIdForNick(room, nick);
  if (installId) {
    void recordTournamentMedalPoints({
      installId,
      nick,
      type,
      dateId: getParisDateId(),
    }).catch((err) => {
      console.warn(`[${room.id}] medal duel points failed for ${nick} (${type})`, err);
    });
    const gobblarsAmount = Number(MEDAL_GOBBLARS[type]) || 0;
    if (gobblarsAmount > 0) {
      void addGobblars({
        installId,
        amount: gobblarsAmount,
        reason: "tournament_medal",
        meta: {
          roomId: room.id,
          nick,
          medal: type,
        },
      })
        .then((result) => {
          if (!result || result.ok === false) return;
          emitToInstallId(room, installId, "gobblarsAwarded", {
            kind: "tournament_medal",
            medal: type,
            amount: gobblarsAmount,
            balance: Number(result.balance) || 0,
            nick,
            ts: Date.now(),
          });
        })
        .catch((err) => {
          console.warn(`[${room.id}] medal gobblars failed for ${nick} (${type})`, err);
        });
    }
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

function emitToInstallId(room, installId, eventName, payload) {
  if (!room || !installId || !eventName) return;
  const normalized = normalizeInstallId(installId);
  if (!normalized) return;
  for (const [socketId, player] of room.players.entries()) {
    if (normalizeInstallId(player?.installId) !== normalized) continue;
    if (player?.connected === false) continue;
    io.to(socketId).emit(eventName, payload);
  }
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

function isRoundActive(round) {
  return !!round && (round.status === "running" || round.status === "intro");
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
  const isBonusLetterRound = round.special?.type === "bonus_letter";
  const isSpecial3WordsRound = round.special?.type === "self_specials_3_words";
  const bonusBestPts = Number(room?.bestPossibleStats?.maxPts) || 0;
  const bonusPossibleScore = Number(room?.bestPossibleStats?.totalPts) || 0;

  return {
    roomId: room.id,
    roundId: round.id,
    grid: round.grid,
    gridSize: room.config.gridSize,
    durationMs: round.durationMs,
    endsAt: round.endsAt,
    startsAt:
      Number.isFinite(round.startsAt)
        ? round.startsAt
        : Number.isFinite(round.endsAt) && Number.isFinite(round.durationMs)
        ? round.endsAt - round.durationMs
        : null,
    introMs: Number.isFinite(round.introMs) ? Math.max(0, round.introMs) : 0,
    status: round.status || "running",
    targetLength: round.targetLength || null,
    targetHintScheduleMs: Array.isArray(round.targetHintScheduleMs)
      ? round.targetHintScheduleMs
      : [],
    special: round.special?.isSpecial ? round.special : null,
    gridQuality: currentQuality
      ? {
          words: currentQuality.words ?? 0,
          maxLen: currentQuality.maxLen ?? 0,
          maxPts:
            isBonusLetterRound
              ? bonusBestPts || currentQuality.maxPts || 0
              : isSpecial3WordsRound
              ? Number(currentQuality?.special3Words?.maxPts) ||
                Number(room?.bestPossibleStats?.maxPts) ||
                currentQuality.maxPts ||
                0
              : round.special?.fixedWordScore || currentQuality.maxPts || 0,
          totalPts: currentQuality.totalPts ?? 0,
          possibleScore:
            isBonusLetterRound
              ? bonusPossibleScore || currentQuality.possibleScore || currentQuality.totalPts || 0
              : currentQuality.possibleScore ?? currentQuality.totalPts ?? 0,
          longWords: currentQuality.longWords ?? 0,
          fakeTwinWords: currentQuality.fakeTwinWords ?? 0,
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
      team: getTeamForInstallCached(player.installId),
      isDailyChampion: isDailyChampionInstallId(player.installId),
    });
  }
  ranking.sort((a, b) => (b.score || 0) - (a.score || 0));
  return ranking.map((entry, idx) => ({
    nick: entry.nick,
    rank: idx + 1,
    team: entry.team || null,
    isDailyChampion: !!entry.isDailyChampion,
  }));
}

function buildSessionSnapshot(room, player) {
  if (!room || !player) return null;
  const round = room.currentRound;
  const hasActiveRound = isRoundActive(round);
  const phase = hasActiveRound ? "playing" : room.breakState ? "results" : "lobby";
  const currentRoundPayload = hasActiveRound ? buildRoundStartedPayload(room) : null;
  let score = 0;
  let words = [];
  let participated = false;
  let special3Words = null;
  if (hasActiveRound) {
    const roundSubs = room.submissions.get(round.id) || null;
    const playerRound = roundSubs ? roundSubs.get(player.nick) : null;
    score = playerRound?.score || 0;
    words = Array.from(playerRound?.words || []);
    participated = hasPlayerActivity(playerRound);
    if (playerRound?.specialWordSlots || playerRound?.specialPlacements) {
      special3Words = {
        wordSlots: Array.isArray(playerRound?.specialWordSlots)
          ? playerRound.specialWordSlots.map((slot) => ({
              id: slot?.id ?? null,
              word: slot?.word || "",
              display: slot?.display || "",
              path: Array.isArray(slot?.path) ? slot.path : [],
              pts: Number.isFinite(slot?.pts) ? slot.pts : null,
            }))
          : [],
        specialPlacements:
          playerRound?.specialPlacements && typeof playerRound.specialPlacements === "object"
            ? playerRound.specialPlacements
            : {},
      };
    }
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
    userId: Number.isInteger(Number(player?.userId)) ? Number(player.userId) : null,
    connected: isPlayerConnected(player),
    score,
    words,
    participated,
    team: getTeamForInstallCached(player.installId),
    isDailyChampion: isDailyChampionInstallId(player.installId),
    special3Words,
  };

  return {
    roomId: room.id,
    phase,
    player: playerState,
    currentRound: currentRoundPayload,
    ranking: hasActiveRound && round?.id ? buildLiveRanking(room, round.id) : [],
    breakState: buildBreakSnapshot(room),
    lastRoundResults: room.lastRoundResults || null,
  };
}

function ensurePlayerInRound(room, nick) {
  if (!room.currentRound) return;
  const roundSubs = room.submissions.get(room.currentRound.id);
  if (!roundSubs) return;
  if (!roundSubs.has(nick)) {
    roundSubs.set(nick, { words: new Set(), score: 0, wordTimes: new Map(), wordMeta: new Map() });
  }
}

function clearPendingRankingBroadcast(room) {
  if (!room) return;
  if (room.rankingBroadcastTimer) {
    clearTimeout(room.rankingBroadcastTimer);
    room.rankingBroadcastTimer = null;
  }
  room.rankingPendingPayload = null;
  room.rankingPendingSignature = null;
}

function buildRankingUpdatePayload(room) {
  if (!room?.currentRound || room.currentRound.status !== "running") return null;
  const roundSubs = room.submissions.get(room.currentRound.id);
  if (!roundSubs) return null;

  const ranking = [];
  for (const player of room.players.values()) {
    const data = roundSubs.get(player.nick);
    const connected = isPlayerConnected(player) || isBotToken(player?.token);
    const active = connected || hasPlayerActivity(data);
    if (!active) continue;
    ranking.push({
      nick: player.nick,
      score: data?.score || 0,
      team: getTeamForInstallCached(player.installId),
      isDailyChampion: isDailyChampionInstallId(player.installId),
    });
  }

  ranking.sort((a, b) => b.score - a.score);
  const compact = ranking.map((entry, idx) => ({
    nick: entry.nick,
    rank: idx + 1,
    team: entry.team || null,
    isDailyChampion: entry.isDailyChampion || false,
  }));
  const signature = ranking
    .map(
      (entry) =>
        `${entry.nick}:${Number(entry.score) || 0}:${entry.team || ""}:${entry.isDailyChampion ? 1 : 0}`
    )
    .join("|");

  return {
    payload: {
      roomId: room.id,
      roundId: room.currentRound.id,
      ranking: compact,
    },
    signature,
  };
}

function emitRankingUpdate(room, built) {
  if (!room || !built?.payload) return;
  if (built.signature && built.signature === room.rankingLastSignature) {
    return;
  }
  io.to(room.id).emit("rankingUpdate", built.payload);
  room.rankingLastSignature = built.signature || null;
  room.rankingLastBroadcastAt = Date.now();
}

function markPresenceJoinAnnounced(room, rawInstallId) {
  if (!room?.presenceAnnouncedAt) return;
  const installId = normalizeInstallId(rawInstallId);
  if (!installId) return;
  room.presenceAnnouncedAt.set(installId, Date.now());
}

function wasPresenceJoinAnnounced(room, rawInstallId) {
  if (!room?.presenceAnnouncedAt) return false;
  const installId = normalizeInstallId(rawInstallId);
  if (!installId) return false;
  return room.presenceAnnouncedAt.has(installId);
}

function clearPresenceAnnouncement(room, rawInstallId) {
  if (!room?.presenceAnnouncedAt) return;
  const installId = normalizeInstallId(rawInstallId);
  if (!installId) return;
  room.presenceAnnouncedAt.delete(installId);
}

function flushPendingRankingBroadcast(room) {
  if (!room) return;
  room.rankingBroadcastTimer = null;
  if (!room.rankingPendingPayload) return;
  const built = {
    payload: room.rankingPendingPayload,
    signature: room.rankingPendingSignature,
  };
  room.rankingPendingPayload = null;
  room.rankingPendingSignature = null;
  emitRankingUpdate(room, built);
}

function broadcastProvisionalRanking(room, { force = false } = {}) {
  if (!room?.currentRound || room.currentRound.status !== "running") return;
  const built = buildRankingUpdatePayload(room);
  if (!built) return;

  room.rankingPendingPayload = built.payload;
  room.rankingPendingSignature = built.signature;

  const now = Date.now();
  const elapsed = now - (room.rankingLastBroadcastAt || 0);

  if (force || elapsed >= RANKING_BROADCAST_MIN_MS) {
    if (room.rankingBroadcastTimer) {
      clearTimeout(room.rankingBroadcastTimer);
      room.rankingBroadcastTimer = null;
    }
    const immediate = {
      payload: room.rankingPendingPayload,
      signature: room.rankingPendingSignature,
    };
    room.rankingPendingPayload = null;
    room.rankingPendingSignature = null;
    emitRankingUpdate(room, immediate);
    return;
  }

  if (room.rankingBroadcastTimer) return;
  const waitMs = Math.max(0, RANKING_BROADCAST_MIN_MS - elapsed);
  room.rankingBroadcastTimer = setTimeout(() => flushPendingRankingBroadcast(room), waitMs);
  room.rankingBroadcastTimer.unref?.();
}

function broadcastCrownUpdate() {
  rooms.forEach((room) => {
    emitPlayers(room);
    broadcastProvisionalRanking(room);
  });
}

async function refreshConnectedPlayersDuelCache() {
  let changed = false;
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      const installId = normalizeInstallId(player?.installId);
      if (!installId) continue;
      const prev = getDuelCacheEntry(installId);
      try {
        const next = await refreshInstallDuelCache(installId);
        if (
          !prev ||
          prev.team !== next?.team ||
          !!prev.crowned !== !!next?.crowned ||
          prev.weekId !== next?.weekId
        ) {
          changed = true;
        }
      } catch (_) {}
    }
  }
  if (changed) {
    broadcastCrownUpdate();
  }
}

function normalizeChatReactionEmoji(raw) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  return CHAT_REACTION_ALLOWED_EMOJIS.has(value) ? value : "";
}

function normalizeChatReactions(rawReactions) {
  if (!rawReactions || typeof rawReactions !== "object" || Array.isArray(rawReactions)) {
    return {};
  }
  const normalized = {};
  for (const [rawEmoji, rawUsers] of Object.entries(rawReactions)) {
    const emoji = normalizeChatReactionEmoji(rawEmoji);
    if (!emoji) continue;
    const usersArray = Array.isArray(rawUsers) ? rawUsers : [];
    const seenInstallIds = new Set();
    const users = [];
    for (const user of usersArray) {
      const installId = normalizeInstallId(user?.installId);
      if (!installId || seenInstallIds.has(installId)) continue;
      const nick = typeof user?.nick === "string" ? user.nick.trim().slice(0, NICK_MAX_LEN) : "";
      seenInstallIds.add(installId);
      users.push({
        installId,
        nick: nick || "Anonyme",
      });
      if (users.length >= CHAT_REACTION_MAX_USERS_PER_EMOJI) break;
    }
    if (users.length > 0) normalized[emoji] = users;
  }
  return normalized;
}

function isSystemChatEntry(entry) {
  return (
    entry?.type === "system" ||
    entry?.channel === "system" ||
    String(entry?.nick || entry?.author || "").trim().toLowerCase() === "système" ||
    String(entry?.nick || entry?.author || "").trim().toLowerCase() === "systeme" ||
    String(entry?.nick || entry?.author || "").trim().toLowerCase() === "system"
  );
}

function buildChatReplyPreviewFromMessage(message) {
  if (!message || typeof message !== "object") return null;
  const id = typeof message.id === "string" ? message.id.trim() : "";
  if (!id) return null;
  const nick = String(message.nick || message.author || "Anonyme")
    .trim()
    .slice(0, NICK_MAX_LEN);
  const text = String(message.text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_REPLY_TEXT_MAX_LEN);
  if (!text) return null;
  return {
    id,
    nick: nick || "Anonyme",
    userId: Number.isInteger(Number(message?.userId)) ? Number(message.userId) : null,
    installId: normalizeInstallId(message.installId) || null,
    text,
    t: Number(message.t) || Date.now(),
  };
}

function resolveReplyPreviewFromPayload(room, rawReplyTo) {
  if (!room || !rawReplyTo || typeof rawReplyTo !== "object") return null;
  const targetId = typeof rawReplyTo.id === "string" ? rawReplyTo.id.trim() : "";
  if (!targetId) return null;
  const source = Array.isArray(room.chatMessages)
    ? room.chatMessages.find((entry) => entry?.id === targetId)
    : null;
  if (!source || isSystemChatEntry(source)) return null;
  return buildChatReplyPreviewFromMessage(source);
}

function updateChatMessageReactions(room, { messageId, emoji, installId, nick }) {
  if (!room || typeof messageId !== "string" || !messageId.trim()) {
    return { ok: false, error: "invalid_message_id" };
  }
  const targetId = messageId.trim();
  const selectedEmoji = normalizeChatReactionEmoji(emoji);
  if (!selectedEmoji) {
    return { ok: false, error: "invalid_emoji" };
  }
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) {
    return { ok: false, error: "invalid_install_id" };
  }
  const safeNick = typeof nick === "string" ? nick.trim().slice(0, NICK_MAX_LEN) : "";
  const list = Array.isArray(room.chatMessages) ? room.chatMessages : [];
  const target = list.find((entry) => entry?.id === targetId);
  if (!target || isSystemChatEntry(target)) {
    return { ok: false, error: "message_not_found" };
  }

  const reactions = normalizeChatReactions(target.reactions);
  let hadSameReaction = false;
  Object.keys(reactions).forEach((reactionEmoji) => {
    const before = reactions[reactionEmoji];
    const filtered = before.filter((user) => user.installId !== safeInstallId);
    if (reactionEmoji === selectedEmoji && filtered.length !== before.length) {
      hadSameReaction = true;
    }
    if (filtered.length) reactions[reactionEmoji] = filtered;
    else delete reactions[reactionEmoji];
  });

  if (!hadSameReaction) {
    const users = Array.isArray(reactions[selectedEmoji]) ? reactions[selectedEmoji] : [];
    users.push({
      installId: safeInstallId,
      nick: safeNick || "Anonyme",
    });
    reactions[selectedEmoji] = users.slice(-CHAT_REACTION_MAX_USERS_PER_EMOJI);
  }

  const normalized = normalizeChatReactions(reactions);
  const hasReactions = Object.keys(normalized).length > 0;
  if (hasReactions) target.reactions = normalized;
  else delete target.reactions;
  target.reactionsUpdatedAt = Date.now();

  return {
    ok: true,
    message: target,
    reactions: hasReactions ? normalized : {},
  };
}

function updateChatMessageText(room, { messageId, installId, text }) {
  if (!room || typeof messageId !== "string" || !messageId.trim()) {
    return { ok: false, error: "invalid_message_id" };
  }
  const targetId = messageId.trim();
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) {
    return { ok: false, error: "invalid_install_id" };
  }
  const trimmedText = typeof text === "string" ? text.trim() : "";
  if (!trimmedText) {
    return { ok: false, error: "empty_text" };
  }
  if (trimmedText.length > CHAT_MESSAGE_TEXT_MAX_LEN) {
    return { ok: false, error: "text_too_long" };
  }

  const list = Array.isArray(room.chatMessages) ? room.chatMessages : [];
  const target = list.find((entry) => entry?.id === targetId);
  if (!target || isSystemChatEntry(target)) {
    return { ok: false, error: "message_not_found" };
  }
  if (normalizeInstallId(target.installId) !== safeInstallId) {
    return { ok: false, error: "forbidden" };
  }
  target.text = trimmedText;
  target.editedAt = Date.now();
  return { ok: true, message: target };
}

function deleteChatMessage(room, { messageId, installId }) {
  if (!room || typeof messageId !== "string" || !messageId.trim()) {
    return { ok: false, error: "invalid_message_id" };
  }
  const targetId = messageId.trim();
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) {
    return { ok: false, error: "invalid_install_id" };
  }
  const list = Array.isArray(room.chatMessages) ? room.chatMessages : [];
  const targetIndex = list.findIndex((entry) => entry?.id === targetId);
  if (targetIndex < 0) {
    return { ok: false, error: "message_not_found" };
  }
  const target = list[targetIndex];
  if (!target || isSystemChatEntry(target)) {
    return { ok: false, error: "message_not_found" };
  }
  if (normalizeInstallId(target.installId) !== safeInstallId) {
    return { ok: false, error: "forbidden" };
  }
  list.splice(targetIndex, 1);
  room.chatMessages = list;
  return { ok: true, messageId: targetId, deletedAt: Date.now() };
}

function pushChatMessage(room, message) {
  if (!room || !message || typeof message !== "object") return;
  const prevMessages = Array.isArray(room.chatMessages) ? room.chatMessages : [];
  const deduped = [];
  const seen = new Set();
  for (const entry of [...prevMessages, message]) {
    if (!entry || typeof entry !== "object") continue;
    const id = typeof entry.id === "string" ? entry.id : "";
    const key = id
      ? `id:${id}`
      : `fallback:${entry.t || entry.ts || 0}:${entry.nick || entry.author || ""}:${entry.text || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  const users = [];
  const system = [];
  for (let i = deduped.length - 1; i >= 0; i -= 1) {
    const entry = deduped[i];
    const isSystem = isSystemChatEntry(entry);
    if (isSystem) {
      if (system.length < MAX_SYSTEM_CHAT_HISTORY) system.push(entry);
      continue;
    }
    if (users.length < MAX_CHAT_HISTORY) users.push(entry);
  }

  const merged = [...users.reverse(), ...system.reverse()];
  merged.sort((a, b) => {
    const tA = Number(a?.t ?? a?.ts ?? 0) || 0;
    const tB = Number(b?.t ?? b?.ts ?? 0) || 0;
    if (tA !== tB) return tA - tB;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
  room.chatMessages = merged;

  io.to(room.id).emit("chatMessage", message);
}

function getTeamDot(team) {
  return team === "red" ? "🔴" : team === "blue" ? "🔵" : "⚪";
}

function pushSystemChatMessage(room, text, opts = {}) {
  if (!room) return;
  const trimmedText = String(text || "").trim();
  if (!trimmedText) return;
  const installId = normalizeInstallId(opts.installId || "");
  const team = opts.team === "red" || opts.team === "blue" ? opts.team : null;
  const message = {
    id: randomUUID(),
    t: Date.now(),
    roomId: room.id,
    nick: "Système",
    author: "Système",
    channel: "system",
    type: "system",
    text: trimmedText,
    installId: installId || null,
    team,
    meta: opts.meta && typeof opts.meta === "object" ? opts.meta : null,
  };
  pushChatMessage(room, message);
}

function broadcastSystemChatMessage(text, opts = {}) {
  for (const room of rooms.values()) {
    pushSystemChatMessage(room, text, opts);
  }
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
      team: getTeamForInstallCached(lookup?.player?.installId),
      isDailyChampion: isDailyChampionInstallId(lookup?.player?.installId),
    });
  }
  ranking.sort((a, b) => b.score - a.score);
  return ranking;
}

function computeBestPossible(grid, special = null) {
  if (!dictionary) return { maxLen: 0, maxPts: 0, totalPts: 0 };
  const solved = solveGridCached(grid, dictionary, special);
  let maxLen = 0;
  let maxPts = 0;
  let totalPts = 0;
  for (const [word, data] of solved.entries()) {
    const len = word.length;
    const pts = data?.pts || 0;
    if (len > maxLen) maxLen = len;
    if (pts > maxPts) maxPts = pts;
    totalPts += pts;
  }
  return { maxLen, maxPts, totalPts };
}

function getSpecialScoreConfigFromPlan(plan) {
  if (plan?.type === "bonus_letter" && plan?.bonusLetter) {
    return {
      bonusLetter: plan.bonusLetter,
      bonusLetterScore: plan.bonusLetterScore || BONUS_LETTER_SCORE,
      disableBonuses: true,
    };
  }
  if (plan?.type === FAKE_TWINS_TYPE) {
    return {
      type: FAKE_TWINS_TYPE,
      minWordLength: plan?.minWordLength || FAKE_TWINS_MIN_WORD_LENGTH,
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
  if (plan?.type === FAKE_TWINS_TYPE) {
    return {
      type: FAKE_TWINS_TYPE,
      minWordLength: plan?.minWordLength || FAKE_TWINS_MIN_WORD_LENGTH,
    };
  }
  return null;
}

function normalizeSpecial3Placements(rawPlacements, totalCells) {
  const placements = {};
  const occupied = new Set();
  const source =
    rawPlacements && typeof rawPlacements === "object" && !Array.isArray(rawPlacements)
      ? rawPlacements
      : {};
  for (const bonus of MOVABLE_BONUS_KEYS) {
    const rawIdx = source?.[bonus];
    const idx =
      Number.isInteger(rawIdx)
        ? rawIdx
        : typeof rawIdx === "string" && /^-?\d+$/.test(rawIdx)
        ? Number(rawIdx)
        : NaN;
    if (!Number.isInteger(idx)) continue;
    if (idx < 0 || idx >= totalCells) continue;
    if (occupied.has(idx)) continue;
    occupied.add(idx);
    placements[bonus] = idx;
  }
  return placements;
}

function applySpecial3Placements(grid, placements) {
  const base = Array.isArray(grid)
    ? grid.map((cell) => ({
        letter: cell?.letter || "?",
        bonus: null,
      }))
    : [];
  const safePlacements = normalizeSpecial3Placements(placements, base.length);
  for (const bonus of MOVABLE_BONUS_KEYS) {
    const idx = safePlacements[bonus];
    if (!Number.isInteger(idx) || !base[idx]) continue;
    base[idx] = { ...base[idx], bonus };
  }
  return { board: base, placements: safePlacements };
}

function normalizeSpecial3WordSlots(rawSlots) {
  if (!Array.isArray(rawSlots)) return [];
  return rawSlots.slice(0, SELF_SPECIAL_3_WORDS_WORD_TARGET).map((slot, idx) => ({
    id: idx,
    word: normalizeWord(String(slot?.word || "")),
    display: String(slot?.display || slot?.word || "").trim(),
    path: Array.isArray(slot?.path)
      ? slot.path
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value >= 0)
      : [],
  }));
}

function getSpecial3WordStartTile(path) {
  const first = Array.isArray(path) ? Number(path[0]) : NaN;
  return Number.isInteger(first) && first >= 0 ? first : null;
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

function normalizeTargetRevealIndices(revealed) {
  if (!Array.isArray(revealed) || revealed.length === 0) return [];
  return revealed
    .filter((idx) => Number.isInteger(idx) && idx >= 0)
    .sort((a, b) => a - b);
}

function expandTargetRevealed(word, revealed) {
  if (!word || typeof word !== "string") return new Set(revealed || []);
  const chars = word.split("");
  const expanded = new Set(revealed || []);
  for (let i = 0; i < chars.length - 1; i++) {
    if (chars[i].toUpperCase() !== "Q") continue;
    if (chars[i + 1].toUpperCase() !== "U") continue;
    if (expanded.has(i) || expanded.has(i + 1)) {
      expanded.add(i);
      expanded.add(i + 1);
    }
  }
  return expanded;
}

function pickTargetRevealGroup(word, revealed) {
  if (!word || typeof word !== "string") return null;
  const chars = word.split("");
  const expanded = expandTargetRevealed(word, revealed);
  const groups = [];
  for (let i = 0; i < chars.length; i++) {
    if (expanded.has(i)) continue;
    const ch = chars[i].toUpperCase();
    if (ch === "Q" && i + 1 < chars.length && chars[i + 1].toUpperCase() === "U") {
      if (!expanded.has(i + 1)) {
        groups.push([i, i + 1]);
      }
      i += 1;
      continue;
    }
    if (ch === "U" && i > 0 && chars[i - 1].toUpperCase() === "Q") {
      continue;
    }
    groups.push([i]);
  }
  if (!groups.length) return null;
  return groups[Math.floor(Math.random() * groups.length)];
}

function getTargetHintScheduleMs({
  targetWord = "",
  targetLength = null,
  roundDurationMs = 90 * 1000,
  roundType = "target_long",
} = {}) {
  const rawLength =
    Number.isFinite(targetLength) && targetLength > 0
      ? Number(targetLength)
      : typeof targetWord === "string"
      ? targetWord.length
      : 0;
  const safeLength = Math.max(1, Math.floor(rawLength));
  const isTargetScoreRound = roundType === "target_score";
  const scheduleByLength = isTargetScoreRound
    ? TARGET_HINT_SCHEDULE_SECONDS_SCORE_BY_LENGTH
    : TARGET_HINT_SCHEDULE_SECONDS_BY_LENGTH;
  const fallbackSchedule = isTargetScoreRound
    ? TARGET_HINT_SCORE_DEFAULT_SECONDS
    : TARGET_HINT_DEFAULT_SECONDS;
  const key =
    safeLength >= 13
      ? "13+"
      : Object.prototype.hasOwnProperty.call(scheduleByLength, safeLength)
      ? safeLength
      : 11;
  const secondsList = scheduleByLength[key] || fallbackSchedule || [];
  const latestAllowed = Math.max(1000, (Number(roundDurationMs) || 90 * 1000) - 1000);
  const timings = [];
  let prev = -1;
  for (const sec of secondsList) {
    const ms = Math.max(0, Math.min(latestAllowed, Math.round(Number(sec) * 1000)));
    if (ms <= prev) continue;
    timings.push(ms);
    prev = ms;
  }
  return timings;
}

function getObjectiveTeamPointsFromUpdates(updates) {
  if (!Array.isArray(updates) || !updates.length) return 0;
  return updates
    .filter((entry) => entry?.newlyValidated)
    .reduce(
      (sum, entry) =>
        sum + (Number(entry?.teamPointsAwarded) || Number(entry?.points) || 0),
      0
    );
}

function submitWordForNick(room, { roundId, word, path, nick, traceStartedAt = null }) {
  if (!room) return { ok: false, error: "invalid_room" };
  if (!room.currentRound || room.currentRound.id !== roundId) {
    return { ok: false, error: "round_invalid" };
  }
  const now = Date.now();
  const roundEndsAt = Number.isFinite(room.currentRound.endsAt) ? room.currentRound.endsAt : null;
  const safeTraceStartedAt = Number.isFinite(traceStartedAt)
    ? Math.max(0, Math.round(Number(traceStartedAt)))
    : null;
  const graceSubmissionAllowed =
    Number.isFinite(roundEndsAt) &&
    Number.isFinite(safeTraceStartedAt) &&
    safeTraceStartedAt <= roundEndsAt &&
    now <= roundEndsAt + LIVE_ROUND_END_GRACE_MS;
  if (room.currentRound.status !== "running" && !graceSubmissionAllowed) {
    return { ok: false, error: "round_not_started" };
  }
  if (Number.isFinite(roundEndsAt) && now >= roundEndsAt && !graceSubmissionAllowed) {
    return { ok: false, error: "round_ended" };
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
  const scoreConfig = getSpecialScoreConfig(room.currentRound);
  const minWordLength =
    Number.isFinite(scoreConfig?.minWordLength) && scoreConfig.minWordLength > 0
      ? Math.trunc(scoreConfig.minWordLength)
      : 2;
  if (!normInput || normInput.length < minWordLength) {
    return { ok: false, error: "invalid_word" };
  }

  const roundSpecialType = room.currentRound?.special?.type;
  const isTargetRound = roundSpecialType === "target_long" || roundSpecialType === "target_score";
  if (roundSpecialType === SELF_SPECIAL_3_WORDS_TYPE) {
    return { ok: false, error: "special3_use_state_sync" };
  }
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
    scoreConfig
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
    data = { words: new Set(), score: 0, wordTimes: new Map(), wordMeta: new Map() };
    roundSubs.set(resolvedNick, data);
  }

  if (data.words.has(norm)) {
    return { ok: false, error: "already_played" };
  }

  data.words.add(norm);
  if (!data.wordTimes) data.wordTimes = new Map();
  if (!(data.wordMeta instanceof Map)) data.wordMeta = new Map();
  if (!data.wordTimes.has(norm)) data.wordTimes.set(norm, Date.now());
  data.wordMeta.set(norm, { usedFakeTwins: !!scored?.usedFakeTwins });
  data.score += wordPts;

  const playerObj = playerEntry?.player || null;
  const playerInstallId = normalizeInstallId(playerObj?.installId);
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
    if (flags[kind]) return false;

    const currentCount = room.currentRound.gobbles.get(resolvedNick) || 0;
    if (currentCount >= 2) return false; // max 2 gobbles comptés pour points/manche

    flags[kind] = true;
    room.currentRound.gobbleFlags.set(resolvedNick, flags);
    room.currentRound.gobbles.set(resolvedNick, currentCount + 1);
    return true;
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
      const foundAt = Date.now();
      room.currentRound.targetFoundAt.set(resolvedNick, foundAt);
      const startedAt =
        (room.currentRound.endsAt || foundAt) -
        (room.currentRound.durationMs || room.config.durationMs || 0);
      const elapsed = Math.max(0, foundAt - startedAt);
      const elapsedSeconds = elapsed / 1000;
      const elapsedLabel = (elapsedSeconds < 10 ? elapsedSeconds.toFixed(2) : elapsedSeconds.toFixed(1))
        .replace(".", ",");
      pushAnnouncement(room, {
        type: "special_target_found",
        nick: resolvedNick,
        elapsedMs: elapsed,
        elapsedSeconds,
        text: `${resolvedNick} a trouvé en ${elapsedLabel} secondes`,
      });
      io.to(room.id).emit("specialSolved", {
        roomId: room.id,
        roundId,
        nick: resolvedNick,
        kind: specialType,
      });
      if (!isBotPlayer && playerKey) {
        recordBestTargetTime(
          specialType,
          playerKey,
          resolvedNick,
          elapsed,
          targetWord,
          foundAt
        );
      }
    }
  }

  if (isTargetRound) {
    return {
      ok: true,
      score: data.score,
      wordScore: wordPts,
      usedFakeTwins: !!scored?.usedFakeTwins,
    };
  }

  if (!isBotPlayer && playerInstallId) {
    const usedBonusTile = Array.isArray(scoredPath)
      ? scoredPath.some((idx) => {
          const cell = room.currentRound?.grid?.[idx];
          const bonus = String(cell?.bonus || "");
          return bonus === "M2" || bonus === "M3";
        })
      : false;
    const usedRareLetter = /[zkxy]/i.test(norm);
    const duelRoundRef = room.currentRound;
    const duelRoundId = duelRoundRef?.id;
    const duelWordTask = recordMainWordAccepted({
      installId: playerInstallId,
      nick: resolvedNick,
      dateId: getParisDateId(),
      roundSpecialType: room.currentRound?.special?.type || null,
      wordLength: len,
      wordPoints: wordPts,
      usedBonusTile,
      usedRareLetter,
    }).then((duelWord) => {
      const updates = Array.isArray(duelWord?.updates) ? duelWord.updates : [];
      const teamPoints = getObjectiveTeamPointsFromUpdates(updates);
      if (
        teamPoints > 0 &&
        duelRoundRef &&
        duelRoundRef.id === duelRoundId
      ) {
        if (!(duelRoundRef.duelObjectivePointsByNick instanceof Map)) {
          duelRoundRef.duelObjectivePointsByNick = new Map();
        }
        duelRoundRef.duelObjectivePointsByNick.set(
          resolvedNick,
          (Number(duelRoundRef.duelObjectivePointsByNick.get(resolvedNick)) || 0) + teamPoints
        );
      }
      updates
        .filter((entry) => entry?.newlyValidated)
        .forEach((entry) => {
          const points = Number(entry?.teamPointsAwarded) || Number(entry?.points) || 0;
          pushAnnouncement(room, {
            type: "objective_validated",
            nick: resolvedNick,
            objectiveId: entry?.id || "",
            objectiveTitle: entry?.title || "Objectif",
            objectiveBucket: entry?.bucket || "",
            objectiveProgress: Number(entry?.progress) || 0,
            objectiveTarget: Number(entry?.target) || 0,
            teamPoints: points,
            text: `✅ ${resolvedNick} a validé "${entry?.title || "Objectif"}" (+${points} équipe)`,
          });
        });
    }).finally(() => {
      scheduleInstallDuelCacheRefresh(playerInstallId);
      if (
        duelRoundRef &&
        duelRoundRef.id === duelRoundId &&
        duelRoundRef.duelWordTasks instanceof Set
      ) {
        duelRoundRef.duelWordTasks.delete(duelWordTask);
      }
    });
    if (duelRoundRef && duelRoundRef.id === duelRoundId) {
      if (!(duelRoundRef.duelWordTasks instanceof Set)) {
        duelRoundRef.duelWordTasks = new Set();
      }
      duelRoundRef.duelWordTasks.add(duelWordTask);
    }
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
        text: `${resolvedNick} a trouvé le gobble du meilleur mot avec (${wordPts} points)`,
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
      // Égalisations ignorées: on n'annonce que le premier record.
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
      text: `${resolvedNick} a trouvé le gobble du plus long mot avec (${len} lettres)`,
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
      // Égalisations ignorées: on n'annonce que le premier record.
    }
  }

  const liveGobblarsNow =
    (!isSpeedRound && isMaxPossiblePts ? 1 : 0) + (isMaxPossibleLen ? 1 : 0);
  if (!isBotPlayer && playerInstallId && liveGobblarsNow > 0) {
    void addGobblars({
      installId: playerInstallId,
      amount: liveGobblarsNow,
      reason: "live_gobble",
      meta: {
        roomId: room.id,
        roundId: roundId || null,
        nick: resolvedNick,
        word: norm,
        points: Number(wordPts) || 0,
        length: Number(len) || 0,
      },
    })
      .then((result) => {
        if (!result || result.ok === false) return;
        emitToInstallId(room, playerInstallId, "gobblarsAwarded", {
          kind: "live_gobble",
          amount: liveGobblarsNow,
          balance: Number(result.balance) || 0,
          nick: resolvedNick,
          ts: Date.now(),
        });
      })
      .catch((err) => {
        console.warn(`[${room.id}] live gobble gobblars failed for ${resolvedNick}`, err);
      });
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

  return {
    ok: true,
    score: data.score,
    wordScore: wordPts,
    usedFakeTwins: !!scored?.usedFakeTwins,
  };
}

function updateSpecial3WordsState(room, { roundId, nick, wordSlots, specialPlacements }) {
  if (!room) return { ok: false, error: "invalid_room" };
  if (!room.currentRound || room.currentRound.id !== roundId) {
    return { ok: false, error: "round_invalid" };
  }
  if (room.currentRound.status !== "running") {
    return { ok: false, error: "round_not_started" };
  }
  if (room.currentRound?.special?.type !== SELF_SPECIAL_3_WORDS_TYPE) {
    return { ok: false, error: "invalid_special_round" };
  }

  const playerEntry = nick ? findPlayerByNick(room, nick) : null;
  const resolvedNick = playerEntry?.player?.nick || nick;
  if (!resolvedNick) {
    return { ok: false, error: "not_logged_in" };
  }

  const roundSubs = room.submissions.get(roundId);
  if (!roundSubs) {
    return { ok: false, error: "no_round_subs" };
  }

  let data = roundSubs.get(resolvedNick);
  if (!data) {
    data = { words: new Set(), score: 0, wordTimes: new Map(), wordMeta: new Map() };
    roundSubs.set(resolvedNick, data);
  }

  const normalizedSlots = normalizeSpecial3WordSlots(wordSlots);
  const { board: scoringBoard, placements } = applySpecial3Placements(
    room.currentRound.grid,
    specialPlacements
  );
  const existingTimes = data.wordTimes instanceof Map ? data.wordTimes : new Map();
  const nextTimes = new Map();
  const usedWords = new Set();
  const usedStartTiles = new Set();
  const validatedSlots = [];
  let score = 0;
  let warning = null;

  for (const slot of normalizedSlots) {
    const word = slot.word;
    if (!word) {
      validatedSlots.push({ ...slot, word: "", display: "", path: [], pts: null });
      continue;
    }
    if (usedWords.has(word)) {
      warning = warning || "duplicate_word";
      validatedSlots.push({ ...slot, word: "", display: "", path: [], pts: null });
      continue;
    }
    const startTile = getSpecial3WordStartTile(slot.path);
    if (startTile != null && usedStartTiles.has(startTile)) {
      warning = warning || "duplicate_start_tile";
      validatedSlots.push({ ...slot, word: "", display: "", path: [], pts: null });
      continue;
    }
    const scored =
      Array.isArray(slot.path) && slot.path.length > 0
        ? scoreWordOnGridWithPath(word, scoringBoard, slot.path, null)
        : null;
    if (!scored) {
      warning = warning || "invalid_word";
      validatedSlots.push({ ...slot, word: "", display: "", path: [], pts: null });
      continue;
    }
    usedWords.add(word);
    if (startTile != null) usedStartTiles.add(startTile);
    nextTimes.set(word, existingTimes.get(word) || Date.now());
    score += scored.pts || 0;
    validatedSlots.push({
      ...slot,
      word,
      display: String(slot.display || word).trim() || word.toUpperCase(),
      path: Array.isArray(scored.path) ? [...scored.path] : [],
      pts: scored.pts || 0,
    });
  }

  while (validatedSlots.length < SELF_SPECIAL_3_WORDS_WORD_TARGET) {
    validatedSlots.push({
      id: validatedSlots.length,
      word: "",
      display: "",
      path: [],
      pts: null,
    });
  }

  data.words = new Set(validatedSlots.map((slot) => slot.word).filter(Boolean));
  data.wordTimes = nextTimes;
  data.score = score;
  data.specialPlacements = placements;
  data.specialWordSlots = validatedSlots.map((slot) => ({
    id: slot.id,
    word: slot.word,
    display: slot.display,
    path: Array.isArray(slot.path) ? [...slot.path] : [],
    pts: Number.isFinite(slot.pts) ? slot.pts : null,
  }));

  const liveResults = [];
  for (const [entryNick, entryData] of roundSubs.entries()) {
    liveResults.push({
      nick: entryNick,
      words: Array.from(entryData?.words || []),
      specialPlacements:
        entryData?.specialPlacements && typeof entryData.specialPlacements === "object"
          ? entryData.specialPlacements
          : null,
    });
  }
  recomputeRoundGobblesFromResults(room, liveResults);

  broadcastProvisionalRanking(room);

  return {
    ok: true,
    score,
    words: Array.from(data.words),
    specialPlacements: placements,
    wordSlots: data.specialWordSlots,
    warning,
  };
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
  const specialType = round?.special?.type;

  let bestPts = -Infinity;
  let bestWord = null;
  const bestScoreNicks = new Set();
  let maxLen = 0;
  let longestWord = null;
  const longestWordNicks = new Set();

  for (const entry of results) {
    const words = Array.isArray(entry.words) ? entry.words : [];
    const scoringBoard =
      specialType === SELF_SPECIAL_3_WORDS_TYPE
        ? applySpecial3Placements(board, entry?.specialPlacements).board
        : board;
    for (const raw of words) {
      const scored = scoreWordOnGrid(raw, scoringBoard, scoreConfig);
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

function recomputeRoundGobblesFromResults(room, results) {
  if (!room?.currentRound || !Array.isArray(results)) return;
  const specialType = room.currentRound?.special?.type;
  const isTargetRound =
    specialType === "target_long" || specialType === "target_score";

  const gobbles = new Map();
  const gobbleFlags = new Map();
  if (isTargetRound) {
    room.currentRound.gobbles = gobbles;
    room.currentRound.gobbleFlags = gobbleFlags;
    return;
  }

  const board = room.currentRound.grid;
  if (!Array.isArray(board) || board.length === 0) {
    room.currentRound.gobbles = gobbles;
    room.currentRound.gobbleFlags = gobbleFlags;
    return;
  }

  const scoreConfig = getSpecialScoreConfig(room.currentRound);
  const maxLenPossible = Number(room.bestPossibleStats?.maxLen) || 0;
  const maxPtsPossible = Number(room.bestPossibleStats?.maxPts) || 0;
  const scoreGobbleEnabled = specialType !== "speed" && maxPtsPossible > 0;
  const lenGobbleEnabled = maxLenPossible > 0;

  for (const entry of results) {
    const nick = entry?.nick;
    if (!nick) continue;
    const words = Array.isArray(entry?.words) ? entry.words : [];
    if (!words.length) continue;
    const scoringBoard =
      specialType === SELF_SPECIAL_3_WORDS_TYPE
        ? applySpecial3Placements(board, entry?.specialPlacements).board
        : board;

    let hasScoreGobble = false;
    let hasLenGobble = false;
    for (const raw of words) {
      const scored = scoreWordOnGrid(raw, scoringBoard, scoreConfig);
      if (!scored) continue;
      const pts = computeWordScoreForRound(
        room.currentRound,
        scored.norm,
        scored.path,
        scored.pts
      );
      const len = scored.norm.length;
      if (scoreGobbleEnabled && pts === maxPtsPossible) {
        hasScoreGobble = true;
      }
      if (lenGobbleEnabled && len === maxLenPossible) {
        hasLenGobble = true;
      }
      if (
        (!scoreGobbleEnabled || hasScoreGobble) &&
        (!lenGobbleEnabled || hasLenGobble)
      ) {
        break;
      }
    }

    const count = (hasScoreGobble ? 1 : 0) + (hasLenGobble ? 1 : 0);
    if (count > 0) {
      gobbles.set(nick, count);
      gobbleFlags.set(nick, { score: hasScoreGobble, len: hasLenGobble });
    }
  }

  room.currentRound.gobbles = gobbles;
  room.currentRound.gobbleFlags = gobbleFlags;
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
    plan?.type === "bonus_letter" ||
    plan?.type === FAKE_TWINS_TYPE
  );
}

function shouldPrecomputePlan(plan) {
  return !!plan;
}

function getPreparedPlanCacheKey(plan) {
  if (!plan) return "";
  return JSON.stringify({
    type: plan.type || "",
    gridSize: plan.gridSize || 4,
    minWords: plan.minWords || 0,
    minTotalScore: plan.minTotalScore || 0,
    minLongWordLen: plan.minLongWordLen || 0,
    minLongWordCount: plan.minLongWordCount || 0,
    minWordLength: plan.minWordLength || 0,
    bonusLetter: plan.bonusLetter || "",
    bonusLetterScore: plan.bonusLetterScore || 0,
    fixedWordScore: plan.fixedWordScore || 0,
    disableBonuses: !!plan.disableBonuses,
  });
}

function hasPreparedOrPendingGrid(room, roundNumber) {
  if (!room || !Number.isFinite(roundNumber)) return false;
  return (
    room.nextPreparedGrid?.roundNumber === roundNumber ||
    (room.nextPreparedGridPromise &&
      room.nextPreparedGridPromiseRoundNumber === roundNumber)
  );
}

function matchesBufferedPreparedGrid(room, tournamentRound, plan, tournamentId = null) {
  const buffered = room?.bufferedPreparedGrid;
  if (!buffered || !plan) return false;
  const activeTournamentId = tournamentId || room?.tournament?.id || null;
  return (
    !!activeTournamentId &&
    buffered.tournamentId === activeTournamentId &&
    buffered.tournamentRound === tournamentRound &&
    buffered.planKey === getPreparedPlanCacheKey(plan) &&
    buffered.prepared?.grid?.length > 0
  );
}

function cancelBufferedPreparedGrid(room) {
  if (!room?.bufferedPreparedGridPromise) return;
  computePool.cancelBufferedPrepare();
  room.bufferedPreparedGridPromise = null;
  room.bufferedPreparedGridPromiseMeta = null;
}

function takeBufferedPreparedGrid(room, tournamentRound, plan, roundNumber, tournamentId = null) {
  if (!matchesBufferedPreparedGrid(room, tournamentRound, plan, tournamentId)) {
    return null;
  }
  const buffered = room.bufferedPreparedGrid;
  room.bufferedPreparedGrid = null;
  return {
    ...(buffered.prepared || {}),
    roundNumber,
    plan: buffered.prepared?.plan || plan,
  };
}

function findFutureBufferedSpecialTarget(room, afterTournamentRound) {
  const total = room?.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS;
  for (let round = Number(afterTournamentRound) + 1; round < total; round += 1) {
    const plan = getTournamentRoundPlan(room, round);
    if (!plan?.isSpecial) continue;
    if (!FUTURE_SPECIAL_BUFFER_TYPES.has(plan.type)) continue;
    return { tournamentRound: round, plan };
  }
  return null;
}

function ensureBufferedPreparedGrid(room, tournamentRound, plan) {
  if (!room || !plan?.isSpecial) return;
  const tournamentId = room?.tournament?.id || null;
  if (!tournamentId) return;
  if (matchesBufferedPreparedGrid(room, tournamentRound, plan, tournamentId)) return;
  const pendingMeta = room.bufferedPreparedGridPromiseMeta;
  const planKey = getPreparedPlanCacheKey(plan);
  if (
    room.bufferedPreparedGridPromise &&
    pendingMeta?.tournamentId === tournamentId &&
    pendingMeta?.tournamentRound === tournamentRound &&
    pendingMeta?.planKey === planKey
  ) {
    return;
  }

  cancelBufferedPreparedGrid(room);
  room.bufferedPreparedGridPromiseMeta = {
    tournamentId,
    tournamentRound,
    planKey,
  };
  const distanceFromCurrent = Math.max(
    1,
    tournamentRound - (room.tournament?.currentRound || 0)
  );
  const targetRoundNumber = (room.roundCounter || 0) + distanceFromCurrent;
  let promise = null;
  promise = computePool
    .prepareBufferedGrid({
      roomConfig: room.config,
      roundPlan: plan,
      roundNumber: targetRoundNumber,
    })
    .then((prepared) => {
      const meta = room.bufferedPreparedGridPromiseMeta;
      if (
        !prepared?.grid?.length ||
        !meta ||
        meta.tournamentId !== tournamentId ||
        meta.tournamentRound !== tournamentRound ||
        meta.planKey !== planKey
      ) {
        return null;
      }
      room.bufferedPreparedGrid = {
        tournamentId,
        tournamentRound,
        planKey,
        prepared: {
          ...prepared,
          plan: prepared.plan || plan,
        },
      };
      return room.bufferedPreparedGrid;
    })
    .catch((err) => {
      if (err?.message === "buffer_prepare_cancelled") {
        return null;
      }
      console.warn(
        `[${room.id}] Failed to prepare buffered future special grid:`,
        err?.message || err
      );
      return null;
    })
    .finally(() => {
      if (room.bufferedPreparedGridPromise === promise) {
        room.bufferedPreparedGridPromise = null;
        room.bufferedPreparedGridPromiseMeta = null;
      }
    });
  room.bufferedPreparedGridPromise = promise;
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
  const tasks = [];

  if (Array.isArray(grid) && grid.length > 0) {
    tasks.push(
      (async () => {
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
      })()
    );
  }

  if (
    shouldPrecomputePlan(nextPlan) &&
    !hasPreparedOrPendingGrid(room, nextRoundNumber) &&
    !matchesBufferedPreparedGrid(room, nextPlan?.roundNumber, nextPlan)
  ) {
    tasks.push(
      (async () => {
        try {
          await prepareNextGrid(room, nextPlan, nextRoundNumber);
        } catch (err) {
          console.warn(
            `[${room.id}] Failed to prepare next grid during break:`,
            err?.message || err
          );
        }
      })()
    );
  }

  if (tasks.length) {
    await Promise.all(tasks);
  }

  if (nextPlan?.type === "normal") {
    const futureTarget = findFutureBufferedSpecialTarget(room, nextPlan.roundNumber || 0);
    if (futureTarget) {
      ensureBufferedPreparedGrid(room, futureTarget.tournamentRound, futureTarget.plan);
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
  if (room?.nextPreparedGrid?.roundNumber === roundNumber) {
    return room.nextPreparedGrid;
  }
  if (
    room?.nextPreparedGridPromise &&
    room.nextPreparedGridPromiseRoundNumber === roundNumber
  ) {
    return room.nextPreparedGridPromise;
  }

  let pendingPromise = null;
  pendingPromise = (async () => {
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
    } finally {
      if (room?.nextPreparedGridPromise === pendingPromise) {
        room.nextPreparedGridPromise = null;
        room.nextPreparedGridPromiseRoundNumber = null;
      }
    }
  })();

  room.nextPreparedGridPromise = pendingPromise;
  room.nextPreparedGridPromiseRoundNumber = roundNumber;
  return pendingPromise;
}


function resetRoomRecords(room) {
  room.bestScoreRecord = { pts: 0, players: new Set() };
  room.bestLengthRecord = { len: 0, players: new Set() };
  room.longestPossibleRecord = { len: 0, players: new Set() };
  room.bestPossibleScoreRecord = { pts: 0, players: new Set() };
  room.bestPossibleStats = { maxLen: 0, maxPts: 0, totalPts: 0 };
  room.closeFightAnnounced = false;
  room.finalFightScheduled = null;
  room.endSoonTimeout = null;
}

async function startRoundForRoom(room) {
  if (!room) return;
  clearPendingRankingBroadcast(room);
  room.rankingLastSignature = null;
  room.breakState = null;
  cancelBufferedPreparedGrid(room);

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
  if (!prepared) {
    prepared = takeBufferedPreparedGrid(
      room,
      tournamentRound,
      tournamentPlan,
      roundNumber,
      room.tournament?.id || null
    );
    if (prepared?.plan) {
      planUsed = prepared.plan;
    }
  }
  if (!prepared) {
    // Startup path: ensure the very first round also goes through worker quality/solver.
    prepared = await prepareNextGrid(room, planUsed, roundNumber);
    if (prepared?.roundNumber === roundNumber && room.nextPreparedGrid?.roundNumber === roundNumber) {
      room.nextPreparedGrid = null;
    }
    if (prepared?.plan) {
      planUsed = prepared.plan;
    }
  }
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
      ? TARGET_SPECIAL_ROUND_DURATION_MS
      : planUsed?.type === "speed" || planUsed?.type === "monstrous"
      ? LIVE_SPECIAL_ROUND_DURATION_MS
      : room.config.durationMs;
  const roundIntroMs = Math.max(0, ROUND_INTRO_DURATION_MS);
  const roundStartsAt = now + roundIntroMs;
  const roundEndsAt = roundStartsAt + roundDurationMs;

  if (botManager?.refreshPresenceForRoom) {
    botManager.refreshPresenceForRoom(room);
  }

  room.currentRound = {
    id: roundId,
    grid,
    startsAt: roundStartsAt,
    endsAt: roundEndsAt,
    durationMs: roundDurationMs,
    introMs: roundIntroMs,
    status: roundIntroMs > 0 ? "intro" : "running",
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
    targetHintScheduleMs: [],
    targetSolvedBy: null,
    gobbles: new Map(),
    gobbleFlags: new Map(),
    duelWordTasks: new Set(),
    duelObjectivePointsByNick: new Map(),
  };

  const roundSubs = new Map();
  for (const p of room.players.values()) {
    if (!isPlayerConnected(p) && !isBotToken(p?.token)) continue;
    roundSubs.set(p.nick, { words: new Set(), score: 0, wordTimes: new Map(), wordMeta: new Map() });
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
          totalPts:
            quality.possibleScore ??
            quality.totalPts ??
            0,
        }
      : { maxLen: 0, maxPts: 0, totalPts: 0 };
    if (planUsed?.fixedWordScore) {
      bestPossibleStats.maxPts = planUsed.fixedWordScore;
    }
    if (planUsed?.type === "self_specials_3_words") {
      const special3MaxPts = Number(quality?.special3Words?.maxPts);
      if (Number.isFinite(special3MaxPts) && special3MaxPts > 0) {
        bestPossibleStats.maxPts = special3MaxPts;
      }
    }
    if (planUsed?.type === "bonus_letter" && planUsed?.bonusLetter && dictionary) {
      const scoreConfig = getSpecialScoreConfigFromPlan(planUsed);
      const computed = scoreConfig ? computeBestPossible(grid, scoreConfig) : null;
      if (computed && (computed.maxPts > 0 || computed.maxLen > 0)) {
        bestPossibleStats = computed;
      }
    }
    room.bestPossibleStats = bestPossibleStats;

  if (
    planUsed?.isSpecial &&
    (planUsed.type === "target_long" || planUsed.type === "target_score") &&
    typeof room.currentRound.targetWord === "string" &&
    room.currentRound.targetWord
  ) {
    room.currentRound.targetHintScheduleMs = getTargetHintScheduleMs({
      targetWord: room.currentRound.targetWord,
      targetLength: room.currentRound.targetLength,
      roundDurationMs,
      roundType: planUsed.type,
    });
  } else {
    room.currentRound.targetHintScheduleMs = [];
  }

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
  const roundStartedPayload = buildRoundStartedPayload(room);
  if (roundStartedPayload) {
    io.to(room.id).emit("roundStarted", roundStartedPayload);
  }

  broadcastProvisionalRanking(room, { force: true });

  if (roundIntroMs > 0) {
    const roundActivationId = roundId;
    room.currentRound.timers.push(
      setTimeout(() => {
        if (!room.currentRound || room.currentRound.id !== roundActivationId) return;
        if (room.currentRound.status === "running") return;
        room.currentRound.status = "running";
        broadcastProvisionalRanking(room, { force: true });
      }, roundIntroMs)
    );
  }

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
        : planUsed.type === SELF_SPECIAL_3_WORDS_TYPE
        ? `MANCHE SPECIALE : ${planUsed.label} - place les bonus et garde 3 mots avec des tuiles de départ différentes`
        : planUsed.type === FAKE_TWINS_TYPE
        ? `MANCHE SPECIALE : ${planUsed.label} - une case vaut 2 lettres, seuls les mots de 4 lettres ou plus sont valides`
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
    const hintScheduleMs =
      Array.isArray(room.currentRound.targetHintScheduleMs) &&
      room.currentRound.targetHintScheduleMs.length
        ? room.currentRound.targetHintScheduleMs
        : getTargetHintScheduleMs({
            targetWord: room.currentRound.targetWord,
            targetLength: room.currentRound.targetLength,
            roundDurationMs,
            roundType: planUsed.type,
          });
    room.currentRound.targetHintScheduleMs = hintScheduleMs;
    const firstHintMs = hintScheduleMs[0];
    pushAnnouncement(room, {
      type: "special_hint_soon",
      text: `Indice dans ${Math.max(1, Math.round((firstHintMs || 0) / 1000))} secondes...`,
    });

    const emitHint = () => {
      if (!room.currentRound || room.currentRound.id !== roundId) return;
      const word = room.currentRound.targetWord || "";
      const revealed = room.currentRound.targetRevealed || new Set();
      if (revealed.size === 0 && word) {
        const group = pickTargetRevealGroup(word, revealed);
        if (group) {
          group.forEach((idx) => revealed.add(idx));
          room.currentRound.targetRevealed = revealed;
        }
      }
      const expanded = expandTargetRevealed(word, revealed);
      if (expanded.size !== revealed.size) {
        room.currentRound.targetRevealed = expanded;
      }
      const chars = word.split("");
      const pattern = chars
        .map((ch, idx) => (expanded.has(idx) ? ch.toUpperCase() : "_"))
        .join(" ");
      const revealWordIndices = normalizeTargetRevealIndices(Array.from(expanded));
      const revealCells = resolveTargetHintCells(room, revealWordIndices);
      io.to(room.id).emit("specialHint", {
        roomId: room.id,
        roundId,
        kind: planUsed.type,
        length: chars.length,
        pattern,
        revealCells,
        revealWordIndices,
      });
    };

    if (hintScheduleMs.length > 0) {
      room.currentRound.timers.push(setTimeout(emitHint, roundIntroMs + hintScheduleMs[0]));
    }

    for (let i = 1; i < hintScheduleMs.length; i += 1) {
      const tMs = hintScheduleMs[i];
      room.currentRound.timers.push(
        setTimeout(() => {
          if (!room.currentRound || room.currentRound.id !== roundId) return;
          const word = room.currentRound.targetWord || "";
          const chars = word.split("");
          const revealed = room.currentRound.targetRevealed || new Set();
          if (revealed.size >= chars.length) return;

          const group = pickTargetRevealGroup(word, revealed);
          if (!group) return;
          group.forEach((idx) => revealed.add(idx));
          room.currentRound.targetRevealed = revealed;
          emitHint();
        }, roundIntroMs + tMs)
      );
    }
  }

  if (botManager?.onRoundStart) {
    const botKickoffRoundId = roundId;
    const kickoff = setTimeout(() => {
      if (!room.currentRound || room.currentRound.id !== botKickoffRoundId) return;
      if (room.currentRound.status !== "running") return;
      botManager.onRoundStart(room);
    }, roundIntroMs + 1500);
    room.currentRound.timers.push(kickoff);
  }

  room.endSoonTimeout = setTimeout(() => {
    pushAnnouncement(room, {
      type: "timer",
      text: "Il ne reste plus que 30 secondes !",
    });
  }, Math.max(0, roundIntroMs + roundDurationMs - 30 * 1000));

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
  }, Math.max(0, roundIntroMs + roundDurationMs - 20 * 1000));

  room.currentRound.timers.push(
    setTimeout(() => {
      endRoundForRoom(room).catch((err) =>
        console.warn("endRoundForRoom failed", err)
      );
    }, roundIntroMs + roundDurationMs + LIVE_ROUND_END_GRACE_MS)
  );
}

async function endRoundForRoom(room) {
  if (
    !room ||
    !room.currentRound ||
    (room.currentRound.status !== "running" && room.currentRound.status !== "intro")
  ) {
    return;
  }
  clearPendingRankingBroadcast(room);
  if (room.currentRound.timers) {
    room.currentRound.timers.forEach((t) => clearTimeout(t));
  }
  if (room.endSoonTimeout) clearTimeout(room.endSoonTimeout);
  if (room.finalFightScheduled) clearTimeout(room.finalFightScheduled);
  if (botManager?.onRoundEnd) {
    botManager.onRoundEnd(room);
  }

  room.currentRound.status = "finished";
  const pendingDuelWordTasks =
    room.currentRound.duelWordTasks instanceof Set
      ? Array.from(room.currentRound.duelWordTasks)
      : [];
  if (pendingDuelWordTasks.length > 0) {
    await Promise.allSettled(pendingDuelWordTasks);
  }

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
      roundSubs.set(player.nick, { words: new Set(), score: 0, wordTimes: new Map(), wordMeta: new Map() });
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
      wordMeta:
        data.wordMeta instanceof Map ? Object.fromEntries(data.wordMeta.entries()) : {},
      wordTimes,
      specialPlacements:
        data?.specialPlacements && typeof data.specialPlacements === "object"
          ? data.specialPlacements
          : null,
      specialWordSlots: Array.isArray(data?.specialWordSlots) ? data.specialWordSlots : null,
      uniqueWords,
      newVocabWords: [],
      installId: player?.installId || null,
      team: getTeamForInstallCached(player?.installId),
      isBot: isBotNick(room, nick),
      isDailyChampion: isDailyChampionInstallId(player?.installId),
      connected,
      participated,
    });
  }

  const endedAt = room.currentRound.endsAt || Date.now();
  const resultsByNick = new Map(results.map((entry) => [entry.nick, entry]));
  const vocabEntries = [];
  const vocabLookups = [];
  const vocabInstallIdsByNick = new Map();
  for (const entry of results) {
    if (entry.isBot) continue;
    const lookup = findPlayerByNick(room, entry.nick);
    const player = lookup?.player || null;
    const installId = getInstallIdForNick(room, entry.nick);
    if (!installId) continue;
    const words = Array.isArray(entry.uniqueWords) ? entry.uniqueWords : [];
    if (!words.length) continue;
    const vocabInstallIds =
      Number.isInteger(Number(player?.userId)) && Number(player.userId) > 0
        ? await listIdentityInstallIds({
            userId: Number(player.userId),
            currentInstallId: installId,
          })
        : [installId];
    vocabInstallIdsByNick.set(entry.nick, vocabInstallIds);
    vocabEntries.push({ installId, words, ts: endedAt, nick: entry.nick });
    vocabLookups.push({ installId, installIds: vocabInstallIds, words, nick: entry.nick });
  }
  if (vocabLookups.length) {
    for (const lookup of vocabLookups) {
      const knownWords = await getKnownVocabWordsForInstallIds(
        lookup.installIds?.length ? lookup.installIds : [lookup.installId],
        lookup.words
      );
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
      const vocabInstallIds = vocabInstallIdsByNick.get(entry.nick) || [entry.installId];
      const totalCount = await getVocabularyCountForInstallIds(vocabInstallIds);
      recordVocabCount(playerKey, entry.nick, totalCount, endedAt);
    }
  }

  results.sort((a, b) => b.score - a.score);
  recomputeRoundGobblesFromResults(room, results);

  const roundId = room.currentRound.id ? `${room.id}#${room.currentRound.id}` : `${room.id}#${Date.now()}`;
  const roundGobbles = room.currentRound.gobbles || new Map();
  const roundObjectivePointsByNick =
    room.currentRound.duelObjectivePointsByNick instanceof Map
      ? room.currentRound.duelObjectivePointsByNick
      : new Map();
  const targetFoundAt = room.currentRound.targetFoundAt || new Map();
  const targetScoreForWeekly = 1000;
  const isSpecial3Round = room.currentRound?.special?.type === SELF_SPECIAL_3_WORDS_TYPE;
  const teamDuelUpdates = new Map();
  const duelDateId = getParisDateId(new Date(endedAt));
  for (const entry of results) {
    if (entry.isBot) continue;
    if (!entry.participated) continue;
    const playerKey = getMedalKeyForNickLookup(room, entry.nick);
    if (!playerKey) continue;
    const wordsCount = Array.isArray(entry.words) ? entry.words.length : 0;
    recordMostWordsInGame(playerKey, entry.nick, wordsCount, roundId, endedAt);
    recordBestRoundScore(playerKey, entry.nick, entry.score, roundId, endedAt);
    if (isSpecial3Round) {
      recordBestSpecial3Score(playerKey, entry.nick, entry.score, roundId, endedAt);
    }
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
    const installIdForDuel = getInstallIdForNick(room, entry.nick);
    if (installIdForDuel) {
      const objectivePointsFromWords = Number(roundObjectivePointsByNick.get(entry.nick)) || 0;
      const duelRound = await recordMainRoundCompleted({
        installId: installIdForDuel,
        nick: entry.nick,
        dateId: duelDateId,
        isTargetRound,
        roundScore: entry.score || 0,
        gobblesEarned,
        targetFound: targetFoundAt.has(entry.nick),
        participated: !!entry.participated,
      });
      const objectivePointsFromRound =
        Number(duelRound?.objectivePointsAdded) ||
        getObjectiveTeamPointsFromUpdates(duelRound?.updates);
      const objectivePointsAdded = objectivePointsFromWords + objectivePointsFromRound;
      if (
        duelRound &&
        (
          objectivePointsAdded > 0 ||
          (Array.isArray(duelRound.updates) && duelRound.updates.length > 0) ||
          Number(duelRound?.gobblePointsAdded) > 0
        )
      ) {
        teamDuelUpdates.set(entry.nick, {
          objectiveUpdates: Array.isArray(duelRound?.updates) ? duelRound.updates : [],
          objectivePointsAdded,
          gobblePointsAdded: Number(duelRound?.gobblePointsAdded) || 0,
        });
      }
      void refreshInstallDuelCache(installIdForDuel);
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
      const prev = t.totals.get(entry.nick) || {
        points: 0,
        gobbles: 0,
        roundScoreSum: 0,
      };
      const roundScore = Math.max(0, Number(entry?.score) || 0);
      t.totals.set(entry.nick, {
        points: prev.points || 0,
        gobbles: prev.gobbles || 0,
        roundScoreSum: (prev.roundScoreSum || 0) + roundScore,
      });
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
        const prev = t.totals.get(nick) || { points: 0, gobbles: 0, roundScoreSum: 0 };
        t.totals.set(nick, {
          points: (prev.points || 0) + basePts,
          gobbles: prev.gobbles || 0,
          roundScoreSum: prev.roundScoreSum || 0,
        });
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

          const prev = t.totals.get(entry.nick) || { points: 0, gobbles: 0, roundScoreSum: 0 };
          t.totals.set(entry.nick, {
            points: (prev.points || 0) + basePts,
            gobbles: (prev.gobbles || 0) + gobbles,
            roundScoreSum: prev.roundScoreSum || 0,
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
        installId: player.installId || null,
        team: getTeamForInstallCached(player.installId),
        isBot: isBotToken(player?.token),
        isDailyChampion: isDailyChampionInstallId(player?.installId),
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
    const rankingCore = Array.from(t.totals.entries())
      .map(([nick, data]) => {
        const basePoints = data?.points || 0;
        const gobbles = data?.gobbles || 0;
        const roundScoreSum = data?.roundScoreSum || 0;
        const points = basePoints + gobbles;
        const installId = getInstallIdForNick(room, nick);
        return {
          nick,
          points,
          basePoints,
          gobbles,
          roundScoreSum,
          team: getTeamForInstallCached(installId),
          isBot: isBotNick(room, nick),
          isDailyChampion: isDailyChampionInstallId(installId),
        };
      })
      .sort((a, b) => {
        const diff = (b.points || 0) - (a.points || 0);
        if (diff !== 0) return diff;
        const gdiff = (b.gobbles || 0) - (a.gobbles || 0);
        if (gdiff !== 0) return gdiff;
        const scoreTieDiff = (b.roundScoreSum || 0) - (a.roundScoreSum || 0);
        if (scoreTieDiff !== 0) return scoreTieDiff;
        return (a.nick || "").localeCompare(b.nick || "");
      });
    const tieMetaByNick = new Map();
    const groupsByPrimary = new Map();
    rankingCore.forEach((entry) => {
      const key = `${Number(entry?.points) || 0}|${Number(entry?.gobbles) || 0}`;
      const group = groupsByPrimary.get(key) || [];
      group.push(entry);
      groupsByPrimary.set(key, group);
    });
    groupsByPrimary.forEach((group) => {
      if (!Array.isArray(group) || group.length <= 1) return;
      const uniqueRoundScores = new Set(
        group.map((entry) => Number(entry?.roundScoreSum) || 0)
      );
      const tieBreakBy = uniqueRoundScores.size > 1 ? "round_score_sum" : "alphabetical";
      group.forEach((entry) => {
        tieMetaByNick.set(entry.nick, {
          tieGroupSize: group.length,
          tieBreakBy,
        });
      });
    });
    totalRanking = rankingCore
      .map((entry, idx) => {
        const posNow = idx + 1;
        const prevPos = t.prevPositions.get(entry.nick);
        const delta = typeof prevPos === "number" ? prevPos - posNow : 0;
        const tieMeta = tieMetaByNick.get(entry.nick) || null;
        return {
          ...entry,
          pos: posNow,
          delta,
          tieGroupSize: tieMeta?.tieGroupSize || 0,
          tieBreakBy: tieMeta?.tieBreakBy || null,
          tieBreakRoundScore: Number(entry?.roundScoreSum) || 0,
        };
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
              {
                points: data?.points || 0,
                gobbles: data?.gobbles || 0,
                roundScoreSum: data?.roundScoreSum || 0,
              },
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
    teamDuel: Object.fromEntries(teamDuelUpdates.entries()),
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

  socket.on("session:resume", async (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const installId = identity.installId;
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
        userId: identity.userId,
        installId,
        connected: true,
        lastSeenAt: now,
      };
      room.players.set(socket.id, player);
      room.nickToInstallId.set(player.nick, player.installId || installId);
      void upsertVocabularyProfile(installId, player.nick, now);
      try {
        await refreshInstallDuelCache(installId);
      } catch (_) {}
      socket.data.installId = installId;
      socket.data.userId = identity.userId;
      socket.data.nick = player.nick;
      socket.data.roomId = room.id;
      socket.roomId = room.id;
      socket.join(room.id);
      emitPlayers(room);
      emitMedals(room);
      emitRoomsStats();
    }
    const snapshot = buildSessionSnapshot(room, player);
    cb?.({ ok: true, available: true, snapshot });
  });

  socket.on("login", async (payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const nick = typeof payload === "string" ? payload : payload?.nick;
    const token = typeof payload === "object" ? payload?.clientId : null;
    const installId = identity.installId;
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
    const isResumeLogin = !!resumeSocketId;

    room.players.set(socket.id, {
      nick: trimmed,
      token: token || null,
      userId: identity.userId,
      installId,
      connected: true,
      lastSeenAt: now,
    });
    room.nickToInstallId.set(trimmed, installId);
    void upsertVocabularyProfile(installId, trimmed, now);
    try {
      await refreshInstallDuelCache(installId);
    } catch (_) {}
    socket.data.installId = installId;
    socket.data.userId = identity.userId;
    socket.data.nick = trimmed;
    socket.data.roomId = room.id;
    socket.roomId = room.id;
    socket.join(room.id);
    if (!isBotToken(token) && !isResumeLogin) {
      const team = getTeamForInstallCached(installId);
      pushSystemChatMessage(
        room,
        `${trimmed} ${getTeamDot(team)} a rejoint le tournoi`,
        { installId, team, nick: trimmed, meta: { kind: "join_tournament" } }
      );
      markPresenceJoinAnnounced(room, installId);
    }
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

    if (room.currentRound && isRoundActive(room.currentRound)) {
      ensurePlayerInRound(room, trimmed);

      const roundStartedPayload = buildRoundStartedPayload(room);
      if (roundStartedPayload) {
        socket.emit("roundStarted", roundStartedPayload);
      }

      // Si on rejoint en cours de manche "cible", renvoyer l'etat courant de l'indice
      // (sinon le joueur ne verra le pattern qu'au hint suivant).
      const specialType = room.currentRound?.special?.type;
      const isTargetRound = specialType === "target_long" || specialType === "target_score";
      if (isTargetRound && typeof room.currentRound.targetWord === "string" && room.currentRound.targetWord) {
        const startedAt =
          (Number.isFinite(room.currentRound.startsAt) ? room.currentRound.startsAt : null) ||
          ((room.currentRound.endsAt || Date.now()) -
            (room.currentRound.durationMs || room.config.durationMs || 0));
        const elapsed = Date.now() - startedAt;
        const targetHintScheduleMs =
          Array.isArray(room.currentRound.targetHintScheduleMs) &&
          room.currentRound.targetHintScheduleMs.length
            ? room.currentRound.targetHintScheduleMs
            : getTargetHintScheduleMs({
                targetWord: room.currentRound.targetWord,
                targetLength: room.currentRound.targetLength,
                roundDurationMs:
                  room.currentRound.durationMs || room.config.durationMs || 90 * 1000,
                roundType: specialType,
              });
        const firstHintMs =
          targetHintScheduleMs.length > 0 ? targetHintScheduleMs[0] : Number.POSITIVE_INFINITY;
        if (elapsed >= firstHintMs) {
      const word = room.currentRound.targetWord || "";
      const revealed = room.currentRound.targetRevealed || new Set();
      const expanded = expandTargetRevealed(word, revealed);
      if (expanded.size !== revealed.size) {
        room.currentRound.targetRevealed = expanded;
      }
      const chars = word.split("");
      const pattern = chars
        .map((ch, idx) => (expanded.has(idx) ? ch.toUpperCase() : "_"))
        .join(" ");
      const revealWordIndices = normalizeTargetRevealIndices(Array.from(expanded));
      socket.emit("specialHint", {
        roomId: room.id,
        roundId: room.currentRound.id,
        kind: specialType,
        length: chars.length,
        pattern,
        revealCells: resolveTargetHintCells(room, revealWordIndices),
        revealWordIndices,
      });
    }
      }
      const builtRanking = buildRankingUpdatePayload(room);
      if (builtRanking?.payload) {
        socket.emit("rankingUpdate", builtRanking.payload);
      }
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
    let payload = text;
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const isPayloadObject = payload && typeof payload === "object";
    const roomIdFromPayload =
      isPayloadObject && typeof payload.roomId === "string"
        ? payload.roomId
        : null;
    const room = getRoom(
      roomIdFromPayload || socket.roomId || socket.data?.chatRoomId || "room-4x4"
    );
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const rawText = isPayloadObject ? payload.text : payload;
    if (typeof rawText !== "string") {
      cb?.({ ok: false });
      return;
    }
    const trimmed = rawText.trim();
    if (!trimmed) {
      cb?.({ ok: false });
      return;
    }
    const player = room.players.get(socket.id);
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const lobbyNick =
      isPayloadObject && typeof payload.nick === "string" ? payload.nick.trim() : "";
    const isLobbyPayload = !player && isPayloadObject && payload?.lobby === true;
    const authorNick = player?.nick || lobbyNick;
    if (!authorNick) {
      cb?.({ ok: false, error: "empty_nick" });
      return;
    }
    if (authorNick.length > NICK_MAX_LEN) {
      cb?.({ ok: false, error: "nick_too_long" });
      return;
    }
    const installId = identity.installId;
    if (!installId) {
      cb?.({ ok: false, error: "invalid_install_id" });
      return;
    }
    if (isInstallIdMuted(installId)) {
      cb?.({ ok: false, error: "muted" });
      return;
    }
    if (isLobbyPayload) {
      socket.data.chatInstallId = installId;
      socket.data.chatNick = authorNick;
      socket.data.chatRoomId = room.id;
      socket.join(room.id);
    } else if (!player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const replyTo = isPayloadObject ? resolveReplyPreviewFromPayload(room, payload.replyTo) : null;
    const message = {
      id: randomUUID(),
      t: Date.now(),
      roomId: room.id,
      nick: authorNick,
      userId: identity.userId,
      installId,
      text: trimmed,
      team: getTeamForInstallCached(installId),
      isDailyChampion: isDailyChampionInstallId(installId),
    };
    if (replyTo) {
      message.replyTo = replyTo;
    }
    pushChatMessage(room, message);
    cb?.({ ok: true });
  });

  socket.on("chat:react", (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    if (!payload || typeof payload !== "object") {
      cb?.({ ok: false, error: "invalid_payload" });
      return;
    }
    const roomIdFromPayload =
      typeof payload.roomId === "string" && payload.roomId.trim() ? payload.roomId.trim() : null;
    const room = getRoom(
      roomIdFromPayload || socket.roomId || socket.data?.chatRoomId || "room-4x4"
    );
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    const emoji = normalizeChatReactionEmoji(payload.emoji);
    if (!messageId || !emoji) {
      cb?.({ ok: false, error: "invalid_payload" });
      return;
    }

    const player = room.players.get(socket.id);
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const lobbyNick = typeof payload.nick === "string" ? payload.nick.trim() : "";
    const isLobbyPayload = !player && payload?.lobby === true;
    const authorNick = (player?.nick || lobbyNick || socket.data?.chatNick || "").trim();
    if (!authorNick) {
      cb?.({ ok: false, error: "empty_nick" });
      return;
    }
    if (authorNick.length > NICK_MAX_LEN) {
      cb?.({ ok: false, error: "nick_too_long" });
      return;
    }
    const installId = identity.installId;
    if (!installId) {
      cb?.({ ok: false, error: "invalid_install_id" });
      return;
    }
    if (isInstallIdMuted(installId)) {
      cb?.({ ok: false, error: "muted" });
      return;
    }
    if (isLobbyPayload) {
      socket.data.chatInstallId = installId;
      socket.data.chatNick = authorNick;
      socket.data.chatRoomId = room.id;
      socket.join(room.id);
    } else if (!player && !socket.data?.chatInstallId) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }

    const result = updateChatMessageReactions(room, {
      messageId,
      emoji,
      installId,
      nick: authorNick,
    });
    if (!result.ok) {
      cb?.({ ok: false, error: result.error || "reaction_failed" });
      return;
    }

    io.to(room.id).emit("chat:message_reaction", {
      roomId: room.id,
      messageId,
      reactions: result.reactions,
      updatedAt: result.message?.reactionsUpdatedAt || Date.now(),
    });
    cb?.({ ok: true, reactions: result.reactions });
  });

  socket.on("chat:edit", (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    if (!payload || typeof payload !== "object") {
      cb?.({ ok: false, error: "invalid_payload" });
      return;
    }
    const roomIdFromPayload =
      typeof payload.roomId === "string" && payload.roomId.trim() ? payload.roomId.trim() : null;
    const room = getRoom(
      roomIdFromPayload || socket.roomId || socket.data?.chatRoomId || "room-4x4"
    );
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const player = room.players.get(socket.id);
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const isLobbyPayload = !player && payload?.lobby === true;
    const installId = identity.installId;
    if (!installId) {
      cb?.({ ok: false, error: "invalid_install_id" });
      return;
    }
    if (isLobbyPayload) {
      socket.data.chatInstallId = installId;
      socket.data.chatRoomId = room.id;
      socket.join(room.id);
    } else if (!player && !socket.data?.chatInstallId) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const result = updateChatMessageText(room, {
      messageId: payload.messageId,
      installId,
      text: payload.text,
    });
    if (!result.ok) {
      cb?.({ ok: false, error: result.error || "edit_failed" });
      return;
    }
    io.to(room.id).emit("chat:message_update", {
      roomId: room.id,
      message: result.message,
    });
    cb?.({ ok: true, message: result.message });
  });

  socket.on("chat:delete", (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    if (!payload || typeof payload !== "object") {
      cb?.({ ok: false, error: "invalid_payload" });
      return;
    }
    const roomIdFromPayload =
      typeof payload.roomId === "string" && payload.roomId.trim() ? payload.roomId.trim() : null;
    const room = getRoom(
      roomIdFromPayload || socket.roomId || socket.data?.chatRoomId || "room-4x4"
    );
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const player = room.players.get(socket.id);
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const isLobbyPayload = !player && payload?.lobby === true;
    const installId = identity.installId;
    if (!installId) {
      cb?.({ ok: false, error: "invalid_install_id" });
      return;
    }
    if (isLobbyPayload) {
      socket.data.chatInstallId = installId;
      socket.data.chatRoomId = room.id;
      socket.join(room.id);
    } else if (!player && !socket.data?.chatInstallId) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const result = deleteChatMessage(room, {
      messageId: payload.messageId,
      installId,
    });
    if (!result.ok) {
      cb?.({ ok: false, error: result.error || "delete_failed" });
      return;
    }
    io.to(room.id).emit("chat:message_delete", {
      roomId: room.id,
      messageId: result.messageId,
      deletedAt: result.deletedAt,
    });
    cb?.({ ok: true, messageId: result.messageId });
  });

  socket.on("chat:subscribe", (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    socket.data.chatRoomId = room.id;
    socket.join(room.id);
    socket.emit("chat:history", Array.isArray(room.chatMessages) ? room.chatMessages : []);
    cb?.({ ok: true, roomId: room.id });
  });

  socket.on("reportMessage", (payload, cb) => {
    const room = getRoom(socket.roomId);
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const reporterInstallId = identity.installId;
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
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const installId = identity.installId;
    if (!installId) {
      cb?.({ count: 0 });
      return;
    }
    try {
      await ensureUserIdentityMigration(identity.user);
      const installIds = await listIdentityInstallIds({
        userId: identity.userId,
        currentInstallId: installId,
        primaryInstallId: identity.user?.primaryInstallId,
      });
      const count = await getVocabularyCountForInstallIds(
        installIds.length ? installIds : [installId]
      );
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
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const installId = identity.installId;
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

  socket.on("daily:start", async (payload, cb) => {
    try {
      const identity = requireSocketPlayerIdentity(socket, cb);
      if (!identity) return;
      const installId = identity.installId;
      const pseudo = sanitizeDailyNick(payload?.pseudo || socket.data?.nick || "");
      const dailyMode = sanitizeDailyMode(payload?.dailyMode);
      if (!installId || !pseudo) {
        cb?.({ ok: false, error: "bad_request" });
        return;
      }
      const result = await runDailyStartFlow({ installId, pseudo, dailyMode });
      if (!result || typeof result !== "object") {
        cb?.({ ok: false, error: "internal" });
        return;
      }
      cb?.(result);
    } catch (err) {
      console.warn("daily:start socket failed", err);
      cb?.({ ok: false, error: "internal" });
    }
  });

  socket.on("daily:submit", async (payload, cb) => {
    try {
      const identity = requireSocketPlayerIdentity(socket, cb);
      if (!identity) return;
      const installId = identity.installId;
      const pseudo = sanitizeDailyNick(payload?.pseudo || socket.data?.nick || "");
      const dailyMode = sanitizeDailyMode(payload?.dailyMode);
      if (!installId || !pseudo) {
        cb?.({ ok: false, error: "bad_request" });
        return;
      }
      const result = await runDailySubmitFlow({
        dateId: typeof payload?.dateId === "string" ? payload.dateId : null,
        installId,
        pseudo,
        foundWords: payload?.foundWords,
        wordSubmissions: payload?.wordSubmissions,
        specialPlacements: payload?.specialPlacements,
        dailyMode,
        durationMs: payload?.durationMs,
      });
      if (!result || typeof result !== "object") {
        cb?.({ ok: false, error: "internal" });
        return;
      }
      cb?.(result);
    } catch (err) {
      console.warn("daily:submit socket failed", err);
      cb?.({ ok: false, error: "internal" });
    }
  });

  socket.on("special3Words:update", (payload, cb) => {
    const room = getRoom(socket.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const result = updateSpecial3WordsState(room, {
      roundId: payload?.roundId,
      nick: player?.nick,
      wordSlots: payload?.wordSlots,
      specialPlacements: payload?.specialPlacements,
    });
    cb?.(result);
  });

  socket.on("submitWord", ({ roundId, word, path, traceStartedAt = null }, cb) => {
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
      traceStartedAt,
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
        traceStartedAt: item?.traceStartedAt,
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
    const timer = setTimeout(() => {
      clearPendingDisconnect(room, socket.id);
      const current = room.players.get(socket.id);
      if (current) {
        room.players.delete(socket.id);
        if (!isBotToken(current?.token)) {
          const currentInstallId = normalizeInstallId(current?.installId || "");
          if (wasPresenceJoinAnnounced(room, currentInstallId)) {
            const team = getTeamForInstallCached(currentInstallId);
            pushSystemChatMessage(
              room,
              `${current?.nick || "Joueur"} ${getTeamDot(team)} a quitté le tournoi`,
              {
                installId: currentInstallId,
                team,
                nick: current?.nick || "",
                meta: { kind: "leave_tournament" },
              }
            );
            clearPresenceAnnouncement(room, currentInstallId);
          }
        }
        console.log("Client déconnecté", socket.id, current?.nick, "from", room.id);
        emitPlayers(room);
        emitMedals(room);
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
  submitSpecial3WordsState: updateSpecial3WordsState,
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
void refreshConnectedPlayersDuelCache();

setTimeout(() => {
  const tomorrow = addDaysToDateId(getParisDateId(), 1);
  void ensureDaily(tomorrow);
}, 90 * 1000).unref?.();

const DAILY_MAINTENANCE_MS = 5 * 60 * 1000;
const dailyMaintenanceTimer = setInterval(() => {
  const today = getParisDateId();
  const tomorrow = addDaysToDateId(today, 1);
  void ensureDaily(today);
  void ensureDaily(tomorrow);
  void refreshConnectedPlayersDuelCache();
}, DAILY_MAINTENANCE_MS);
dailyMaintenanceTimer.unref?.();
