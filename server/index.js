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
  FAKE_TWINS_COMPLETION_BONUS,
  FAKE_TWINS_MIN_WORD_LENGTH,
  FAKE_TWINS_TYPE,
  OCID_TYPE,
  buildPathWordVariants,
  generateGrid,
  getFakeTwinsCompletionTarget,
  MOVABLE_BONUS_KEYS,
  scoreWordOnGrid,
  scoreWordOnGridWithPath,
  solveGrid,
  findBestPathForWord,
  normalizeWord,
} from "../shared/gameLogic.js";
import {
  FINALE_DESCRIPTION,
  FINALE_MIN_TOTAL_SCORE,
  FINALE_TILE_BONUS_MULTIPLIER,
  FINALE_TYPE,
  getFinaleMinWords,
} from "../shared/finaleRules.js";
import { shouldPersistRoundProgress } from "./trainingProgressPolicy.js";
import { createBotManager, BOT_ROSTER_4X4 } from "./bots/botManager.js";
import { createComputePool } from "./compute/computePool.js";
import { computeSpecial3GobbleAwards } from "./compute/special3GobblePolicy.js";
import { createPersistenceClient } from "./persistence/persistenceClient.js";
import { getMetrics, resetMetrics } from "./observability/metrics.js";
import {
  getDefinition,
  clearDefinitionCache,
  peekDefinitionCache,
} from "./definitions/definitionService.js";
import {
  getOfflineDoubleDefinitionDetails,
  getOfflineInventorFactDetails,
  getOfflineWordFactDetails,
} from "./definitions/wordFactService.js";
import {
  buildWordInsightSummary,
  buildWordInsightChatLines,
  pickWordThemeChallenge,
} from "./definitions/wordInsightService.js";
import { createAsyncFileLogger } from "./logging/asyncFileLogger.js";
import {
  emitChatSocketEvent,
  joinSocketToChatRoom,
} from "./chat/chatSocketRooms.js";
import {
  getWeekStartTs,
  getPreviousWeeklyVocabChampion,
  getPreviousWeeklyVocabPodium,
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
  recordWeeklyVocabCount,
} from "./stats/weeklyStatsService.js";
import {
  initVocabularyService,
  recordVocabularyBatch,
  getVocabularyCount,
  getVocabularyCountForInstallIds,
  getVocabularyLeaderboard,
  getWeeklyVocabularyCountForInstallIds,
  getWeeklyVocabularyLeaderboard,
  migrateVocabularyProfile,
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
  getGobblarProfileReadOnly,
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
  initPlayerProfileService,
  getPublicPlayerProfileByUserId,
} from "./stats/playerProfileService.js";
import { getTargetWaitDevCatalog } from "./targetMiniGame/targetWaitCatalogService.js";
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
  normalizeUsername,
  setUserIdentityMigrationSignature,
} from "./auth/authService.js";
import {
  addPlaytimeUsage,
  buildPlaytimeBlockedResponse,
  clearPlaytimeLimit,
  getPlaytimeLimitStatus,
  initPlaytimeLimitService,
  listActivePlaytimeLimits,
  setPlaytimeLimit,
} from "./playtime/playtimeLimitService.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection", reason);
});

const computePool = createComputePool();
const persistenceClient = createPersistenceClient();
void initVocabularyService().catch((err) =>
  console.warn("Vocabulary service init failed", err)
);
void initTrophyService().catch((err) =>
  console.warn("Trophy service init failed", err)
);
void initGobblarsService({ applyGlobalGrant: false }).catch((err) =>
  console.warn("Gobblars service init failed", err)
);
void initPlayerProfileService().catch((err) =>
  console.warn("Player profile service init failed", err)
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

const HTTP_SLOW_REQUEST_MS = 3000;
let activeHttpRequestSeq = 0;
const activeHttpRequests = new Map();

function getActiveHttpRequestsSnapshot(limit = 12) {
  const now = Date.now();
  return Array.from(activeHttpRequests.values())
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      method: entry.method,
      url: entry.url,
      ageMs: now - entry.startedAt,
    }));
}

app.use((req, res, next) => {
  const id = ++activeHttpRequestSeq;
  const startedAt = Date.now();
  const entry = {
    id,
    method: req.method,
    url: String(req.originalUrl || req.url || "").slice(0, 300),
    startedAt,
  };
  activeHttpRequests.set(id, entry);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    activeHttpRequests.delete(id);
    const durationMs = Date.now() - startedAt;
    if (durationMs > HTTP_SLOW_REQUEST_MS) {
      console.warn(
        `[http] slow ${entry.method} ${entry.url} ${durationMs}ms status=${res.statusCode}`
      );
    }
  };
  res.on("finish", cleanup);
  res.on("close", cleanup);
  next();
});

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

const PLAYER_PROFILE_CACHE_TTL_MS = 15000;
const PLAYER_PROFILE_CACHE_MAX = 200;
const playerProfileResponseCache = new Map();

function getCachedPlayerProfile(cacheKey) {
  const entry = playerProfileResponseCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > PLAYER_PROFILE_CACHE_TTL_MS) {
    playerProfileResponseCache.delete(cacheKey);
    return null;
  }
  return entry.profile || null;
}

function setCachedPlayerProfile(cacheKey, profile) {
  if (!cacheKey || !profile) return;
  playerProfileResponseCache.set(cacheKey, { profile, createdAt: Date.now() });
  if (playerProfileResponseCache.size > PLAYER_PROFILE_CACHE_MAX) {
    const oldestKey = playerProfileResponseCache.keys().next().value;
    if (oldestKey) playerProfileResponseCache.delete(oldestKey);
  }
}

app.get("/api/player-profile/user/:userId", async (req, res) => {
  try {
    pruneHeavyEndpointRateBuckets();
    const userId = Number(req.params?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_player" });
    }
    const auth = await getAuthFromCookieHeader(req?.headers?.cookie);
    const viewerUserId = Number(auth?.user?.id);
    const safeViewerUserId = Number.isInteger(viewerUserId) && viewerUserId > 0 ? viewerUserId : null;
    const rateKey = safeViewerUserId
      ? `player-profile:user:${safeViewerUserId}`
      : `player-profile:ip:${getClientIpFromRequest(req) || "unknown"}`;
    const rateCheck = checkHeavyEndpointRateLimit(rateKey, { limit: 40, windowMs: 60_000 });
    if (!rateCheck.ok) return sendRateLimitResponse(res, rateCheck);
    const fallbackNick = String(req.query?.nick || "");
    const cacheKey = `${userId}|${safeViewerUserId || 0}|${fallbackNick.slice(0, 48)}`;
    const cachedProfile = getCachedPlayerProfile(cacheKey);
    if (cachedProfile) {
      return res.json({ ok: true, profile: cachedProfile });
    }
    const profile = await getPublicPlayerProfileByUserId(userId, {
      fallbackNick,
      viewerUserId: safeViewerUserId,
    });
    if (!profile) {
      return res.status(404).json({ ok: false, error: "profile_not_found" });
    }
    setCachedPlayerProfile(cacheKey, profile);
    return res.json({ ok: true, profile });
  } catch (err) {
    console.warn("Player profile route failed", err);
    return res.status(500).json({ ok: false, error: "profile_unavailable" });
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

const SOLVE_CACHE_MAX = 2;
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
  const classicBoggleScoring = special?.classicBoggleScoring ? 1 : 0;
  const tileBonusMultiplier =
    Number.isFinite(special?.tileBonusMultiplier) && special.tileBonusMultiplier > 0
      ? special.tileBonusMultiplier
      : "";
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
    classicBoggleScoring,
    tileBonusMultiplier,
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

function sanitizePreparedSolutions(rawSolutions) {
  if (!Array.isArray(rawSolutions)) return [];
  return rawSolutions
    .map((entry) => {
      const word = normalizeWord(String(entry?.word || ""));
      if (!word) return null;
      return {
        word,
        pts: Number.isFinite(entry?.pts) ? entry.pts : 0,
        path: Array.isArray(entry?.path) ? entry.path : [],
        usedFakeTwins: !!entry?.usedFakeTwins,
        rareBonusWord: !!entry?.rareBonusWord,
        rareBonusPoints: Number.isFinite(entry?.rareBonusPoints) ? entry.rareBonusPoints : 0,
        rarityBucket: typeof entry?.rarityBucket === "string" ? entry.rarityBucket : "",
        rarityScore: Number.isFinite(entry?.rarityScore) ? entry.rarityScore : 0,
        fakeTwinsCompletionWord: !!entry?.fakeTwinsCompletionWord,
        fakeTwinsBonusOnly: !!entry?.fakeTwinsBonusOnly,
        fakeTwinsTwinIndex: Number.isInteger(entry?.fakeTwinsTwinIndex)
          ? entry.fakeTwinsTwinIndex
          : null,
        fakeTwinsResolvedLetter: entry?.fakeTwinsResolvedLetter ?? null,
        fakeTwinsUsesAlt: !!entry?.fakeTwinsUsesAlt,
      };
    })
    .filter(Boolean);
}

function findPreparedSolutionMeta(round, word) {
  const norm = normalizeWord(word);
  if (!norm || !Array.isArray(round?.solutions)) return null;
  return round.solutions.find((entry) => normalizeWord(entry?.word || "") === norm) || null;
}

function buildFakeTwinsSubmittedWordMeta(round, word, scored) {
  const prepared = findPreparedSolutionMeta(round, word);
  const usedFakeTwins = !!(scored?.usedFakeTwins || prepared?.usedFakeTwins);
  const hasPreparedCompletionFlag =
    prepared && Object.prototype.hasOwnProperty.call(prepared, "fakeTwinsCompletionWord");
  const fakeTwinsCompletionWord =
    usedFakeTwins && (hasPreparedCompletionFlag ? !!prepared.fakeTwinsCompletionWord : true);
  return {
    usedFakeTwins,
    fakeTwinsCompletionWord,
    fakeTwinsBonusOnly: usedFakeTwins && !fakeTwinsCompletionWord,
  };
}

function shouldApplyRareWordBonus(round) {
  const type = String(round?.special?.type || "");
  return (
    type !== "target_long" &&
    type !== "target_score" &&
    type !== OCID_TYPE &&
    type !== SELF_SPECIAL_3_WORDS_TYPE &&
    type !== "speed" &&
    type !== MASSIVE_BOGGLE_TYPE
  );
}

function buildRareBonusSubmittedWordMeta(round, word) {
  if (!shouldApplyRareWordBonus(round)) {
    return { rareBonusWord: false, rareBonusPoints: 0, rarityBucket: "", rarityScore: 0 };
  }
  const prepared = findPreparedSolutionMeta(round, word);
  if (!prepared?.rareBonusWord) {
    return { rareBonusWord: false, rareBonusPoints: 0, rarityBucket: "", rarityScore: 0 };
  }
  const points = Number.isFinite(prepared.rareBonusPoints)
    ? Math.max(0, Math.trunc(prepared.rareBonusPoints))
    : RARE_WORD_BONUS_POINTS;
  return {
    rareBonusWord: true,
    rareBonusPoints: points || RARE_WORD_BONUS_POINTS,
    rarityBucket: String(prepared.rarityBucket || ""),
    rarityScore: Number(prepared.rarityScore) || 0,
  };
}

function getEffectiveMaxPossibleScoreForRound(round, fallback = 0) {
  const baseFallback = Number.isFinite(fallback) ? Math.max(0, Number(fallback)) : 0;
  if (!round) return baseFallback;
  const specialType = String(round?.special?.type || "");
  if (
    specialType === "speed" ||
    specialType === "target_long" ||
    specialType === "target_score" ||
    specialType === MASSIVE_BOGGLE_TYPE
  ) {
    return baseFallback;
  }
  const cached = Number(round.effectiveMaxPossibleScore);
  if (Number.isFinite(cached) && cached > 0) return cached;
  const preparedSolutions = Array.isArray(round.preparedSolutions)
    ? round.preparedSolutions
    : Array.isArray(round.solutions)
    ? round.solutions
    : [];
  if (!preparedSolutions.length) return baseFallback;
  const scoreConfig = getSpecialScoreConfig(round);
  let maxPts = baseFallback;
  for (const entry of preparedSolutions) {
    const word = normalizeWord(entry?.word || "");
    if (!word) continue;
    const path = Array.isArray(entry?.path) ? entry.path : [];
    const rescored = path.length
      ? scoreWordOnGridWithPath(word, round.grid, path, scoreConfig)
      : null;
    const finalPath = Array.isArray(rescored?.path) ? rescored.path : path;
    const basePts = Number.isFinite(rescored?.pts)
      ? rescored.pts
      : Number.isFinite(entry?.pts)
      ? entry.pts
      : 0;
    const rareMeta = buildRareBonusSubmittedWordMeta(round, word);
    const totalPts =
      computeWordScoreForRound(round, word, finalPath, basePts) +
      (Number(rareMeta.rareBonusPoints) || 0);
    if (Number.isFinite(totalPts) && totalPts > maxPts) {
      maxPts = totalPts;
    }
  }
  round.effectiveMaxPossibleScore = maxPts;
  return maxPts;
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
    const getUserIdFromPlayerKey = (rawPlayerKey) => {
      const playerKey = typeof rawPlayerKey === "string" ? rawPlayerKey.trim() : "";
      if (!playerKey.startsWith("install:")) return null;
      const userId = Number(playerKey.slice("install:".length));
      return Number.isInteger(userId) && userId > 0 ? userId : null;
    };
    const withUserIds = (entries) =>
      Array.isArray(entries)
        ? entries.map((entry) => {
            if (!entry || typeof entry !== "object") return entry;
            const userId =
              Number.isInteger(Number(entry.userId)) && Number(entry.userId) > 0
                ? Number(entry.userId)
                : getUserIdFromPlayerKey(entry.playerKey);
            return userId ? { ...entry, userId } : entry;
          })
        : [];
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
    const weeklyVocabularyFallback = await getWeeklyVocabularyLeaderboard(
      payload?.weekStartTs || Date.now(),
      payload?.topN || topN || 50
    );
    for (const entry of weeklyVocabularyFallback) {
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
    const weeklyVocabByKey = new Map();
    const weeklyVocabFromStats = Array.isArray(boards?.weeklyVocab) ? boards.weeklyVocab : [];
    for (const entry of weeklyVocabFromStats) {
      const nickLower = normalizeWeeklyNick(entry?.nick);
      const rawKey = canonicalizeVocabPlayerKey(entry?.playerKey, entry?.installId);
      const key =
        nickLower && (!rawKey || rawKey.startsWith("nick:")) && installKeyByNick.has(nickLower)
          ? installKeyByNick.get(nickLower)
          : rawKey || buildWeeklyNickKey(entry?.nick);
      if (!key) continue;
      const current = weeklyVocabByKey.get(key);
      const currentCount = Number(current?.weeklyVocabCount ?? current?.vocabCount) || 0;
      const entryCount = Number(entry?.weeklyVocabCount ?? entry?.vocabCount) || 0;
      if (!current || entryCount > currentCount) {
        weeklyVocabByKey.set(key, { ...entry, playerKey: key, weeklyVocabCount: entryCount });
      }
    }
    for (const entry of weeklyVocabularyFallback) {
      if (!entry?.installId) continue;
      const key = canonicalizeVocabPlayerKey("", entry.installId);
      const resolvedNick =
        (typeof entry?.nick === "string" && entry.nick.trim()) || nickByPlayerKey.get(key) || "";
      const displayNick = resolvedNick || `Joueur-${String(entry.installId).slice(0, 6)}`;
      const next = {
        nick: displayNick,
        playerKey: key,
        weeklyVocabCount: Number(entry.count) || 0,
        achievedAt: Number(entry.updatedAt) || 0,
      };
      const current = weeklyVocabByKey.get(key);
      const currentCount = Number(current?.weeklyVocabCount ?? current?.vocabCount) || 0;
      if (!current || next.weeklyVocabCount > currentCount) {
        weeklyVocabByKey.set(key, next);
      }
    }
    const mergedWeeklyVocab = Array.from(weeklyVocabByKey.values()).sort((a, b) => {
      const diff =
        (Number(b?.weeklyVocabCount ?? b?.vocabCount) || 0) -
        (Number(a?.weeklyVocabCount ?? a?.vocabCount) || 0);
      if (diff !== 0) return diff;
      return (Number(a?.achievedAt) || 0) - (Number(b?.achievedAt) || 0);
    });
    const filterBots = (entries) =>
      Array.isArray(entries)
        ? entries.filter((entry) => !BOT_NICK_SET.has(entry?.nick))
        : [];
    const filteredBoards = {
      ...boards,
      medals: withUserIds(filterBots(boards.medals)),
      mostWordsInGame: withUserIds(filterBots(boards.mostWordsInGame)),
      totalScore: withUserIds(filterBots(boards.totalScore)),
      bestWord: withUserIds(filterBots(boards.bestWord)),
      longestWord: withUserIds(filterBots(boards.longestWord)),
      bestSpecial3Score: withUserIds(filterBots(boards.bestSpecial3Score)),
      bestRoundScore: withUserIds(filterBots(boards.bestRoundScore)),
      bestTimeTargetLong: withUserIds(filterBots(boards.bestTimeTargetLong)),
      bestTimeTargetScore: withUserIds(filterBots(boards.bestTimeTargetScore)),
      vocab: withUserIds(filterBots(mergedVocab).slice(0, payload?.topN || topN || 50)),
      weeklyVocab: withUserIds(
        filterBots(mergedWeeklyVocab).slice(0, payload?.topN || topN || 50)
      ),
      mostGobbles: withUserIds(filterBots(boards.mostGobbles)),
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
  if (isMaintenanceModeActive()) {
    return buildMaintenanceBlockedPayload();
  }
  const result = await startDailyAttempt(null, installId, pseudo, { dailyMode, dictionary });
  if (!result?.ok) return result;
  await refreshInstallDuelCache(installId).catch(() => null);
  clearDuelStatusResponseCache(installId);
  const duel = await getCachedDuelStatus(installId, { dateId: result?.dateId || null, force: true });
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
    await persistenceClient.addGobblars({
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
  await refreshInstallDuelCache(installId).catch(() => null);
  clearDuelStatusResponseCache(installId);
  clearThemeProfileResponseCache(installId);
  const duel = await getCachedDuelStatus(installId, { dateId: result?.dateId || null, force: true });
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
      scheduleInstallDuelCacheRefresh(installId, 60_000);
      duel = await getCachedDuelStatus(installId, { dateId: payload?.dateId || null });
    } catch (_) {}
  }
  res.json({
    ...payload,
    champion: null,
    duel,
    maintenanceMode: isMaintenanceModeActive(),
    maintenanceMessage: isMaintenanceModeActive() ? "Maintenance en cours" : "",
  });
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
  const includeWords =
    req.query?.includeWords === "1" ||
    req.query?.includeWords === "true" ||
    req.query?.includeWords === true;
  const payload = await getDailyHistory({ days, installId, dictionary, includeWords });
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
    } else if (result.error === "maintenance_mode") {
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
    pruneHeavyEndpointRateBuckets();
    const rateCheck = checkHeavyEndpointRateLimit(`theme-profile:${installId}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!rateCheck.ok) return sendRateLimitResponse(res, rateCheck);
    scheduleInstallDuelCacheRefresh(installId, 60_000);
    const payload = await getCachedThemeProfilePayload(installId);
    if (!payload) {
      res.status(500);
      return res.json({ ok: false, error: "profile_unavailable" });
    }
    return res.json(payload);
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
    const result = await persistenceClient.applyThemeSelection({
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
    clearThemeProfileResponseCache(installId);
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
  pruneHeavyEndpointRateBuckets();
  const rateCheck = checkHeavyEndpointRateLimit(`duel-status:${installId}`, {
    limit: 14,
    windowMs: 30_000,
  });
  if (!rateCheck.ok) return sendRateLimitResponse(res, rateCheck);
  scheduleInstallDuelCacheRefresh(installId, 60_000);
  const dateId = typeof req.query?.dateId === "string" ? req.query.dateId : null;
  const payload = await getCachedDuelStatus(installId, { dateId });
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
  if (payload?.ok) clearDuelStatusResponseCache(installId);
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
  if (payload?.ok) clearDuelStatusResponseCache(installId);
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
  const result = await listWordVaultEntriesForUser(identity.userId);
  if (!result?.ok) {
    res.status(result?.error === "auth_required" ? 401 : 500);
    return res.json({
      ok: false,
      error: result?.error || "vault_list_failed",
    });
  }
  const items = Array.isArray(result.items) ? result.items : [];
  return res.json({
    ok: true,
    items,
    count: Array.isArray(items) ? items.length : 0,
  });
});

app.post("/api/vault/words", async (req, res) => {
  const diagnosticRef = `CF-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const startedAt = Date.now();
  res.set("Content-Type", "application/json; charset=utf-8");
  res.set("Cache-Control", "no-store");
  res.set("X-Gobble-Vault-Ref", diagnosticRef);
  let userId = null;
  try {
    const identity = await requireRequestPlayerIdentity(req, res);
    if (!identity) {
      console.warn(`[vault:add] ref=${diagnosticRef} outcome=auth_required`);
      return;
    }
    userId = identity.userId;
    const rawWord = typeof req.body?.word === "string" ? req.body.word : "";
    console.log(
      `[vault:add] ref=${diagnosticRef} user=${userId} stage=received wordLength=${rawWord.length}`
    );
    const result = await addWordVaultEntryForUser(userId, rawWord);
    if (!result?.ok) {
      const errorCode = String(result?.error || "");
      const temporarilyUnavailable = new Set([
        "vault_busy",
        "vault_unavailable",
        "vault_cannot_open",
        "vault_io_error",
      ]);
      res.status(
        errorCode === "word_required" || errorCode === "word_invalid"
          ? 400
          : errorCode === "vault_storage_full"
          ? 507
          : temporarilyUnavailable.has(errorCode)
          ? 503
          : 500
      );
    }
    console.log(
      `[vault:add] ref=${diagnosticRef} user=${userId} outcome=${result?.ok ? "ok" : "failed"} error=${result?.error || "none"} alreadyExists=${!!result?.alreadyExists} durationMs=${Date.now() - startedAt}`
    );
    return res.json({ ...result, diagnosticRef });
  } catch (err) {
    console.error(
      `[vault:add] ref=${diagnosticRef} user=${userId || "unknown"} outcome=exception durationMs=${Date.now() - startedAt}`,
      err
    );
    if (res.headersSent) return;
    res.status(500);
    return res.json({ ok: false, error: "vault_request_failed", diagnosticRef });
  }
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
  for (const player of roomPlayers) {
    const installId = normalizeInstallId(player?.installId);
    if (!installId || isBotToken(player?.token)) continue;
    scheduleInstallDuelCacheRefresh(installId);
  }
  const now = Date.now();
  const players = roomPlayers
    .filter((p) => isPlayerConnected(p) || isBotToken(p?.token))
    .map((p) => ({
      nick: p?.nick || "",
      userId: Number.isInteger(Number(p?.userId)) ? Number(p.userId) : null,
      installId: p?.installId || null,
      team: getTeamForInstallCached(p?.installId),
      isBot: isBotToken(p?.token),
      connected: isPlayerConnected(p) || isBotToken(p?.token),
      afk: isPlayerAfk(p, now),
      readyForTournament: ensureTournamentLobby(room).readyKeys.has(getPlayerReadyKey(p)),
      isDailyChampion: isDailyChampionPlayer(p),
      weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForPlayer(p),
      isWeeklyVocabChampion: isWeeklyVocabChampionPlayer(p),
    }))
    .filter((p) => p.nick)
    .sort((a, b) => a.nick.localeCompare(b.nick));
  const currentRound = room.currentRound || null;
  const breakState = room.breakState || null;
  const status = {
    serverNow: now,
    roundNumber: currentRound?.roundNumber ?? null,
    roundType: currentRound?.special?.type || (currentRound ? "normal" : null),
    roundLabel: currentRound?.special?.label || "",
    isTrainingRound: !!currentRound?.training,
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
    nextTournamentEtaMs: getNextMiniTournamentEtaMs(room, now),
    tournamentLobby: buildTournamentLobbyPayload(room),
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
    activeHttpRequests: {
      count: activeHttpRequests.size,
      oldest: getActiveHttpRequestsSnapshot(8),
    },
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
    console.warn(
      `[health] high event loop delay p99=${p99.toFixed(1)}ms activeHttp=${activeHttpRequests.size}`,
      getActiveHttpRequestsSnapshot(5)
    );
  }
  resetMetrics();
}, 5000);
lagMonitor.unref?.();

const DEFAULT_ROUND_DURATION_MS = 2 * 60 * 1000; // 2 minutes
const DEFAULT_BREAK_DURATION_MS = 45 * 1000; // 60s - 15s hors manches cibles
const TARGET_BREAK_DURATION_MS = 30 * 1000; // manches cibles déjà plus courtes
const ROUND_INTRO_DURATION_MS = 7800; // Intro visuelle avant manche jouable (titre + tuiles + 3..0)
const MAX_CHAT_HISTORY = 200;
const MAX_SYSTEM_CHAT_HISTORY = 100;
const NICK_MAX_LEN = 25;
const CHAT_REPLY_TEXT_MAX_LEN = 280;
const CHAT_MESSAGE_TEXT_MAX_LEN = 300;
const TARGET_CHAT_SPOILER_MIN_RUN = 4;
const CHAT_REACTION_MAX_USERS_PER_EMOJI = 200;
const AMBIENT_CHAT_BOTS_ENABLED =
  !/^(0|false|off|no)$/i.test(String(process.env.GOBBLE_AMBIENT_CHAT_BOTS_ENABLED || "1"));
const AMBIENT_CHAT_BOT_ENABLED_KEYS = new Set(
  String(process.env.GOBBLE_AMBIENT_CHAT_BOT_KEYS || "coach,linguist,trend")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
);
const AMBIENT_CHAT_BOT_GLOBAL_COOLDOWN_MS = 18 * 1000;
const AMBIENT_CHAT_BOT_PER_BOT_COOLDOWN_MS = 45 * 1000;
const AMBIENT_CHAT_BOT_MAX_PER_ROUND = 5;
const DETECTIVE_MAX_LENGTH_MIN_LEN = Math.max(
  7,
  Math.trunc(Number(process.env.GOBBLE_DETECTIVE_MAX_LENGTH_MIN_LEN) || 9)
);
const DETECTIVE_MAX_LENGTH_CHANCE = Math.min(
  1,
  Math.max(0, Number(process.env.GOBBLE_DETECTIVE_MAX_LENGTH_CHANCE) || 0.35)
);
const AMBIENT_TREND_BOT_ENABLED =
  !/^(0|false|off|no)$/i.test(String(process.env.GOBBLE_TREND_BOT_ENABLED || "1"));
const AMBIENT_TREND_BOT_TIMEOUT_MS = 1400;
const AMBIENT_TREND_BOT_CHANCE = Math.min(
  1,
  Math.max(0, Number(process.env.GOBBLE_TREND_BOT_CHANCE) || 0.18)
);
const CULTURE_THEME_BONUS_POINTS = 500;
const CULTURE_THEME_RECENT_LIMIT = Math.max(
  0,
  Math.trunc(Number(process.env.GOBBLE_CULTURE_THEME_RECENT_LIMIT) || 2)
);
const WIKIMAMA_LIGHT_INSIGHT_CHANCE = Math.min(
  1,
  Math.max(0, Number(process.env.GOBBLE_WIKIMAMA_LIGHT_INSIGHT_CHANCE) || 0.35)
);
const WIKIMAMA_LIGHT_INSIGHT_MIN_WORDS = Math.max(
  8,
  Math.trunc(Number(process.env.GOBBLE_WIKIMAMA_LIGHT_INSIGHT_MIN_WORDS) || 18)
);
const AMBIENT_ROUND_END_WORD_CURIOSITY_CHANCE = Math.min(
  1,
  Math.max(0, Number(process.env.GOBBLE_ROUND_END_WORD_CURIOSITY_CHANCE) || 0.06)
);
const GROSROBERT_TOURNAMENT_CHANCE = Math.min(
  1,
  Math.max(0, Number(process.env.GOBBLE_GROSROBERT_TOURNAMENT_CHANCE) || 0.45)
);
const GROSROBERT_FORCE_FINAL_ROUND =
  !/^(0|false|off|no)$/i.test(String(process.env.GOBBLE_GROSROBERT_FORCE_FINAL_ROUND || "1"));
const CULTURE_THEME_BONUS_ENABLED =
  /^(1|true|on|yes)$/i.test(String(process.env.GOBBLE_CULTURE_THEME_BONUS_ENABLED || "0"));
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
const LIVE_ROUND_END_GRACE_MS = 3000;
const MIN_BIG_WORD = 50;
const MIN_LONG_WORD = 6;
const DEFAULT_MIN_WORDS = 150;
const SPECIAL_ROUND_EVERY = 5;
const LIVE_SPECIAL_ROUND_DURATION_MS = 120 * 1000;
const TARGET_SPECIAL_ROUND_DURATION_MS = 90 * 1000;
const OCID_PROPOSAL_DURATION_MS = 40 * 1000;
const OCID_VOTE_DURATION_MS = 20 * 1000;
const OCID_PROPOSAL_END_GRACE_MS = LIVE_ROUND_END_GRACE_MS;
const OCID_EXACT_TARGET_POINTS = 1000;
const OCID_CORRECT_VOTE_POINTS = 600;
const OCID_VALID_PROPOSAL_POINTS = 100;
const OCID_BLUFF_VOTE_POINTS = 500;
const OCID_RECENT_TARGET_LIMIT = 30;
const RARE_WORD_BONUS_POINTS = 10;
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
const TOURNAMENT_MASSIVE_BOGGLE_ROUND = 3;
const TOURNAMENT_RESULTS_BREAK_MS = 40 * 1000;
const TOURNAMENT_FINAL_BREAK_MS = 35 * 1000;
const TOURNAMENT_END_TOTAL_BREAK_MS = TOURNAMENT_RESULTS_BREAK_MS + TOURNAMENT_FINAL_BREAK_MS;
const INTER_TOURNAMENT_COUNTDOWN_MS = 5 * 1000;
const MINI_TOURNAMENT_INTRO_MS = 5 * 1000;
const PLAYER_AFK_AFTER_MS = 2 * 60 * 1000;
const TRAINING_BREAK_MS = 15 * 1000;
const TRAINING_FORCED_BOTS = ["Proutosaurus Rex", "Crux", "QuasarMots"];
const MEDALS_TTL_AFTER_DISCONNECT_MS = 5 * 60 * 1000;
const TOURNAMENT_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const MEDAL_GOBBLARS = Object.freeze({
  gold: 10,
  silver: 5,
  bronze: 3,
});
const DISCONNECT_GRACE_MS = 120 * 1000;
const RANKING_BROADCAST_MIN_MS = 180;
const DUEL_WORD_ACCEPTED_DEBOUNCE_MS = 350;
const DUEL_WORD_END_ROUND_WAIT_MS = 1200;
const PERF_COUNTER_WINDOW_MS = 5000;
const PERF_RANKING_BUILD_WARN_MS = 25;
const PERF_SUBMIT_WORD_WARN_MS = 80;
const PERF_SUBMIT_BATCH_WARN_MS = 140;
const PERF_END_ROUND_WARN_MS = 500;
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

const CLASSIC_BOGGLE_MIN_WORDS = 200;
const CLASSIC_BOGGLE_MIN_LONG_WORD_LEN = 8;
const CLASSIC_BOGGLE_MIN_LONG_WORD_COUNT = 3;
const BONUS_LETTER_SCORE = 20;
const BONUS_LETTER_MIN_WORDS = 30;
const MASSIVE_BOGGLE_TYPE = "massive_boggle";
const FUTURE_SPECIAL_BUFFER_TYPES = new Set([
  "monstrous",
  "fake_twins",
  OCID_TYPE,
  "target_long",
  "target_score",
  "bonus_letter",
  MASSIVE_BOGGLE_TYPE,
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
const MODERATION_LOG_PATH = path.join(LOG_DIR, "moderation.jsonl");
const REPORT_WINDOW_MS = 10 * 60 * 1000;
const REPORT_MUTE_THRESHOLD = 3;
const REPORT_REASON_MAX_LEN = 160;
const MUTE_DURATION_MS = 10 * 60 * 1000;
const MODERATION_BAN_5_MIN_MS = 5 * 60 * 1000;
const TARGET_CHAT_RATE_LIMIT_WINDOW_MS = 5000;
const TARGET_CHAT_RATE_LIMIT_MAX = 3;
const INSTALL_ID_MAX_LEN = 128;
const AUTH_SESSION_COOKIE_NAME = "gobble_session";
const RUNTIME_DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : path.join(__dirname, "../data");
const INSTALL_ALIASES_PATH = path.join(RUNTIME_DATA_DIR, "install-aliases.json");
const DEV_CONTROLS_PATH = path.join(RUNTIME_DATA_DIR, "dev-controls.json");
const DEV_ACCESS_PATH = path.join(RUNTIME_DATA_DIR, "dev-access.json");
const DEV_GLOBAL_ANNOUNCEMENT_MAX_LEN = 1200;
initPlaytimeLimitService({ dataDir: RUNTIME_DATA_DIR });
const reportEntries = [];
const reportsByInstallId = new Map();
const mutedInstallIds = new Map();
const targetChatRateBuckets = new Map();
const reportLogger = createAsyncFileLogger({ filePath: REPORTS_LOG_PATH });
const clientCrashLogger = createAsyncFileLogger({ filePath: CLIENT_CRASHES_LOG_PATH });
const connectionLogger = createAsyncFileLogger({ filePath: CONNECTIONS_LOG_PATH });
const moderationLogger = createAsyncFileLogger({ filePath: MODERATION_LOG_PATH });
const duelInstallCache = new Map(); // installId -> { weekId, team, crowned, updatedAt }
const duelCacheRefreshAt = new Map(); // installId -> ts
const duelWinnerGrantJobs = new Map(); // `${weekId}:${installId}` -> Promise | "done"
const DUEL_STATUS_RESPONSE_CACHE_TTL_MS = 6000;
const THEME_PROFILE_RESPONSE_CACHE_TTL_MS = 6000;
const SHORT_RESPONSE_CACHE_MAX = 300;
const duelStatusResponseCache = new Map();
const duelStatusInFlight = new Map();
const themeProfileResponseCache = new Map();
const themeProfileInFlight = new Map();
const heavyEndpointRateBuckets = new Map();
const installAliasByInstallId = new Map();
let duelWeekCacheKey = getDuelParisWeekId();

const DEV_FORCED_ROUND_TYPES = new Set([
  "",
  "normal",
  FINALE_TYPE,
  "self_specials_3_words",
  "speed",
  "monstrous",
  "target_long",
  "target_score",
  "bonus_letter",
  MASSIVE_BOGGLE_TYPE,
  "fake_twins",
  OCID_TYPE,
]);
const DEFAULT_DEV_CONTROLS = Object.freeze({
  enabled: false,
  forcedRoundType: "",
  forcedRoundTypes: [],
  forcedRoundRandom: false,
  botMedals: false,
  botsEnabled: true,
  animatorBotsEnabled: true,
  trainingEnabled: true,
  maintenanceMode: false,
  chatFill: false,
  botChat: false,
  botReactions: false,
  selfCrown: false,
  selfGoldNick: false,
  selfSilverNick: false,
  selfBronzeNick: false,
  selfCrownTargetUserId: "",
  selfCrownTargetInstallId: "",
  selfCrownTargetNick: "",
  selfGoldNickTargetUserId: "",
  selfGoldNickTargetInstallId: "",
  selfGoldNickTargetNick: "",
  selfSilverNickTargetUserId: "",
  selfSilverNickTargetInstallId: "",
  selfSilverNickTargetNick: "",
  selfBronzeNickTargetUserId: "",
  selfBronzeNickTargetInstallId: "",
  selfBronzeNickTargetNick: "",
});
let devControls = loadDevControls();
const moderationInstallBans = new Map();
const moderationUserBans = new Map();
const DEV_ACCESS_CACHE_TTL_MS = 2000;
let devAccessCache = { readAt: 0, config: {} };
let devAccessWarnedAt = 0;

function parseDevAccountNameAllowlist(raw) {
  const entries = Array.isArray(raw) ? raw : String(raw || "").split(",");
  return new Set(
    entries
      .map((entry) => normalizeUsername(entry))
      .filter(Boolean)
  );
}

function parseDevAccountIdAllowlist(raw) {
  const entries = Array.isArray(raw) ? raw : String(raw || "").split(",");
  return new Set(
    entries
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
  );
}

function mergeAllowlists(parser, ...values) {
  const merged = new Set();
  values.forEach((value) => {
    parser(value).forEach((entry) => merged.add(entry));
  });
  return merged;
}

function readDevAccessConfigFile() {
  const now = Date.now();
  if (now - devAccessCache.readAt < DEV_ACCESS_CACHE_TTL_MS) {
    return devAccessCache.config;
  }
  let config = {};
  try {
    const parsed = JSON.parse(readFileSync(DEV_ACCESS_PATH, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      config = parsed;
    }
  } catch (err) {
    if (err?.code !== "ENOENT" && now - devAccessWarnedAt > 30000) {
      devAccessWarnedAt = now;
      console.warn("[dev] Impossible de lire dev-access.json", err?.message || err);
    }
  }
  devAccessCache = { readAt: now, config };
  return config;
}

function getDevAccessConfig() {
  const fileConfig = readDevAccessConfigFile();
  const devAccountNames = mergeAllowlists(
    parseDevAccountNameAllowlist,
    process.env.GOBBLE_DEV_ACCOUNTS,
    process.env.GOBBLE_DEV_USERS,
    fileConfig.devAccounts,
    fileConfig.devUsers,
    fileConfig.devAccountNames,
    process.env.NODE_ENV === "production" ? "" : "Tigre,Test"
  );
  const devAccountIds = mergeAllowlists(
    parseDevAccountIdAllowlist,
    process.env.GOBBLE_DEV_USER_IDS,
    fileConfig.devUserIds,
    fileConfig.devAccountIds
  );
  const explicitModerationNames = mergeAllowlists(
    parseDevAccountNameAllowlist,
    process.env.GOBBLE_MOD_ACCOUNTS,
    process.env.GOBBLE_MOD_USERS,
    fileConfig.moderationAccounts,
    fileConfig.modAccounts,
    fileConfig.moderationUsers,
    fileConfig.modUsers
  );
  const explicitModerationIds = mergeAllowlists(
    parseDevAccountIdAllowlist,
    process.env.GOBBLE_MOD_USER_IDS,
    fileConfig.moderationUserIds,
    fileConfig.modUserIds,
    fileConfig.moderationAccountIds,
    fileConfig.modAccountIds
  );
  const moderationAccountNames = explicitModerationNames.size
    ? explicitModerationNames
    : new Set(devAccountNames);
  const moderationAccountIds = explicitModerationIds.size
    ? explicitModerationIds
    : new Set(devAccountIds);
  const password = String(
    process.env.GOBBLE_DEV_PASSWORD ||
      process.env.GOBBLE_DEV_PASS ||
      fileConfig.devPassword ||
      fileConfig.password ||
      (process.env.NODE_ENV === "production" ? "" : "prout84")
  ).trim();
  return {
    devAccountNames,
    devAccountIds,
    moderationAccountNames,
    moderationAccountIds,
    password,
  };
}

function getSocketDevAccount(socket) {
  const accessConfig = getDevAccessConfig();
  const user = socket?.data?.authUser || null;
  if (!user) {
    return { allowed: false, label: "", reason: "auth_required" };
  }
  const userId = Number.isInteger(Number(user.id)) ? String(Number(user.id)) : "";
  const usernameNormalized = normalizeUsername(user.usernameDisplay || user.usernameNormalized || "");
  const allowed =
    (userId && accessConfig.devAccountIds.has(userId)) ||
    (usernameNormalized && accessConfig.devAccountNames.has(usernameNormalized));
  return {
    allowed,
    label: user.usernameDisplay || user.usernameNormalized || (userId ? `#${userId}` : ""),
    reason: allowed ? "" : "account_not_allowed",
  };
}

function getSocketModerationAccount(socket) {
  const accessConfig = getDevAccessConfig();
  const user = socket?.data?.authUser || null;
  if (!user) {
    return { allowed: false, label: "", reason: "auth_required" };
  }
  const userId = Number.isInteger(Number(user.id)) ? String(Number(user.id)) : "";
  const usernameNormalized = normalizeUsername(user.usernameDisplay || user.usernameNormalized || "");
  const allowed =
    (userId && accessConfig.moderationAccountIds.has(userId)) ||
    (usernameNormalized && accessConfig.moderationAccountNames.has(usernameNormalized));
  return {
    allowed,
    label: user.usernameDisplay || user.usernameNormalized || (userId ? `#${userId}` : ""),
    userId,
    reason: allowed ? "" : "account_not_allowed",
  };
}

function buildModerationPayload(socket = null) {
  const accessConfig = getDevAccessConfig();
  const account = socket ? getSocketModerationAccount(socket) : { allowed: true, label: "" };
  return {
    available: !!account.allowed,
    accountAllowed: !!account.allowed,
    accountLabel: account.label || "",
    allowedAccountsConfigured:
      accessConfig.moderationAccountNames.size > 0 || accessConfig.moderationAccountIds.size > 0,
  };
}

function requireModerationAccess(socket, cb) {
  const account = getSocketModerationAccount(socket);
  if (account.allowed) return account;
  cb?.({ ok: false, error: account.reason || "moderation_forbidden", ...buildModerationPayload(socket) });
  return null;
}

function pruneModerationBans(now = Date.now()) {
  for (const [key, ban] of Array.from(moderationInstallBans.entries())) {
    if (!ban?.expiresAt || ban.expiresAt <= now) moderationInstallBans.delete(key);
  }
  for (const [key, ban] of Array.from(moderationUserBans.entries())) {
    if (!ban?.expiresAt || ban.expiresAt <= now) moderationUserBans.delete(key);
  }
}

function getActiveModerationBan(identity, now = Date.now()) {
  pruneModerationBans(now);
  const installId = normalizeInstallId(identity?.installId || "");
  const userId = Number.isInteger(Number(identity?.userId)) ? String(Number(identity.userId)) : "";
  const installBan = installId ? moderationInstallBans.get(installId) : null;
  const userBan = userId ? moderationUserBans.get(userId) : null;
  const ban =
    installBan && userBan
      ? installBan.expiresAt >= userBan.expiresAt
        ? installBan
        : userBan
      : installBan || userBan || null;
  if (!ban?.expiresAt || ban.expiresAt <= now) return null;
  return ban;
}

function buildModerationBanResponse(ban) {
  const until = Number(ban?.expiresAt) || Date.now();
  const seconds = Math.max(1, Math.ceil((until - Date.now()) / 1000));
  return {
    ok: false,
    error: "moderation_banned",
    until,
    remainingMs: Math.max(0, until - Date.now()),
    message: `Accès au live suspendu temporairement (${seconds}s restantes).`,
  };
}

function normalizeDevControls(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const rawForcedRoundTypes = Array.isArray(source.forcedRoundTypes)
    ? source.forcedRoundTypes
    : [source.forcedRoundType];
  const forcedRoundTypes = Array.from(
    new Set(
      rawForcedRoundTypes
        .map((entry) => String(entry || ""))
        .filter((entry) => entry && DEV_FORCED_ROUND_TYPES.has(entry))
    )
  );
  const forcedRoundType = forcedRoundTypes[0] || "";
  return {
    enabled: !!source.enabled,
    forcedRoundType,
    forcedRoundTypes,
    forcedRoundRandom: !!source.forcedRoundRandom,
    botMedals: !!source.botMedals,
    botsEnabled: source.botsEnabled !== false,
    animatorBotsEnabled: source.animatorBotsEnabled !== false,
    trainingEnabled: source.trainingEnabled !== false,
    maintenanceMode: !!source.maintenanceMode,
    chatFill: !!source.chatFill,
    botChat: !!source.botChat,
    botReactions: !!source.botReactions,
    selfCrown: !!source.selfCrown,
    selfGoldNick: !!source.selfGoldNick,
    selfSilverNick: !!source.selfSilverNick,
    selfBronzeNick: !!source.selfBronzeNick,
    selfCrownTargetUserId: String(source.selfCrownTargetUserId || "").trim(),
    selfCrownTargetInstallId: normalizeInstallIdRaw(source.selfCrownTargetInstallId || ""),
    selfCrownTargetNick: String(source.selfCrownTargetNick || "").trim(),
    selfGoldNickTargetUserId: String(source.selfGoldNickTargetUserId || "").trim(),
    selfGoldNickTargetInstallId: normalizeInstallIdRaw(source.selfGoldNickTargetInstallId || ""),
    selfGoldNickTargetNick: String(source.selfGoldNickTargetNick || "").trim(),
    selfSilverNickTargetUserId: String(source.selfSilverNickTargetUserId || "").trim(),
    selfSilverNickTargetInstallId: normalizeInstallIdRaw(source.selfSilverNickTargetInstallId || ""),
    selfSilverNickTargetNick: String(source.selfSilverNickTargetNick || "").trim(),
    selfBronzeNickTargetUserId: String(source.selfBronzeNickTargetUserId || "").trim(),
    selfBronzeNickTargetInstallId: normalizeInstallIdRaw(source.selfBronzeNickTargetInstallId || ""),
    selfBronzeNickTargetNick: String(source.selfBronzeNickTargetNick || "").trim(),
  };
}

function loadDevControls() {
  try {
    const raw = readFileSync(DEV_CONTROLS_PATH, "utf8");
    return normalizeDevControls(JSON.parse(raw));
  } catch (_) {
    return { ...DEFAULT_DEV_CONTROLS };
  }
}

function persistDevControls() {
  try {
    mkdirSync(RUNTIME_DATA_DIR, { recursive: true });
    writeFileSync(
      DEV_CONTROLS_PATH,
      JSON.stringify({ version: 1, updatedAt: Date.now(), controls: devControls }, null, 2),
      "utf8"
    );
  } catch (err) {
    console.warn("[dev] Impossible de sauvegarder les controles dev", err?.message || err);
  }
}

function isDevControlsActive(flag = null) {
  if (!devControls?.enabled) return false;
  if (!flag) return true;
  return !!devControls[flag];
}

function isMaintenanceModeActive() {
  return !!devControls?.maintenanceMode;
}

function buildMaintenanceBlockedPayload() {
  return {
    ok: false,
    error: "maintenance_mode",
    maintenanceMode: true,
    message: "Maintenance en cours.",
  };
}

function getDevSelfRewardTargetFromSocket(socket) {
  const player =
    socket?.roomId && rooms.get(socket.roomId)?.players?.get(socket.id)
      ? rooms.get(socket.roomId).players.get(socket.id)
      : null;
  const userIdCandidate =
    socket?.data?.userId ??
    socket?.data?.authUser?.id ??
    player?.userId ??
    null;
  const userId = Number.isInteger(Number(userIdCandidate)) ? String(Number(userIdCandidate)) : "";
  const installId =
    normalizeInstallId(socket?.data?.installId || player?.installId || "") ||
    normalizeInstallIdRaw(socket?.data?.installId || player?.installId || "");
  const nick = String(socket?.data?.nick || player?.nick || "").trim();
  return { userId, installId, nick };
}

function clearDevSelfRewardTarget(controls, prefix) {
  controls[`${prefix}TargetUserId`] = "";
  controls[`${prefix}TargetInstallId`] = "";
  controls[`${prefix}TargetNick`] = "";
}

function bindDevSelfRewardTarget(controls, prefix, socket) {
  const target = getDevSelfRewardTargetFromSocket(socket);
  controls[`${prefix}TargetUserId`] = target.userId || "";
  controls[`${prefix}TargetInstallId`] = target.installId || "";
  controls[`${prefix}TargetNick`] = target.nick || "";
}

function ensureDevSelfRewardTarget(controls, prefix, socket) {
  if (!controls?.[prefix]) return false;
  const hasTarget =
    !!controls[`${prefix}TargetUserId`] ||
    !!controls[`${prefix}TargetInstallId`] ||
    !!controls[`${prefix}TargetNick`];
  if (hasTarget) return false;
  bindDevSelfRewardTarget(controls, prefix, socket);
  return (
    !!controls[`${prefix}TargetUserId`] ||
    !!controls[`${prefix}TargetInstallId`] ||
    !!controls[`${prefix}TargetNick`]
  );
}

function applyDevSelfRewardTargetPatch(previousControls, nextControls, payload, socket) {
  const patch = payload && typeof payload === "object" ? payload : {};
  for (const prefix of ["selfCrown", "selfGoldNick", "selfSilverNick", "selfBronzeNick"]) {
    if (!Object.prototype.hasOwnProperty.call(patch, prefix)) {
      continue;
    }
    if (nextControls[prefix]) {
      bindDevSelfRewardTarget(nextControls, prefix, socket);
    } else {
      clearDevSelfRewardTarget(nextControls, prefix);
    }
  }
  if (nextControls.selfCrown && !previousControls.selfCrown) {
    ensureDevSelfRewardTarget(nextControls, "selfCrown", socket);
  }
  if (nextControls.selfGoldNick && !previousControls.selfGoldNick) {
    ensureDevSelfRewardTarget(nextControls, "selfGoldNick", socket);
  }
  if (nextControls.selfSilverNick && !previousControls.selfSilverNick) {
    ensureDevSelfRewardTarget(nextControls, "selfSilverNick", socket);
  }
  if (nextControls.selfBronzeNick && !previousControls.selfBronzeNick) {
    ensureDevSelfRewardTarget(nextControls, "selfBronzeNick", socket);
  }
}

function isDevSelfRewardTarget(prefix, subject = {}) {
  if (!isDevControlsActive(prefix)) return false;
  const targetUserId = String(devControls?.[`${prefix}TargetUserId`] || "").trim();
  const targetInstallId = normalizeInstallId(devControls?.[`${prefix}TargetInstallId`] || "");
  const targetNick = String(devControls?.[`${prefix}TargetNick`] || "").trim().toLowerCase();
  const subjectUserId = Number.isInteger(Number(subject?.userId))
    ? String(Number(subject.userId))
    : "";
  const subjectInstallId = normalizeInstallId(subject?.installId || "");
  const subjectNick = String(subject?.nick || subject?.fallbackNick || "").trim().toLowerCase();
  if (targetUserId && subjectUserId && targetUserId === subjectUserId) return true;
  if (targetInstallId && subjectInstallId && targetInstallId === subjectInstallId) return true;
  return !!targetNick && !!subjectNick && targetNick === subjectNick;
}

function isPrivateClientIp(ip) {
  const value = normalizeIp(ip);
  if (!value) return false;
  if (value === "127.0.0.1" || value === "::1" || value === "localhost") return true;
  if (value.startsWith("10.")) return true;
  if (value.startsWith("192.168.")) return true;
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
  }
  return false;
}

function areDevToolsAllowedForSocket(socket) {
  const raw = String(process.env.GOBBLE_DEV_TOOLS || "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  const devAccount = getSocketDevAccount(socket);
  if (!devAccount.allowed) return false;
  return true;
}

function isDevPasswordRequired(socket) {
  return false;
}

function hasUnlockedDevTools(socket) {
  return areDevToolsAllowedForSocket(socket);
}

function buildDevControlsPayload(socket = null) {
  const accessConfig = getDevAccessConfig();
  const passwordRequired = socket ? isDevPasswordRequired(socket) : !!accessConfig.password;
  const unlocked = socket ? hasUnlockedDevTools(socket) : !passwordRequired;
  const devAccount = socket ? getSocketDevAccount(socket) : { allowed: true, label: "" };
  return {
    available: socket ? areDevToolsAllowedForSocket(socket) : true,
    unlocked,
    locked: !unlocked,
    passwordRequired,
    passwordConfigured: !!accessConfig.password,
    accountAllowed: !!devAccount.allowed,
    accountLabel: devAccount.label || "",
    allowedAccountsConfigured:
      accessConfig.devAccountNames.size > 0 || accessConfig.devAccountIds.size > 0,
    controls: normalizeDevControls(devControls),
    roundTypes: [
      { value: "", label: "Cycle normal" },
      { value: "normal", label: "Manches normales" },
      { value: FINALE_TYPE, label: "Finale · bonus ×2" },
      { value: "self_specials_3_words", label: "3 mots en boucle" },
      { value: "speed", label: "Rapidite en boucle" },
      { value: "monstrous", label: "Grille monstrueuse" },
      { value: "target_long", label: "Mot le plus long" },
      { value: "target_score", label: "Meilleur mot" },
      { value: "bonus_letter", label: "Lettre en or" },
      { value: MASSIVE_BOGGLE_TYPE, label: "Massive Boggle" },
      { value: "fake_twins", label: "Faux jumeaux" },
      { value: OCID_TYPE, label: "OCID" },
    ],
  };
}

function requireDevToolsAccess(socket, cb) {
  if (!areDevToolsAllowedForSocket(socket)) {
    cb?.({ ok: false, error: "dev_tools_unavailable", ...buildDevControlsPayload(socket) });
    return false;
  }
  if (!hasUnlockedDevTools(socket)) {
    cb?.({ ok: false, error: "dev_tools_locked", ...buildDevControlsPayload(socket) });
    return false;
  }
  return true;
}

function sanitizeDevGlobalAnnouncement(raw) {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, DEV_GLOBAL_ANNOUNCEMENT_MAX_LEN);
}

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
  duelStatusResponseCache.clear();
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
  const job = persistenceClient.grantWeeklyWinnerGobblars({
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
  if (isDevSelfRewardTarget("selfCrown", { installId: raw })) return true;
  const entry = getDuelCacheEntry(raw);
  return !!entry?.crowned;
}

function isDailyChampionPlayer(player) {
  if (isDevSelfRewardTarget("selfCrown", player)) return true;
  return isDailyChampionInstallId(player?.installId);
}

let weeklyVocabPodiumCache = { checkedAt: 0, podium: [] };

function getCachedPreviousWeeklyVocabPodium() {
  const now = Date.now();
  if (now - weeklyVocabPodiumCache.checkedAt < 5000) {
    return weeklyVocabPodiumCache.podium;
  }
  const podium = getPreviousWeeklyVocabPodium(now, 3);
  weeklyVocabPodiumCache = { checkedAt: now, podium: Array.isArray(podium) ? podium : [] };
  return weeklyVocabPodiumCache.podium;
}

function getDevWeeklyVocabPodiumRank(subject = {}) {
  if (isDevSelfRewardTarget("selfGoldNick", subject)) return 1;
  if (isDevSelfRewardTarget("selfSilverNick", subject)) return 2;
  if (isDevSelfRewardTarget("selfBronzeNick", subject)) return 3;
  return 0;
}

function getWeeklyVocabPodiumRankForSubject(subject = {}) {
  if (subject?.isBot) return 0;
  const devRank = getDevWeeklyVocabPodiumRank(subject);
  if (devRank) return devRank;
  const podium = getCachedPreviousWeeklyVocabPodium();
  if (!podium.length) return 0;
  const playerKey = getMedalKeyForPlayer(subject);
  const installId = normalizeInstallId(subject?.installId);
  const nick = typeof subject?.nick === "string" ? subject.nick.trim() : "";
  for (const entry of podium) {
    const rank = Number(entry?.rank) || 0;
    if (!rank) continue;
    if (entry?.playerKey && playerKey && entry.playerKey === playerKey) return rank;
    if (entry?.installId && installId && entry.installId === installId) return rank;
    if (!entry?.playerKey && !entry?.installId && entry?.nick && nick && entry.nick === nick) {
      return rank;
    }
  }
  return 0;
}

function isWeeklyVocabChampionPlayer(player) {
  return getWeeklyVocabPodiumRankForSubject(player) === 1;
}

function isWeeklyVocabChampionInstallId(raw, fallbackNick = "") {
  return getWeeklyVocabPodiumRankForSubject({ installId: raw, fallbackNick }) === 1;
}

function getWeeklyVocabPodiumRankForPlayer(player) {
  return getWeeklyVocabPodiumRankForSubject(player);
}

function getWeeklyVocabPodiumRankForInstallId(raw, fallbackNick = "") {
  return getWeeklyVocabPodiumRankForSubject({ installId: raw, fallbackNick });
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

function runDeferredTask(task, delayMs = 0) {
  const timer = setTimeout(() => {
    Promise.resolve()
      .then(task)
      .catch((err) => {
        console.warn("Deferred task failed", err?.message || err);
      });
  }, Math.max(0, Number(delayMs) || 0));
  timer.unref?.();
}

function queueLiveHeadToHeadUpdate(payload, delayMs = 1500) {
  runDeferredTask(() => persistenceClient.recordLiveHeadToHeadOutcomes(payload), delayMs);
}

function queuePlayerRoundStatsUpdates(entries, delayMs = 2500) {
  const safeEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!safeEntries.length) return;
  runDeferredTask(() => {
    for (const entry of safeEntries) {
      persistenceClient.recordPlayerRoundStats(entry);
    }
  }, delayMs);
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

function buildDuelStatusCacheKey(rawInstallId, dateId = null) {
  const installId = normalizeInstallId(rawInstallId);
  if (!installId) return "";
  const safeDateId = typeof dateId === "string" && dateId.trim() ? dateId.trim() : getParisDateId();
  return `${installId}|${safeDateId}`;
}

function clearDuelStatusResponseCache(rawInstallId) {
  const installId = normalizeInstallId(rawInstallId);
  if (!installId) return;
  clearCacheByPrefix(duelStatusResponseCache, `${installId}|`);
}

async function getCachedDuelStatus(rawInstallId, { dateId = null, force = false } = {}) {
  const installId = normalizeInstallId(rawInstallId);
  if (!installId) return getDuelStatus(rawInstallId, { dateId });
  const key = buildDuelStatusCacheKey(installId, dateId);
  return getCachedOrInFlight({
    cache: duelStatusResponseCache,
    inFlight: duelStatusInFlight,
    key,
    ttlMs: DUEL_STATUS_RESPONSE_CACHE_TTL_MS,
    force,
    task: () => getDuelStatus(installId, { dateId }),
  });
}

function buildThemeProfilePayload(installId, profile) {
  return {
    ok: true,
    installId,
    balance: Number(profile.balance) || 0,
    themeApplied: profile.themeApplied || {},
    themeUnlocks: profile.themeUnlocks || {},
    unlockCost: Number.isFinite(Number(profile.unlockCost))
      ? profile.unlockCost
      : THEME_UNLOCK_COST,
    lockableCategories: Array.isArray(profile.lockableCategories)
      ? profile.lockableCategories
      : [],
  };
}

function clearThemeProfileResponseCache(rawInstallId) {
  const installId = normalizeInstallId(rawInstallId);
  if (!installId) return;
  themeProfileResponseCache.delete(installId);
}

async function getCachedThemeProfilePayload(rawInstallId, { force = false } = {}) {
  const installId = normalizeInstallId(rawInstallId);
  if (!installId) return null;
  return getCachedOrInFlight({
    cache: themeProfileResponseCache,
    inFlight: themeProfileInFlight,
    key: installId,
    ttlMs: THEME_PROFILE_RESPONSE_CACHE_TTL_MS,
    force,
    task: async () => {
      const profile = await getGobblarProfileReadOnly(installId);
      if (!profile) return null;
      return buildThemeProfilePayload(installId, profile);
    },
  });
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

function getClientIpFromRequest(req) {
  try {
    const xf = req?.headers?.["x-forwarded-for"];
    if (typeof xf === "string" && xf.trim()) {
      return normalizeIp(xf.split(",")[0].trim());
    }
  } catch (_) {}
  return normalizeIp(req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress || "");
}

function getShortCachedValue(cache, key, ttlMs) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - (Number(entry.createdAt) || 0) > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.value || null;
}

function setShortCachedValue(cache, key, value) {
  if (!key || !value) return;
  cache.set(key, { value, createdAt: Date.now() });
  if (cache.size > SHORT_RESPONSE_CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

async function getCachedOrInFlight({ cache, inFlight, key, ttlMs, force = false, task }) {
  if (!force) {
    const cached = getShortCachedValue(cache, key, ttlMs);
    if (cached) return cached;
    const existing = inFlight.get(key);
    if (existing) return existing;
  }
  const promise = Promise.resolve()
    .then(task)
    .then((value) => {
      setShortCachedValue(cache, key, value);
      return value;
    })
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

function clearCacheByPrefix(cache, prefix) {
  for (const key of Array.from(cache.keys())) {
    if (String(key).startsWith(prefix)) cache.delete(key);
  }
}

function checkHeavyEndpointRateLimit(key, { limit = 30, windowMs = 60_000 } = {}) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return { ok: true, remaining: limit };
  const now = Date.now();
  const bucket = heavyEndpointRateBuckets.get(safeKey);
  if (!bucket || now >= bucket.resetAt) {
    heavyEndpointRateBuckets.set(safeKey, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: Math.max(0, limit - 1), resetAt: now + windowMs };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterMs: Math.max(1000, bucket.resetAt - now),
    };
  }
  return { ok: true, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

function pruneHeavyEndpointRateBuckets(now = Date.now()) {
  if (heavyEndpointRateBuckets.size < 1000) return;
  for (const [key, bucket] of Array.from(heavyEndpointRateBuckets.entries())) {
    if (!bucket?.resetAt || bucket.resetAt <= now) heavyEndpointRateBuckets.delete(key);
  }
}

function sendRateLimitResponse(res, check) {
  const retryAfterSeconds = Math.max(1, Math.ceil((Number(check?.retryAfterMs) || 1000) / 1000));
  res.set("Retry-After", String(retryAfterSeconds));
  res.status(429);
  return res.json({ ok: false, error: "rate_limited", retryAfterMs: retryAfterSeconds * 1000 });
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
    label: "Manche classique",
    description: null,
    minWords: roomConfig?.minWords || 0,
  };
}

function buildFinaleTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: FINALE_TYPE,
    label: "Manche finale",
    description: FINALE_DESCRIPTION,
    minWords: getFinaleMinWords(roomConfig?.minWords || 0),
    minTotalScore: FINALE_MIN_TOTAL_SCORE,
    tileBonusMultiplier: FINALE_TILE_BONUS_MULTIPLIER,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
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

function buildMassiveBoggleTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: MASSIVE_BOGGLE_TYPE,
    label: "Massive Boggle",
    description: "Mots de 3+ lettres, bonus de tuiles désactivés",
    minWords: CLASSIC_BOGGLE_MIN_WORDS,
    minLongWordLen: CLASSIC_BOGGLE_MIN_LONG_WORD_LEN,
    minLongWordCount: CLASSIC_BOGGLE_MIN_LONG_WORD_COUNT,
    minWordLength: 3,
    classicBoggleScoring: true,
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
      "Une case de la grille peut valoir l'une ou l'autre de deux lettres. Les mots de 2 lettres ou plus sont valides",
    minWordLength: FAKE_TWINS_MIN_WORD_LENGTH,
    disableBonuses: true,
    qualityAttempts: SPECIAL_QUALITY_ATTEMPTS,
  };
}

function buildOcidTournamentPlan(tournamentRound, roomConfig) {
  const base = buildBaseTournamentPlan(tournamentRound, roomConfig);
  return {
    ...base,
    isSpecial: true,
    type: OCID_TYPE,
    label: "Manche OCID",
    description:
      "Propose un mot qui correspond a la definition. Le vrai mot rare sera dans la liste au vote.",
    minWords: 200,
    maxTargetLength: 13,
    disableBonuses: true,
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
    { weight: 1, value: (round) => buildOcidTournamentPlan(round, roomConfig) },
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
  room.devForcedRoundPickCache = new Map();
  room.bufferedPreparedGrid = null;
  room.bufferedPreparedGridPromise = null;
  room.bufferedPreparedGridPromiseMeta = null;
}

function pickDevForcedRoundType(room, tournamentRound) {
  const forcedRoundTypes = Array.isArray(devControls?.forcedRoundTypes)
    ? devControls.forcedRoundTypes
    : [];
  if (!forcedRoundTypes.length) return devControls.forcedRoundType || "";
  if (!devControls?.forcedRoundRandom || forcedRoundTypes.length < 2) {
    return forcedRoundTypes[(Math.max(1, Number(tournamentRound) || 1) - 1) % forcedRoundTypes.length];
  }
  if (!(room.devForcedRoundPickCache instanceof Map)) {
    room.devForcedRoundPickCache = new Map();
  }
  const cacheKey = `${forcedRoundTypes.join("|")}#${Math.max(1, Number(tournamentRound) || 1)}`;
  const cached = room.devForcedRoundPickCache.get(cacheKey);
  if (cached && forcedRoundTypes.includes(cached)) return cached;
  const picked = forcedRoundTypes[Math.floor(Math.random() * forcedRoundTypes.length)] || "";
  room.devForcedRoundPickCache.set(cacheKey, picked);
  return picked;
}

function getTournamentRoundPlan(room, tournamentRound) {
  if (isDevControlsActive()) {
    const forcedRoundType = pickDevForcedRoundType(room, tournamentRound);
    switch (forcedRoundType) {
      case "normal":
        return buildBaseTournamentPlan(tournamentRound, room.config);
      case FINALE_TYPE:
        return buildFinaleTournamentPlan(tournamentRound, room.config);
      case SELF_SPECIAL_3_WORDS_TYPE:
        return buildSelfSpecial3WordsTournamentPlan(tournamentRound, room.config);
      case "speed":
        return buildSpeedTournamentPlan(tournamentRound, room.config);
      case "monstrous":
        return buildMonstrousTournamentPlan(tournamentRound, room.config);
      case "target_long":
        return buildTargetLongTournamentPlan(tournamentRound, room.config);
      case "target_score":
        return buildTargetScoreTournamentPlan(tournamentRound, room.config);
      case "bonus_letter":
        return buildBonusLetterTournamentPlan(tournamentRound, room.config);
      case MASSIVE_BOGGLE_TYPE:
        return buildMassiveBoggleTournamentPlan(tournamentRound, room.config);
      case FAKE_TWINS_TYPE:
        return buildFakeTwinsTournamentPlan(tournamentRound, room.config);
      case OCID_TYPE:
        return buildOcidTournamentPlan(tournamentRound, room.config);
      default:
        break;
    }
  }
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
  if (tournamentRound === TOURNAMENT_MASSIVE_BOGGLE_ROUND) {
    return buildMassiveBoggleTournamentPlan(tournamentRound, room.config);
  }
  const total = room?.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS;
  // La finale conserve le jeu classique, avec une grille plus riche et des bonus renforcés.
  if (tournamentRound === total) {
    return buildFinaleTournamentPlan(tournamentRound, room.config);
  }
  const special = room?.tournament?.specials?.get(tournamentRound);
  if (special) return special;
  return buildBaseTournamentPlan(tournamentRound, room.config);
}

function getTrainingRoundPlan(room, rawType) {
  const type = String(rawType || "normal").trim();
  const roundNumber = 1;
  switch (type) {
    case FINALE_TYPE:
      return buildFinaleTournamentPlan(roundNumber, room.config);
    case SELF_SPECIAL_3_WORDS_TYPE:
      return buildSelfSpecial3WordsTournamentPlan(roundNumber, room.config);
    case "speed":
      return buildSpeedTournamentPlan(roundNumber, room.config);
    case "monstrous":
      return buildMonstrousTournamentPlan(roundNumber, room.config);
    case "target_long":
      return buildTargetLongTournamentPlan(roundNumber, room.config);
    case "target_score":
      return buildTargetScoreTournamentPlan(roundNumber, room.config);
    case "bonus_letter":
      return buildBonusLetterTournamentPlan(roundNumber, room.config);
    case MASSIVE_BOGGLE_TYPE:
      return buildMassiveBoggleTournamentPlan(roundNumber, room.config);
    case FAKE_TWINS_TYPE:
      return buildFakeTwinsTournamentPlan(roundNumber, room.config);
    case OCID_TYPE:
      return buildOcidTournamentPlan(roundNumber, room.config);
    case "normal":
    default:
      return buildBaseTournamentPlan(roundNumber, room.config);
  }
}

function getEstimatedRoundDurationMs(room, plan) {
  const type = String(plan?.type || "normal");
  if (type === OCID_TYPE) {
    return ROUND_INTRO_DURATION_MS + OCID_PROPOSAL_DURATION_MS + OCID_VOTE_DURATION_MS;
  }
  if (type === "target_long" || type === "target_score") {
    return ROUND_INTRO_DURATION_MS + TARGET_SPECIAL_ROUND_DURATION_MS;
  }
  if (type === "speed" || type === "monstrous" || type === MASSIVE_BOGGLE_TYPE) {
    return ROUND_INTRO_DURATION_MS + LIVE_SPECIAL_ROUND_DURATION_MS;
  }
  return ROUND_INTRO_DURATION_MS + (room?.config?.durationMs || DEFAULT_ROUND_DURATION_MS);
}

function getEstimatedPostRoundBreakMs(room, plan, { finalRound = false } = {}) {
  if (finalRound) return TOURNAMENT_END_TOTAL_BREAK_MS;
  const configuredBreakMs = room?.config?.breakMs || DEFAULT_BREAK_DURATION_MS;
  const type = String(plan?.type || "normal");
  if (type === "target_long" || type === "target_score") {
    return Math.min(configuredBreakMs, TARGET_BREAK_DURATION_MS);
  }
  return configuredBreakMs;
}

function getCurrentRoundRemainingMs(round, now = Date.now()) {
  if (!round) return 0;
  let remainingMs = Math.max(0, (Number(round.endsAt) || now) - now);
  if (
    round.special?.type === OCID_TYPE &&
    round.status !== "ocid_vote" &&
    round.status !== "finished"
  ) {
    remainingMs += OCID_VOTE_DURATION_MS;
  }
  return remainingMs;
}

function getNextMiniTournamentEtaMs(room, now = Date.now()) {
  if (!room) return null;
  const lobby = ensureTournamentLobby(room);

  if (!room.currentRound && !room.breakState) {
    if (lobby.introEndsAt) {
      return Math.max(0, Number(lobby.introEndsAt) - now);
    }
    if (lobby.countdownEndsAt) {
      return Math.max(0, Number(lobby.countdownEndsAt) - now) + MINI_TOURNAMENT_INTRO_MS;
    }
    return room.roundStartPending ? 0 : null;
  }

  if (room.breakState) {
    let etaMs = Math.max(0, (Number(room.breakState.nextStartAt) || now) - now);
    if (
      room.breakState.breakKind === "tournament_end" ||
      room.breakState.breakKind === "training_end"
    ) {
      return etaMs;
    }
    const totalRounds = room.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS;
    const nextRound = Math.max(
      1,
      Number(room.breakState.tournament?.nextRound) ||
        (Number(room.tournament?.currentRound) || 0) + 1
    );
    for (let roundNumber = nextRound; roundNumber <= totalRounds; roundNumber += 1) {
      const plan = getTournamentRoundPlan(room, roundNumber);
      etaMs += getEstimatedRoundDurationMs(room, plan);
      etaMs += getEstimatedPostRoundBreakMs(room, plan, {
        finalRound: roundNumber === totalRounds,
      });
    }
    return etaMs;
  }

  const currentRound = room.currentRound;
  let etaMs = getCurrentRoundRemainingMs(currentRound, now);
  if (currentRound?.training) {
    return etaMs + TRAINING_BREAK_MS;
  }
  const totalRounds = room.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS;
  const currentTournamentRound = Math.max(1, Number(currentRound?.tournamentRound) || 1);
  const currentPlan = currentRound?.special || getTournamentRoundPlan(room, currentTournamentRound);
  etaMs += getEstimatedPostRoundBreakMs(room, currentPlan, {
    finalRound: currentTournamentRound === totalRounds,
  });
  for (
    let roundNumber = currentTournamentRound + 1;
    roundNumber <= totalRounds;
    roundNumber += 1
  ) {
    const plan = getTournamentRoundPlan(room, roundNumber);
    etaMs += getEstimatedRoundDurationMs(room, plan);
    etaMs += getEstimatedPostRoundBreakMs(room, plan, {
      finalRound: roundNumber === totalRounds,
    });
  }
  return etaMs;
}

function maybeStartTournamentCountdown(room) {
  if (!isInterTournamentLobbyOpen(room)) return false;
  const lobby = ensureTournamentLobby(room);
  if (lobby.countdownEndsAt || lobby.introEndsAt) return false;
  const state = buildTournamentLobbyPayload(room);
  if (!state.canStart) return false;
  lobby.countdownEndsAt = Date.now() + INTER_TOURNAMENT_COUNTDOWN_MS;
  emitTournamentLobby(room);
  io.to(room.id).emit("miniTournamentCountdownStarted", buildTournamentLobbyPayload(room));
  lobby.countdownTimer = setTimeout(() => {
    startMiniTournamentIntro(room);
  }, INTER_TOURNAMENT_COUNTDOWN_MS);
  return true;
}

function startMiniTournamentIntro(room) {
  if (!isInterTournamentLobbyOpen(room)) return;
  const lobby = ensureTournamentLobby(room);
  if (lobby.countdownTimer) clearTimeout(lobby.countdownTimer);
  lobby.countdownTimer = null;
  lobby.countdownEndsAt = null;
  lobby.introEndsAt = Date.now() + MINI_TOURNAMENT_INTRO_MS;
  emitTournamentLobby(room);
  io.to(room.id).emit("miniTournamentIntroStarted", buildTournamentLobbyPayload(room));
  lobby.introTimer = setTimeout(() => {
    beginReadyMiniTournament(room).catch((err) =>
      console.warn(`[${room.id}] beginReadyMiniTournament failed`, err)
    );
  }, MINI_TOURNAMENT_INTRO_MS);
}

async function beginReadyMiniTournament(room) {
  if (!isInterTournamentLobbyOpen(room)) return;
  if (isMaintenanceModeActive()) {
    resetTournamentLobby(room);
    emitTournamentLobby(room);
    return;
  }
  resetTournamentLobby(room);
  resetTournament(room);
  await startRoundForRoom(room);
}

function forceTrainingBotsForOneRound(room) {
  if (!botManager || typeof botManager.setBotActive !== "function") return;
  if (!devControls?.botsEnabled) return;
  if (typeof botManager.setAnimatorBotsEnabled === "function" && devControls?.animatorBotsEnabled === false) {
    botManager.setAnimatorBotsEnabled(true);
  }
  for (const nick of TRAINING_FORCED_BOTS) {
    botManager.setBotActive(room, nick, true, "rounds:1");
  }
}

async function startTrainingRound(room, rawType) {
  if (isMaintenanceModeActive()) {
    return buildMaintenanceBlockedPayload();
  }
  if (!isInterTournamentLobbyOpen(room)) {
    return { ok: false, error: "room_busy" };
  }
  const state = buildTournamentLobbyPayload(room);
  if (!state.trainingAvailable) {
    return { ok: false, error: "training_unavailable" };
  }
  const plan = getTrainingRoundPlan(room, rawType);
  forceTrainingBotsForOneRound(room);
  resetTournamentLobby(room);
  await startRoundForRoom(room, { training: true, planOverride: plan });
  return { ok: true, roundType: plan.type, label: plan.label || "Entrainement" };
}

function buildSpecialWarning(plan) {
  if (!plan?.isSpecial) return null;
  const label = plan.label || "manche speciale";
  if (plan.type === FINALE_TYPE) {
    return "FINALE À SUIVRE : points du classement ×2 et tuiles spéciales ×2 (L2→L4, L3→L6, M2→M4, M3→M6)";
  }
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
    return `ATTENTION, MANCHE SPECIALE A SUIVRE : ${label} (une case vaut 2 lettres, mots de 2+ lettres)`;
  }
  if (plan.type === MASSIVE_BOGGLE_TYPE) {
    return `ATTENTION, MANCHE SPECIALE A SUIVRE : ${label} (mots de 3+ lettres)`;
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
    ocidRecentTargets: [],
    cultureThemeRecentThemes: [],
    cultureThemeUsageCounts: new Map(),
    roundCounter: 0,
    specialWarningIssuedFor: null,
    breakState: null, // { nextStartAt, breakKind, tournament, nextSpecial }
    roundStartPending: false,
    tournamentLobby: {
      readyKeys: new Set(),
      countdownEndsAt: null,
      introEndsAt: null,
      countdownTimer: null,
      introTimer: null,
    },
    lastRoundResults: null,
    pendingDisconnects: new Map(), // socket.id -> { timer, installId, nick }
    presenceAnnouncedAt: new Map(), // installId -> last join announcement ts
    rankingBroadcastTimer: null,
    rankingLastBroadcastAt: 0,
    rankingLastSignature: null,
    rankingDirty: false,
    rankingPendingPayload: null,
    rankingPendingSignature: null,
    perfCounters: null,
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

function bumpRoomPerfCounter(room, key, amount = 1, meta = null) {
  if (!room || !key) return;
  const now = Date.now();
  if (!room.perfCounters || now - (room.perfCounters.startedAt || 0) > PERF_COUNTER_WINDOW_MS) {
    if (room.perfCounters && room.perfCounters.counts) {
      const counts = room.perfCounters.counts;
      const rankingBuilds = Number(counts.rankingBuilds) || 0;
      const rankingMs = Number(counts.rankingBuildMs) || 0;
      const submitWords = Number(counts.submitWords) || 0;
      const batchWords = Number(counts.batchWords) || 0;
      const duelQueued = Number(counts.duelWordQueued) || 0;
      if (rankingBuilds >= 30 || submitWords >= 60 || batchWords >= 40 || duelQueued >= 40) {
        console.warn(`[perf:${room.id}] hot window`, {
          ms: now - room.perfCounters.startedAt,
          rankingBuilds,
          rankingBuildMs: Math.round(rankingMs),
          rankingEmits: Number(counts.rankingEmits) || 0,
          submitWords,
          batchWords,
          duelWordQueued: duelQueued,
          sockets: io?.sockets?.adapter?.rooms?.get?.(room.id)?.size || 0,
        });
      }
    }
    room.perfCounters = { startedAt: now, counts: Object.create(null), lastMeta: null };
  }
  room.perfCounters.counts[key] = (Number(room.perfCounters.counts[key]) || 0) + amount;
  if (meta) room.perfCounters.lastMeta = meta;
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

function isHumanPlayer(player) {
  return !!player && !isBotToken(player?.token);
}

function getPlayerReadyKey(player) {
  const installId = normalizeInstallId(player?.installId || "");
  if (installId) return `install:${installId}`;
  const userId = Number.isInteger(Number(player?.userId)) ? Number(player.userId) : null;
  if (userId) return `user:${userId}`;
  const nick = String(player?.nick || "").trim().toLowerCase();
  return nick ? `nick:${nick}` : "";
}

function getPlayerLastActivityAt(player) {
  return Number(player?.lastActivityAt) || Number(player?.lastSeenAt) || 0;
}

function isPlayerAfk(player, now = Date.now()) {
  if (!isHumanPlayer(player)) return false;
  if (!isPlayerConnected(player)) return false;
  const lastActivityAt = getPlayerLastActivityAt(player);
  if (!lastActivityAt) return false;
  return now - lastActivityAt >= PLAYER_AFK_AFTER_MS;
}

function clearPlayerAfkTimer(player) {
  if (!player?.afkTimer) return;
  clearTimeout(player.afkTimer);
  player.afkTimer = null;
}

function schedulePlayerAfkTransition(room, socketId, player) {
  clearPlayerAfkTimer(player);
  if (!room || !socketId || !isHumanPlayer(player) || !isPlayerConnected(player)) return;
  const elapsed = Math.max(0, Date.now() - getPlayerLastActivityAt(player));
  const delay = Math.max(25, PLAYER_AFK_AFTER_MS - elapsed + 25);
  player.afkTimer = setTimeout(() => {
    player.afkTimer = null;
    const current = room.players.get(socketId);
    if (current !== player || !isPlayerConnected(current)) return;
    if (!isPlayerAfk(current)) {
      schedulePlayerAfkTransition(room, socketId, current);
      return;
    }
    emitPlayers(room);
    emitTournamentLobby(room);
    emitRoomsStats();
    maybeStartTournamentCountdown(room);
  }, delay);
  player.afkTimer.unref?.();
}

function markSocketPlayerActivity(room, socket, reason = "activity") {
  if (!room || !socket?.id) return false;
  const player = room.players.get(socket.id);
  if (!player || !isHumanPlayer(player)) return false;
  const now = Date.now();
  const wasAfk = isPlayerAfk(player, now);
  player.lastActivityAt = now;
  player.lastSeenAt = now;
  player.lastActivityReason = reason;
  schedulePlayerAfkTransition(room, socket.id, player);
  return wasAfk;
}

function ensureTournamentLobby(room) {
  if (!room.tournamentLobby) {
    room.tournamentLobby = {
      readyKeys: new Set(),
      countdownEndsAt: null,
      introEndsAt: null,
      countdownTimer: null,
      introTimer: null,
    };
  }
  if (!(room.tournamentLobby.readyKeys instanceof Set)) {
    room.tournamentLobby.readyKeys = new Set(room.tournamentLobby.readyKeys || []);
  }
  return room.tournamentLobby;
}

function clearTournamentLobbyTimers(room) {
  const lobby = ensureTournamentLobby(room);
  if (lobby.countdownTimer) clearTimeout(lobby.countdownTimer);
  if (lobby.introTimer) clearTimeout(lobby.introTimer);
  lobby.countdownTimer = null;
  lobby.introTimer = null;
  lobby.countdownEndsAt = null;
  lobby.introEndsAt = null;
}

function resetTournamentLobby(room, { keepReady = false } = {}) {
  const lobby = ensureTournamentLobby(room);
  clearTournamentLobbyTimers(room);
  if (!keepReady) lobby.readyKeys.clear();
}

function isInterTournamentLobbyOpen(room) {
  return !!room && !room.roundStartPending && !room.currentRound && !room.breakState;
}

function getConnectedHumanPlayers(room, now = Date.now()) {
  if (!room?.players) return [];
  return Array.from(room.players.values()).filter(
    (player) => isHumanPlayer(player) && isPlayerConnected(player)
  );
}

function buildTournamentLobbyPayload(room) {
  const lobby = ensureTournamentLobby(room);
  const now = Date.now();
  const humans = getConnectedHumanPlayers(room, now);
  const activeHumans = humans.filter((player) => !isPlayerAfk(player, now));
  const readyActive = activeHumans.filter((player) =>
    lobby.readyKeys.has(getPlayerReadyKey(player))
  );
  const readyTotal = humans.filter((player) => lobby.readyKeys.has(getPlayerReadyKey(player)));
  const activeHumanCount = activeHumans.length;
  const readyThreshold = Math.max(1, Math.ceil(activeHumanCount * 0.5));
  const maintenanceMode = isMaintenanceModeActive();
  const isLobbyOpen = isInterTournamentLobbyOpen(room);
  const canStart =
    isLobbyOpen && !maintenanceMode && activeHumanCount > 0 && readyActive.length >= readyThreshold;
  const phase = lobby.introEndsAt
    ? "intro"
    : lobby.countdownEndsAt
    ? "countdown"
    : room.roundStartPending
    ? "starting"
    : isLobbyOpen
    ? "ready"
    : "closed";
  return {
    roomId: room.id,
    phase,
    isOpen: isLobbyOpen,
    readyCount: readyActive.length,
    readyTotalCount: readyTotal.length,
    readyThreshold,
    activeHumanCount,
    totalHumanCount: humans.length,
    afkHumanCount: Math.max(0, humans.length - activeHumans.length),
    countdownEndsAt: lobby.countdownEndsAt || null,
    introEndsAt: lobby.introEndsAt || null,
    roundStartPending: !!room.roundStartPending,
    canStart,
    maintenanceMode,
    maintenanceMessage: maintenanceMode ? "Maintenance en cours" : "",
    trainingEnabled: devControls?.trainingEnabled !== false && !maintenanceMode,
    trainingAvailable: !maintenanceMode && devControls?.trainingEnabled !== false && humans.length === 1 && isLobbyOpen,
    readyPlayers: readyTotal.map((player) => player.nick).filter(Boolean),
  };
}

function emitTournamentLobby(room) {
  if (!room?.id) return;
  io.to(room.id).emit("tournamentLobbyUpdate", buildTournamentLobbyPayload(room));
}

function enterInterTournamentLobby(room) {
  if (!room) return;
  room.roundStartPending = false;
  clearPendingRankingBroadcast(room);
  if (room.currentRound?.timers) {
    room.currentRound.timers.forEach((timer) => clearTimeout(timer));
  }
  if (room.endSoonTimeout) clearTimeout(room.endSoonTimeout);
  if (room.finalFightScheduled) clearTimeout(room.finalFightScheduled);
  room.currentRound = null;
  room.breakState = null;
  cancelBufferedPreparedGrid(room);
  resetTournamentLobby(room);
  emitTournamentLobby(room);
  emitPlayers(room);
  emitRoomsStats();
}

function returnRoomToLiveLobby(room, reason = "dev") {
  if (!room) return false;
  const hadActivity = !!room.currentRound || !!room.breakState;
  if (botManager?.onRoundEnd && room.currentRound) {
    botManager.onRoundEnd(room);
  }
  resetTournament(room);
  enterInterTournamentLobby(room);
  pushSystemChatMessage(room, "Retour au lobby live.", {
    meta: { kind: "return_to_live_lobby", reason },
  });
  return hadActivity;
}

function getBotStrengthForNick(nick) {
  if (!nick) return 0;
  return Number.isFinite(BOT_STRENGTH_BY_NICK.get(nick))
    ? BOT_STRENGTH_BY_NICK.get(nick)
    : 0;
}

function emitPlayers(room) {
  const now = Date.now();
  const lobby = ensureTournamentLobby(room);
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
        afk: isPlayerAfk(p, now),
        readyForTournament: lobby.readyKeys.has(getPlayerReadyKey(p)),
        isDailyChampion: isDailyChampionPlayer(p),
        weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForPlayer(p),
        isWeeklyVocabChampion: isWeeklyVocabChampionPlayer(p),
      }))
  );
  emitTournamentLobby(room);
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
  if (isDevControlsActive("botMedals")) {
    for (const p of room.players.values()) {
      if (!isBotToken(p?.token) || !p?.nick) continue;
      payload[p.nick] = { gold: 3, silver: 3, bronze: 3, dev: true };
    }
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
      void persistenceClient.addGobblars({
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
          clearThemeProfileResponseCache(installId);
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
    const now = Date.now();
    const roomPlayers = Array.from(room.players.values()).filter((p) => p?.connected !== false);
    const playersCount = roomPlayers.length;
    const humanPlayers = roomPlayers.filter((p) => isHumanPlayer(p));
    const afkHumans = humanPlayers.filter((p) => isPlayerAfk(p, now)).length;
    return {
      roomId: room.id,
      label: room.config.label,
      players: playersCount,
      humanPlayers: humanPlayers.length,
      afkHumans,
      tournamentLobby: buildTournamentLobbyPayload(room),
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

function listModerationPlayers(room) {
  if (!room) return [];
  return Array.from(room.players.entries())
    .filter(([, player]) => !isBotToken(player?.token) && isPlayerConnected(player))
    .map(([socketId, player]) => ({
      socketId,
      nick: player?.nick || "",
      userId: Number.isInteger(Number(player?.userId)) ? Number(player.userId) : null,
      installId: normalizeInstallId(player?.installId || ""),
      connected: isPlayerConnected(player),
    }))
    .filter((player) => player.nick)
    .sort((a, b) => a.nick.localeCompare(b.nick, "fr", { sensitivity: "base" }));
}

function findModerationTarget(room, payload = {}) {
  if (!room) return null;
  const socketId = typeof payload.socketId === "string" ? payload.socketId.trim() : "";
  const installId = normalizeInstallId(payload.installId || payload.targetInstallId || "");
  const userId = Number.isInteger(Number(payload.userId || payload.targetUserId))
    ? Number(payload.userId || payload.targetUserId)
    : null;
  const nick = typeof payload.nick === "string" ? payload.nick.trim() : "";
  if (!socketId && !installId && !userId && !nick) return null;
  for (const [candidateSocketId, player] of room.players.entries()) {
    if (isBotToken(player?.token)) continue;
    if (socketId && candidateSocketId !== socketId) continue;
    if (installId && normalizeInstallId(player?.installId || "") !== installId) continue;
    if (userId && Number(player?.userId) !== userId) continue;
    if (nick && player?.nick !== nick) continue;
    return { socketId: candidateSocketId, player };
  }
  return null;
}

function appendModerationLog(entry) {
  try {
    moderationLogger.logLine(`${JSON.stringify(entry)}\n`);
  } catch (_) {}
}

function removeSocketPlayerFromRoom(room, targetSocketId, notice) {
  if (!room || !targetSocketId) return false;
  const player = room.players.get(targetSocketId);
  clearPendingDisconnect(room, targetSocketId);
  clearPlayerAfkTimer(player);
  if (notice) {
    if (notice.type === "playtime_limit") {
      io.to(targetSocketId).emit("playtimeLimit:blocked", notice);
    } else {
      io.to(targetSocketId).emit("moderation:notice", notice);
    }
  }
  room.players.delete(targetSocketId);
  if (player?.installId) {
    clearPresenceAnnouncement(room, normalizeInstallId(player.installId));
  }
  const targetSocket = io.sockets.sockets.get(targetSocketId);
  if (targetSocket) {
    try {
      targetSocket.leave(room.id);
    } catch (_) {}
    setTimeout(() => targetSocket.disconnect(true), notice ? 250 : 0);
  }
  emitPlayers(room);
  emitMedals(room);
  emitRoomsStats();
  return true;
}

function enforcePlaytimeLimitsAtTournamentStart(room) {
  if (!room?.players?.size) return;
  const removals = [];
  for (const [socketId, player] of room.players.entries()) {
    if (isBotToken(player?.token)) continue;
    const userId = Number(player?.userId);
    if (!Number.isInteger(userId) || userId <= 0) continue;
    const status = getPlaytimeLimitStatus(userId);
    if (!status?.active || !status.exhausted) continue;
    removals.push({
      socketId,
      notice: {
        type: "playtime_limit",
        action: "playtime_limit_exhausted",
        roomId: room.id,
        message:
          "Ton contrôle de temps est arrivé à zéro. Tu peux revenir au live demain.",
        playtimeLimit: status,
      },
    });
  }
  for (const removal of removals) {
    removeSocketPlayerFromRoom(room, removal.socketId, removal.notice);
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

function compactRoundSubmissionSolution(entry) {
  const word = normalizeWord(entry?.word || "");
  if (!word) return null;
  const pts = Number.isFinite(entry?.pts) ? entry.pts : 0;
  const usedFakeTwins = !!entry?.usedFakeTwins;
  const fakeTwinsCompletionWord = !!entry?.fakeTwinsCompletionWord;
  const fakeTwinsBonusOnly = !!entry?.fakeTwinsBonusOnly;
  const rareBonusWord = !!entry?.rareBonusWord;
  const rareBonusPoints = Number.isFinite(entry?.rareBonusPoints) ? entry.rareBonusPoints : 0;
  const rarityBucket = String(entry?.rarityBucket || "");
  const cultureThemeWord = !!entry?.cultureThemeWord;
  if (
    !usedFakeTwins &&
    !fakeTwinsCompletionWord &&
    !fakeTwinsBonusOnly &&
    !rareBonusWord &&
    !rareBonusPoints &&
    !rarityBucket &&
    !cultureThemeWord
  ) {
    return [word, pts];
  }
  return [
    word,
    pts,
    [],
    usedFakeTwins,
    fakeTwinsCompletionWord,
    fakeTwinsBonusOnly,
    rareBonusWord,
    rareBonusPoints,
    rarityBucket,
    cultureThemeWord,
  ];
}

function packRoundSubmissionSolutions(entries) {
  const words = [];
  const points = [];
  const meta = [];
  const list = Array.isArray(entries) ? entries : [];
  for (const entry of list) {
    const compact = Array.isArray(entry) ? entry : compactRoundSubmissionSolution(entry);
    const word = normalizeWord(compact?.[0] || "");
    if (!word) continue;
    const idx = words.length;
    words.push(word);
    points.push(Number.isFinite(compact[1]) ? compact[1] : 0);
    if (compact.length > 2) {
      meta.push([
        idx,
        compact[3] ? 1 : 0,
        compact[4] ? 1 : 0,
        compact[5] ? 1 : 0,
        compact[6] ? 1 : 0,
        Number.isFinite(compact[7]) ? compact[7] : 0,
        String(compact[8] || ""),
        compact[9] ? 1 : 0,
      ]);
    }
  }
  return { v: 2, w: words, p: points, m: meta };
}

function isCultureThemeChallengeWord(round, word) {
  const norm = normalizeWord(word);
  if (!norm) return false;
  const wordSet = round?.cultureThemeChallenge?.wordSet;
  return wordSet instanceof Set && wordSet.has(norm);
}

function getRoundSolutionsPayloadCount(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (payload && Array.isArray(payload.w)) return payload.w.length;
  return 0;
}

function buildRoundSubmissionSolutions(round) {
  if (!round || !dictionary) return packRoundSubmissionSolutions([]);
  if (round.special?.type === OCID_TYPE) {
    return packRoundSubmissionSolutions([]);
  }
  const isTargetRound =
    round.special?.type === "target_long" || round.special?.type === "target_score";
  if (isTargetRound) {
    const targetWord = normalizeWord(round.targetWord || "");
    if (!targetWord) return packRoundSubmissionSolutions([]);
    const targetPath = Array.isArray(round.targetPath) ? round.targetPath : [];
    return packRoundSubmissionSolutions([
      compactRoundSubmissionSolution({
        word: targetWord,
        pts: 0,
        usedFakeTwins: false,
      }),
    ].filter(Boolean));
  }

  const preparedSolutions = sanitizePreparedSolutions(round.solutions);
  if (preparedSolutions.length) {
    const scoreConfig = getSpecialScoreConfig(round);
    const shouldRescorePrepared =
      !!scoreConfig?.bonusLetter ||
      !!scoreConfig?.classicBoggleScoring ||
      Number(scoreConfig?.tileBonusMultiplier) > 1 ||
      round.special?.type === "bonus_letter" ||
      round.special?.type === MASSIVE_BOGGLE_TYPE;
    return packRoundSubmissionSolutions(preparedSolutions.map((entry) => {
      const path = Array.isArray(entry.path) ? entry.path : [];
      const rescored =
        shouldRescorePrepared && path.length
          ? scoreWordOnGridWithPath(entry.word, round.grid, path, scoreConfig)
          : null;
      const finalPath = Array.isArray(rescored?.path) ? rescored.path : path;
      const basePts = Number.isFinite(rescored?.pts)
        ? rescored.pts
        : Number.isFinite(entry.pts)
        ? entry.pts
        : 0;
      const rareMeta = buildRareBonusSubmittedWordMeta(round, entry.word);
      return compactRoundSubmissionSolution({
        ...entry,
        pts:
          computeWordScoreForRound(round, entry.word, finalPath, basePts) +
          (Number(rareMeta.rareBonusPoints) || 0),
        usedFakeTwins: !!(rescored?.usedFakeTwins || entry.usedFakeTwins),
        ...rareMeta,
        fakeTwinsCompletionWord: !!entry.fakeTwinsCompletionWord,
        fakeTwinsBonusOnly: !!entry.fakeTwinsBonusOnly,
        cultureThemeWord: isCultureThemeChallengeWord(round, entry.word),
      });
    }).filter(Boolean));
  }

  const startedAt = Date.now();
  const scoreConfig = getSpecialScoreConfig(round);
  const solved = solveGridCached(round.grid, dictionary, scoreConfig);
  const elapsed = Date.now() - startedAt;
  if (elapsed > 250) {
    console.warn(
      `[roundStarted] main-thread solve fallback took ${elapsed}ms round=${round.id} special=${round.special?.type || "normal"}`
    );
  }
  return packRoundSubmissionSolutions(Array.from(solved.entries()).map(([word, meta]) => {
    const path = Array.isArray(meta?.path) ? meta.path : [];
    const basePts = Number.isFinite(meta?.pts) ? meta.pts : 0;
    const rareMeta = buildRareBonusSubmittedWordMeta(round, word);
    return compactRoundSubmissionSolution({
      word,
      pts: computeWordScoreForRound(round, word, path, basePts) + (Number(rareMeta.rareBonusPoints) || 0),
      usedFakeTwins: !!meta?.usedFakeTwins,
      ...rareMeta,
      fakeTwinsCompletionWord: !!meta?.fakeTwinsCompletionWord,
      fakeTwinsBonusOnly: !!meta?.fakeTwinsBonusOnly,
      cultureThemeWord: isCultureThemeChallengeWord(round, word),
      fakeTwinsTwinIndex:
        Number.isInteger(meta?.fakeTwinsTwinIndex) ? meta.fakeTwinsTwinIndex : null,
      fakeTwinsResolvedLetter: meta?.fakeTwinsResolvedLetter ?? null,
      fakeTwinsUsesAlt: !!meta?.fakeTwinsUsesAlt,
    });
  }).filter(Boolean));
}

function buildRoundStartedPayload(room) {
  const round = room?.currentRound;
  if (!round) return null;
  const totalRounds = room.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS;
  const isTrainingRound = !!round.training;
  const currentTournamentRound = isTrainingRound ? 0 : round.tournamentRound || 1;
  const nextTournamentRound =
    currentTournamentRound >= totalRounds || isTrainingRound ? 1 : currentTournamentRound + 1;
  const nextPlan = isTrainingRound ? null : getTournamentRoundPlan(room, nextTournamentRound);
  const currentQuality = round.quality;
  const isCustomScoredSpecialRound =
    round.special?.type === "bonus_letter" ||
    round.special?.type === MASSIVE_BOGGLE_TYPE ||
    round.special?.type === FINALE_TYPE;
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
    ocidVote:
      round.special?.type === OCID_TYPE && round.status === "ocid_vote"
        ? buildPublicOcidVotePayload(room)
        : null,
    solutions: buildRoundSubmissionSolutions(round),
    cultureThemeChallenge: serializeCultureThemeChallenge(round.cultureThemeChallenge),
    special: round.special?.isSpecial ? round.special : null,
    training: isTrainingRound,
    gridQuality: currentQuality
      ? {
          words: currentQuality.words ?? 0,
          maxLen: currentQuality.maxLen ?? 0,
          maxPts:
            isCustomScoredSpecialRound
              ? bonusBestPts || currentQuality.maxPts || 0
              : isSpecial3WordsRound
              ? Number(currentQuality?.special3Words?.maxPts) ||
                Number(room?.bestPossibleStats?.maxPts) ||
                currentQuality.maxPts ||
                0
              : round.special?.fixedWordScore || currentQuality.maxPts || 0,
          totalPts: currentQuality.totalPts ?? 0,
          possibleScore:
            isCustomScoredSpecialRound
              ? bonusPossibleScore || currentQuality.possibleScore || currentQuality.totalPts || 0
              : currentQuality.possibleScore ?? currentQuality.totalPts ?? 0,
          longWords: currentQuality.longWords ?? 0,
          fakeTwinWords: currentQuality.fakeTwinWords ?? 0,
        }
      : null,
    roundNumber: round.roundNumber,
    tournament: {
      id: isTrainingRound ? null : room.tournament?.id || null,
      round: currentTournamentRound,
      totalRounds,
      isFinalRound: !isTrainingRound && currentTournamentRound === totalRounds,
      nextRound: nextTournamentRound,
      nextStartsNewTournament: !isTrainingRound && currentTournamentRound === totalRounds,
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
  const now = Date.now();
  const roundSubs = room.submissions.get(roundId) || new Map();
  const roundGobbles =
    room.currentRound.gobbles instanceof Map ? room.currentRound.gobbles : new Map();
  const ranking = [];
  for (const player of room.players.values()) {
    const data = roundSubs.get(player.nick);
    const connected = isPlayerConnected(player) || isBotToken(player?.token);
    const active = connected || hasPlayerActivity(data);
    if (!active) continue;
    ranking.push({
      nick: player.nick,
      userId: Number.isInteger(Number(player?.userId)) ? Number(player.userId) : null,
      score: data?.score || 0,
      gobbles: Number(roundGobbles.get(player.nick)) || 0,
      team: getTeamForInstallCached(player.installId),
      afk: isPlayerAfk(player, now),
      isDailyChampion: isDailyChampionPlayer(player),
      weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForPlayer(player),
      isWeeklyVocabChampion: isWeeklyVocabChampionPlayer(player),
    });
  }
  ranking.sort((a, b) => (b.score || 0) - (a.score || 0));
  return ranking.map((entry, idx) => ({
    nick: entry.nick,
    userId: Number.isInteger(Number(entry?.userId)) ? Number(entry.userId) : null,
    score: Number(entry.score) || 0,
    rank: idx + 1,
    gobbles: Number(entry.gobbles) || 0,
    team: entry.team || null,
    afk: !!entry.afk,
    isDailyChampion: !!entry.isDailyChampion,
    weeklyVocabPodiumRank: Number(entry.weeklyVocabPodiumRank) || 0,
    isWeeklyVocabChampion: !!entry.isWeeklyVocabChampion,
  }));
}

function buildSessionSnapshot(room, player) {
  if (!room || !player) return null;
  const round = room.currentRound;
  const hasActiveRound = isRoundActive(round);
  const phase = hasActiveRound
    ? "playing"
    : room.breakState || room.currentRound || room.roundStartPending
    ? "results"
    : "lobby";
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
    afk: isPlayerAfk(player),
    score,
    words,
    participated,
    team: getTeamForInstallCached(player.installId),
    isDailyChampion: isDailyChampionPlayer(player),
    weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForPlayer(player),
    isWeeklyVocabChampion: isWeeklyVocabChampionPlayer(player),
    special3Words,
  };

  return {
    roomId: room.id,
    phase,
    player: playerState,
    currentRound: currentRoundPayload,
    ranking: hasActiveRound && round?.id ? buildLiveRanking(room, round.id) : [],
    breakState: buildBreakSnapshot(room),
    tournamentLobby: buildTournamentLobbyPayload(room),
    lastRoundResults: room.breakState ? room.lastRoundResults || null : null,
  };
}

function ensurePlayerInRound(room, nick) {
  if (!room.currentRound) return;
  const roundSubs = room.submissions.get(room.currentRound.id);
  if (!roundSubs) return;
  if (!roundSubs.has(nick)) {
    roundSubs.set(nick, {
      words: new Set(),
      score: 0,
      wordTimes: new Map(),
      wordMeta: new Map(),
      wordScores: new Map(),
    });
  }
}

function clearPendingRankingBroadcast(room) {
  if (!room) return;
  if (room.rankingBroadcastTimer) {
    clearTimeout(room.rankingBroadcastTimer);
    room.rankingBroadcastTimer = null;
  }
  room.rankingDirty = false;
  room.rankingPendingPayload = null;
  room.rankingPendingSignature = null;
}

function buildRankingUpdatePayload(room) {
  const startedAt = Date.now();
  if (!room?.currentRound || room.currentRound.status !== "running") return null;
  const now = Date.now();
  const roundSubs = room.submissions.get(room.currentRound.id);
  if (!roundSubs) return null;
  const roundGobbles =
    room.currentRound.gobbles instanceof Map ? room.currentRound.gobbles : new Map();

  const ranking = [];
  for (const player of room.players.values()) {
    const data = roundSubs.get(player.nick);
    const connected = isPlayerConnected(player) || isBotToken(player?.token);
    const active = connected || hasPlayerActivity(data);
    if (!active) continue;
    ranking.push({
      nick: player.nick,
      userId: Number.isInteger(Number(player?.userId)) ? Number(player.userId) : null,
      score: data?.score || 0,
      gobbles: Number(roundGobbles.get(player.nick)) || 0,
      team: getTeamForInstallCached(player.installId),
      afk: isPlayerAfk(player, now),
      isDailyChampion: isDailyChampionPlayer(player),
      weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForPlayer(player),
      isWeeklyVocabChampion: isWeeklyVocabChampionPlayer(player),
    });
  }

  ranking.sort((a, b) => b.score - a.score);
  const compact = ranking.map((entry, idx) => ({
    nick: entry.nick,
    userId: Number.isInteger(Number(entry?.userId)) ? Number(entry.userId) : null,
    score: Number(entry.score) || 0,
    rank: idx + 1,
    gobbles: Number(entry.gobbles) || 0,
    team: entry.team || null,
    afk: !!entry.afk,
    isDailyChampion: entry.isDailyChampion || false,
    weeklyVocabPodiumRank: Number(entry.weeklyVocabPodiumRank) || 0,
    isWeeklyVocabChampion: entry.isWeeklyVocabChampion || false,
  }));
  const signature = ranking
    .map(
      (entry) =>
        `${entry.nick}:${Number(entry.score) || 0}:${Number(entry.gobbles) || 0}:${entry.team || ""}:${entry.isDailyChampion ? 1 : 0}:${Number(entry.weeklyVocabPodiumRank) || (entry.isWeeklyVocabChampion ? 1 : 0)}`
    )
    .join("|");

  const elapsed = Date.now() - startedAt;
  bumpRoomPerfCounter(room, "rankingBuilds");
  bumpRoomPerfCounter(room, "rankingBuildMs", elapsed);
  if (elapsed > PERF_RANKING_BUILD_WARN_MS) {
    console.warn(
      `[perf:${room.id}] ranking build ${elapsed}ms players=${ranking.length} round=${room.currentRound.id}`
    );
  }

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
  bumpRoomPerfCounter(room, "rankingEmits");
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
  if (!room.rankingDirty) return;
  room.rankingDirty = false;
  room.rankingPendingPayload = null;
  room.rankingPendingSignature = null;
  const built = buildRankingUpdatePayload(room);
  if (!built) return;
  emitRankingUpdate(room, built);
}

function broadcastProvisionalRanking(room, { force = false } = {}) {
  if (!room?.currentRound || room.currentRound.status !== "running") return;
  const now = Date.now();
  const elapsed = now - (room.rankingLastBroadcastAt || 0);

  if (force || elapsed >= RANKING_BROADCAST_MIN_MS) {
    if (room.rankingBroadcastTimer) {
      clearTimeout(room.rankingBroadcastTimer);
      room.rankingBroadcastTimer = null;
    }
    room.rankingDirty = false;
    room.rankingPendingPayload = null;
    room.rankingPendingSignature = null;
    const built = buildRankingUpdatePayload(room);
    if (built) emitRankingUpdate(room, built);
    return;
  }

  room.rankingDirty = true;
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
  target.text = censorTargetSpoilersInChatText(room, trimmedText);
  target.editedAt = Date.now();
  return { ok: true, message: target };
}

function getActiveTargetChatSpoilerWord(room) {
  const currentRound = room?.currentRound;
  if (!currentRound || !isRoundActive(currentRound)) return "";
  const specialType = currentRound?.special?.type;
  if (specialType !== "target_long" && specialType !== "target_score") return "";
  return normalizeWord(String(currentRound?.targetWord || "")).replace(/[^a-z]/g, "");
}

function getTargetChatSpoilerMinRun(targetWord) {
  const length = String(targetWord || "").length;
  if (length <= 0) return 0;
  return Math.min(length, TARGET_CHAT_SPOILER_MIN_RUN);
}

function isActiveTargetChatRound(room) {
  const currentRound = room?.currentRound;
  if (!currentRound || !isRoundActive(currentRound)) return false;
  const specialType = currentRound?.special?.type;
  return specialType === "target_long" || specialType === "target_score";
}

function checkTargetChatRateLimit(room, installId, now = Date.now()) {
  if (!isActiveTargetChatRound(room)) return { ok: true };
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) return { ok: true };
  const roundId = String(room?.currentRound?.id || "round");
  const roomId = String(room?.id || "room");
  const key = `${roomId}:${roundId}:${safeInstallId}`;
  const previous = targetChatRateBuckets.get(key) || [];
  const recent = previous.filter((ts) => now - ts < TARGET_CHAT_RATE_LIMIT_WINDOW_MS);
  if (recent.length >= TARGET_CHAT_RATE_LIMIT_MAX) {
    const retryMs = Math.max(250, TARGET_CHAT_RATE_LIMIT_WINDOW_MS - (now - recent[0]));
    targetChatRateBuckets.set(key, recent);
    return { ok: false, retryMs };
  }
  recent.push(now);
  targetChatRateBuckets.set(key, recent);
  if (targetChatRateBuckets.size > 2000) {
    for (const [bucketKey, timestamps] of targetChatRateBuckets.entries()) {
      const live = timestamps.filter((ts) => now - ts < TARGET_CHAT_RATE_LIMIT_WINDOW_MS);
      if (live.length) targetChatRateBuckets.set(bucketKey, live);
      else targetChatRateBuckets.delete(bucketKey);
    }
  }
  return { ok: true };
}

function buildNormalizedChatCharMap(text) {
  const rawChars = Array.from(String(text || ""));
  const normalizedChars = [];
  const rawIndexByNormalizedIndex = [];
  rawChars.forEach((char, rawIndex) => {
    const normalized = normalizeWord(char).replace(/[^a-z]/g, "");
    if (!normalized) return;
    for (const normalizedChar of normalized) {
      normalizedChars.push(normalizedChar);
      rawIndexByNormalizedIndex.push(rawIndex);
    }
  });
  return { rawChars, normalizedChars, rawIndexByNormalizedIndex };
}

function findAllSubstringRanges(haystack, needle) {
  const ranges = [];
  if (!haystack || !needle || needle.length > haystack.length) return ranges;
  let startIndex = 0;
  while (startIndex <= haystack.length - needle.length) {
    const matchIndex = haystack.indexOf(needle, startIndex);
    if (matchIndex < 0) break;
    ranges.push([matchIndex, matchIndex + needle.length - 1]);
    startIndex = matchIndex + 1;
  }
  return ranges;
}

function censorTargetSpoilersInChatText(room, text) {
  const trimmedText = typeof text === "string" ? text.trim() : "";
  if (!trimmedText) return trimmedText;

  const targetWord = getActiveTargetChatSpoilerWord(room);
  if (!targetWord) return trimmedText;

  const minRun = getTargetChatSpoilerMinRun(targetWord);
  if (!minRun) return trimmedText;

  const { rawChars, normalizedChars, rawIndexByNormalizedIndex } =
    buildNormalizedChatCharMap(trimmedText);
  const normalizedText = normalizedChars.join("");
  if (!normalizedText || normalizedText.length < minRun) return trimmedText;

  const segments = new Set();
  for (let segmentLength = targetWord.length; segmentLength >= minRun; segmentLength -= 1) {
    for (let start = 0; start <= targetWord.length - segmentLength; start += 1) {
      segments.add(targetWord.slice(start, start + segmentLength));
    }
  }

  const blockedRawIndices = new Set();
  for (const segment of segments) {
    const ranges = findAllSubstringRanges(normalizedText, segment);
    for (const [startIndex, endIndex] of ranges) {
      for (let normalizedIndex = startIndex; normalizedIndex <= endIndex; normalizedIndex += 1) {
        const rawIndex = rawIndexByNormalizedIndex[normalizedIndex];
        if (Number.isInteger(rawIndex) && rawIndex >= 0) {
          blockedRawIndices.add(rawIndex);
        }
      }
    }
  }

  if (!blockedRawIndices.size) return trimmedText;
  return rawChars
    .map((char, rawIndex) => (blockedRawIndices.has(rawIndex) ? "*" : char))
    .join("");
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

  emitChatSocketEvent(io, room.id, "chatMessage", message);
  scheduleDevBotResponseForChat(room, message);
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

const AMBIENT_CHAT_BOTS = Object.freeze({
  linguist: {
    nick: "GrosRobert",
    category: "linguist",
  },
  statistician: {
    nick: "Statatouille",
    category: "statistician",
  },
  detective: {
    nick: "Inspecteur Grille",
    category: "detective",
  },
  commentator: {
    nick: "RadioBoggle",
    category: "commentator",
  },
  culture: {
    nick: "WikiMama",
    category: "culture",
  },
  narrator: {
    nick: "Oraclettres",
    category: "narrator",
  },
  coach: {
    nick: "CaSuffix",
    category: "coach",
  },
  recordHunter: {
    nick: "Recordator",
    category: "record_hunter",
  },
  hiddenWord: {
    nick: "MomoMotus",
    category: "hidden_word",
  },
  trend: {
    nick: "Webomètre",
    category: "trend",
  },
});

const WORD_FACTS_BY_NORMALIZED_WORD = Object.freeze({
  algorithme:
    "Saviez-vous que 'algorithme' vient du nom latinisé du mathématicien persan Al-Khwarizmi ?",
  bistrot:
    "'Bistrot' a une origine discutée; l'explication par le russe 'bystro' reste célèbre, mais controversée.",
  serendipite:
    "FUN FACT : 'sérendipité' désigne l'art de faire une découverte heureuse sans l'avoir vraiment cherchée.",
  petrichor:
    "'Pétrichor' désigne l'odeur de la terre après la pluie.",
  canicule:
    "'Canicule' vient de Canicula, la 'petite chienne', nom donné à Sirius dans l'Antiquité.",
  fusee:
    "'Fusée' a longtemps désigné une pièce en fuseau avant de viser les engins qui montent très haut.",
});

const HIDDEN_WORD_LINES = Object.freeze([
  "Personne n'a trouvé {WORD} ({META}). Celui-là méritait une lampe frontale.",
  "{WORD} ({META}) est resté dans l'ombre jusqu'au bout.",
  "Le mot caché de la manche : {WORD} ({META}). Il avait visiblement pris un abonnement discret.",
  "Aucun joueur n'a débusqué {WORD} ({META}).",
  "{WORD} ({META}) était là, tranquillement, sans demander son reste.",
  "{WORD} ({META}) s'était glissé sous le tapis de lettres.",
  "{WORD} ({META}) a passé la manche en mode camouflage.",
  "Le coffre à mots garde une trace de {WORD} ({META}), resté bien discret.",
]);

const RECORD_HUNTER_RARE_GOBBLE_LINES = Object.freeze([
  {
    singular: "{NAMES} a sorti le double gobble. La grille vient de demander un avocat.",
    plural: "{NAMES} ont sorti le double gobble. La grille vient de demander un avocat.",
  },
  {
    singular: "{NAMES} a mis la main sur le double gobble. Le tableau tousse encore.",
    plural: "{NAMES} ont mis la main sur le double gobble. Le tableau tousse encore.",
  },
  {
    singular: "Double gobble pour {NAMES}. On note ça au stylo qui brille.",
    plural: "Double gobble pour {NAMES}. On note ça au stylo qui brille.",
  },
  {
    singular: "{NAMES} a trouvé le mot le plus long et le meilleur score. La paperasse du record est partie.",
    plural: "{NAMES} ont trouvé le mot le plus long et le meilleur score. La paperasse du record est partie.",
  },
  {
    singular: "{NAMES} a tout gobblé d'un seul coup. Le mot {WORD} n'a pas eu le temps de fuir.",
    plural: "{NAMES} ont tout gobblé d'un seul coup. Le mot {WORD} n'a pas eu le temps de fuir.",
  },
  {
    singular: "{NAMES} signe un double gobble. Le jury fait semblant de rester calme.",
    plural: "{NAMES} signent un double gobble. Le jury fait semblant de rester calme.",
  },
  {
    singular: "{NAMES} empoche le double gobble. Le dictionnaire hoche la tête.",
    plural: "{NAMES} empochent le double gobble. Le dictionnaire hoche la tête.",
  },
  {
    singular: "{NAMES} a trouvé la grosse pièce au fond du canapé alphabétique.",
    plural: "{NAMES} ont trouvé la grosse pièce au fond du canapé alphabétique.",
  },
  {
    singular: "{NAMES} rafle le double gobble. Les cases demandent une pause syndicale.",
    plural: "{NAMES} raflent le double gobble. Les cases demandent une pause syndicale.",
  },
  {
    singular: "{NAMES} a coché les deux cases du grand frisson. Propre, net, sans bavure.",
    plural: "{NAMES} ont coché les deux cases du grand frisson. Propre, net, sans bavure.",
  },
  {
    singular: "{NAMES} a planté le drapeau sur le plus haut sommet de la grille.",
    plural: "{NAMES} ont planté le drapeau sur le plus haut sommet de la grille.",
  },
  {
    singular: "Gobble du plus long mot pour {NAMES}. {LEN} lettres, et pas une de trop.",
    plural: "Gobble du plus long mot pour {NAMES}. {LEN} lettres, et pas une de trop.",
  },
  {
    singular: "{NAMES} a dompté le mot le plus long. Le reste de l'alphabet applaudit en silence.",
    plural: "{NAMES} ont dompté le mot le plus long. Le reste de l'alphabet applaudit en silence.",
  },
  {
    singular: "{NAMES} a trouvé {WORD}. La grille avait pourtant essayé de le ranger très haut.",
    plural: "{NAMES} ont trouvé {WORD}. La grille avait pourtant essayé de le ranger très haut.",
  },
  {
    singular: "{NAMES} décroche le gobble de longueur. Le mètre ruban est formel.",
    plural: "{NAMES} décrochent le gobble de longueur. Le mètre ruban est formel.",
  },
  {
    singular: "{NAMES} a sorti le grand modèle. {LEN} lettres, service compris.",
    plural: "{NAMES} ont sorti le grand modèle. {LEN} lettres, service compris.",
  },
  {
    singular: "{NAMES} a repéré le gratte-ciel lexical de la manche.",
    plural: "{NAMES} ont repéré le gratte-ciel lexical de la manche.",
  },
  {
    singular: "{NAMES} a pris l'ascenseur jusqu'au mot le plus long.",
    plural: "{NAMES} ont pris l'ascenseur jusqu'au mot le plus long.",
  },
  {
    singular: "{NAMES} attrape le gobble du plus long mot. La grille fait mine de rien.",
    plural: "{NAMES} attrapent le gobble du plus long mot. La grille fait mine de rien.",
  },
  {
    singular: "{NAMES} a trouvé le long courrier de la manche: {WORD}.",
    plural: "{NAMES} ont trouvé le long courrier de la manche: {WORD}.",
  },
  {
    singular: "{NAMES} pose {WORD} et récupère le badge grande longueur.",
    plural: "{NAMES} posent {WORD} et récupèrent le badge grande longueur.",
  },
  {
    singular: "{NAMES} a gagné le concours du mot qui prend toute la place.",
    plural: "{NAMES} ont gagné le concours du mot qui prend toute la place.",
  },
  {
    singular: "{NAMES} trouve le gobble de longueur. Les petites trouvailles regardent leurs chaussures.",
    plural: "{NAMES} trouvent le gobble de longueur. Les petites trouvailles regardent leurs chaussures.",
  },
  {
    singular: "{NAMES} a déroulé {LEN} lettres sans casser le fil.",
    plural: "{NAMES} ont déroulé {LEN} lettres sans casser le fil.",
  },
  {
    singular: "{NAMES} a sorti le mot extensible de la soirée.",
    plural: "{NAMES} ont sorti le mot extensible de la soirée.",
  },
  {
    singular: "{NAMES} a trouvé le mot le plus long. La grille prétend que c'était facile.",
    plural: "{NAMES} ont trouvé le mot le plus long. La grille prétend que c'était facile.",
  },
  {
    singular: "{NAMES} remporte le sprint en escalier lexical.",
    plural: "{NAMES} remportent le sprint en escalier lexical.",
  },
  {
    singular: "{NAMES} a mis {WORD} sur la table. Le chronomètre peut rentrer dans sa boîte.",
    plural: "{NAMES} ont mis {WORD} sur la table. Le chronomètre peut rentrer dans sa boîte.",
  },
  {
    singular: "{NAMES} a cueilli le mot perché de la grille.",
    plural: "{NAMES} ont cueilli le mot perché de la grille.",
  },
  {
    singular: "{NAMES} décroche le grand ruban alphabétique.",
    plural: "{NAMES} décrochent le grand ruban alphabétique.",
  },
]);

const MAX_WORD_LENGTH_LINES = Object.freeze([
  "Cette grille cache au moins un mot de {LEN} lettres. Grande échelle conseillée.",
  "Longueur maximale repérée: {LEN} lettres. Les diagonales vont chauffer.",
  "Il y a un mot de {LEN} lettres dans le secteur. Il ne viendra pas tout seul.",
  "Alerte rallonge: la grille monte jusqu'à {LEN} lettres.",
  "Plafond de la manche: {LEN} lettres. Beau morceau à déterrer.",
  "Le plus long suspect fait {LEN} lettres. Il a laissé peu d'indices.",
  "Dossier ouvert: un mot de {LEN} lettres se balade quelque part.",
  "Maximum détecté: {LEN} lettres. Les petites routes ne suffiront peut-être pas.",
  "Cette grille a du coffre, jusqu'à {LEN} lettres.",
  "Un mot de {LEN} lettres est officiellement en cavale.",
]);

function isAmbientBotChatMessage(message) {
  return (
    message?.meta?.kind === "ambient_bot_chat" ||
    String(message?.installId || "").startsWith("ambient-bot:")
  );
}

function resetAmbientChatBotState(room, roundId) {
  if (!room) return;
  room.ambientChatBotState = {
    roundId,
    messagesThisRound: 0,
    lastGlobalAt: 0,
    lastByBot: new Map(),
    flags: new Set(),
  };
}

function getAmbientChatBotState(room) {
  if (!room?.currentRound) return null;
  const roundId = room.currentRound.id;
  const state = room.ambientChatBotState;
  if (state?.roundId === roundId) return state;
  resetAmbientChatBotState(room, roundId);
  return room.ambientChatBotState || null;
}

function pushAmbientChatBotMessage(room, botKey, text, opts = {}) {
  if (!AMBIENT_CHAT_BOTS_ENABLED) return null;
  if (!AMBIENT_CHAT_BOT_ENABLED_KEYS.has(botKey)) return null;
  if (!room || !room.currentRound) return null;
  const bot = AMBIENT_CHAT_BOTS[botKey];
  let trimmed = String(text || "").replace(/\s+/g, " ").trim();
  if (bot?.nick) {
    const nickPrefix = `${bot.nick}:`;
    if (trimmed.toLowerCase().startsWith(nickPrefix.toLowerCase())) {
      trimmed = trimmed.slice(nickPrefix.length).trim();
    }
  }
  if (!bot || !trimmed) return null;
  const state = getAmbientChatBotState(room);
  if (!state) return null;
  const now = Date.now();
  const flag = typeof opts.flag === "string" ? opts.flag.trim() : "";
  if (flag && state.flags.has(flag)) return null;
  if (!opts.force) {
    if (state.messagesThisRound >= AMBIENT_CHAT_BOT_MAX_PER_ROUND) return null;
    if (now - (Number(state.lastGlobalAt) || 0) < AMBIENT_CHAT_BOT_GLOBAL_COOLDOWN_MS) {
      return null;
    }
    const lastBotAt = Number(state.lastByBot.get(botKey)) || 0;
    if (now - lastBotAt < AMBIENT_CHAT_BOT_PER_BOT_COOLDOWN_MS) return null;
  }

  if (flag) state.flags.add(flag);
  state.messagesThisRound += 1;
  state.lastGlobalAt = now;
  state.lastByBot.set(botKey, now);

  const message = {
    id: randomUUID(),
    t: now,
    roomId: room.id,
    nick: bot.nick,
    author: bot.nick,
    installId: `ambient-bot:${bot.category}`,
    text: trimmed.slice(0, CHAT_MESSAGE_TEXT_MAX_LEN),
    isBot: true,
    meta: {
      kind: "ambient_bot_chat",
      category: bot.category,
    },
  };
  pushChatMessage(room, message);
  return message;
}

function scheduleAmbientChatBotMessage(room, botKey, text, opts = {}) {
  if (!AMBIENT_CHAT_BOTS_ENABLED) return;
  if (!AMBIENT_CHAT_BOT_ENABLED_KEYS.has(botKey)) return;
  if (!room?.currentRound) return;
  const roundId = room.currentRound.id;
  const state = getAmbientChatBotState(room);
  const flag = typeof opts.flag === "string" ? opts.flag.trim() : "";
  if (flag) {
    if (state?.flags?.has(flag)) return;
    state?.flags?.add(flag);
  }
  const delayMs = Math.max(0, Math.round(Number(opts.delayMs) || 0));
  const timer = setTimeout(() => {
    if (!room.currentRound || room.currentRound.id !== roundId) return;
    const resolvedText = typeof text === "function" ? text() : text;
    if (!String(resolvedText || "").trim()) return;
    pushAmbientChatBotMessage(room, botKey, resolvedText, { ...opts, flag: "" });
  }, delayMs);
  timer.unref?.();
  room.currentRound.timers?.push(timer);
}

function pickAmbientLine(lines, seed = Date.now()) {
  if (!Array.isArray(lines) || !lines.length) return "";
  const idx = Math.abs(Math.trunc(Number(seed) || 0)) % lines.length;
  return lines[idx] || lines[0] || "";
}

function hashAmbientString(input) {
  const str = String(input ?? "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isAmbientTargetRoundType(value) {
  const type = String(value || "");
  return type === "target_long" || type === "target_score" || type === OCID_TYPE;
}

function isAmbientTargetRound(room, planUsed = null) {
  return (
    isAmbientTargetRoundType(planUsed?.type) ||
    isAmbientTargetRoundType(room?.currentRound?.special?.type)
  );
}

function isAmbientSpeedRoundType(value) {
  return String(value || "") === "speed";
}

function isAmbientSpeedRound(room, planUsed = null) {
  return (
    isAmbientSpeedRoundType(planUsed?.type) ||
    isAmbientSpeedRoundType(room?.currentRound?.special?.type)
  );
}

function formatUtcDateForWikimedia(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getRecentWikimediaDailyRange() {
  const end = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    start: formatUtcDateForWikimedia(start),
    end: formatUtcDateForWikimedia(end),
  };
}

async function fetchWikipediaFrPageviewTrend(title) {
  if (!AMBIENT_TREND_BOT_ENABLED || typeof fetch !== "function") return null;
  const cleanTitle = String(title || "")
    .replace(/\s+/g, "_")
    .trim()
    .slice(0, 90);
  if (!cleanTitle || /[#?/:\\]/.test(cleanTitle)) return null;
  const { start, end } = getRecentWikimediaDailyRange();
  const url =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/fr.wikipedia.org/all-access/user/` +
    `${encodeURIComponent(cleanTitle)}/daily/${start}/${end}`;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), AMBIENT_TREND_BOT_TIMEOUT_MS)
    : null;
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "GobbleBot/1.0 (https://gobble.fr)",
      },
      signal: controller?.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const views = items.map((item) => Number(item?.views) || 0).filter((value) => value >= 0);
    if (views.length < 3) return null;
    const latest = views[views.length - 1] || 0;
    const previous = views.slice(0, -1);
    const avgPrevious =
      previous.reduce((sum, value) => sum + value, 0) / Math.max(1, previous.length);
    return {
      title: cleanTitle.replace(/_/g, " "),
      latest,
      avgPrevious,
    };
  } catch (_) {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildTrendBotLine(word, trend) {
  const latest = Number(trend?.latest) || 0;
  const avg = Number(trend?.avgPrevious) || 0;
  if (latest < 120) return "";
  const display = String(word || trend?.title || "").trim().toUpperCase();
  if (!display) return "";
  if (avg > 0 && latest >= avg * 2.2 && latest - avg >= 90) {
    return `${display} a connu un petit pic de curiosité hier sur Wikipédia FR (${Math.round(latest)} vues).`;
  }
  if (latest >= 1800) {
    return `${display} a été très consulté hier sur Wikipédia FR (${Math.round(latest)} vues).`;
  }
  return "";
}

function maybeScheduleTrendBotForWord(room, word) {
  if (!AMBIENT_TREND_BOT_ENABLED || !room?.currentRound) return;
  const norm = normalizeWord(word);
  if (!norm || norm.length < 5) return;
  if (
    AMBIENT_TREND_BOT_CHANCE <= 0 ||
    hashAmbientString(`${room.currentRound.id}:trend:${norm}`) / 0xffffffff >
      AMBIENT_TREND_BOT_CHANCE
  ) {
    return;
  }
  const state = getAmbientChatBotState(room);
  if (!state || state.flags.has("trend:attempt")) return;
  state.flags.add("trend:attempt");
  const roundId = room.currentRound.id;
  const timer = setTimeout(() => {
    if (!room.currentRound || room.currentRound.id !== roundId) return;
    getDefinition(norm, { timeoutMs: 900, definitionMaxLen: 180 })
      .then(async (definitionPayload) => {
        if (!room.currentRound || room.currentRound.id !== roundId) return;
        const title =
          definitionPayload?.title ||
          definitionPayload?.displayWord ||
          definitionPayload?.word ||
          norm;
        const trend = await fetchWikipediaFrPageviewTrend(title);
        if (!room.currentRound || room.currentRound.id !== roundId) return;
        const line = buildTrendBotLine(title || norm, trend);
        if (!line) return;
        pushAmbientChatBotMessage(room, "trend", line, { flag: "trend:message" });
      })
      .catch(() => {});
  }, 2200 + Math.random() * 1800);
  timer.unref?.();
  room.currentRound.timers?.push(timer);
}

function getRoundSolutionCount(round) {
  const qualityWords = Number(round?.quality?.words);
  if (Number.isFinite(qualityWords) && qualityWords > 0) return Math.round(qualityWords);
  if (Array.isArray(round?.solutions)) return round.solutions.length;
  return 0;
}

function getRoundFoundWordSet(room, results = null) {
  const found = new Set();
  if (Array.isArray(results)) {
    for (const entry of results) {
      const words = Array.isArray(entry?.words) ? entry.words : [];
      words.forEach((word) => {
        const norm = normalizeWord(word);
        if (norm) found.add(norm);
      });
    }
    return found;
  }
  const roundId = room?.currentRound?.id;
  const roundSubs = roundId ? room?.submissions?.get?.(roundId) : null;
  if (!(roundSubs instanceof Map)) return found;
  for (const data of roundSubs.values()) {
    const words = data?.words instanceof Set ? Array.from(data.words) : [];
    words.forEach((word) => {
      const norm = normalizeWord(word);
      if (norm) found.add(norm);
    });
  }
  return found;
}

function getPreparedRoundSolutions(round) {
  return Array.isArray(round?.solutions)
    ? round.solutions
        .map((entry) => {
          const word = normalizeWord(entry?.word || "");
          if (!word) return null;
          return {
            word,
            pts: Number(entry?.pts) || 0,
            path: Array.isArray(entry?.path) ? entry.path : [],
            rareBonusWord: !!entry?.rareBonusWord,
            rarityScore: Number(entry?.rarityScore) || 0,
          };
        })
        .filter(Boolean)
    : [];
}

function getQuadrantLabelForPath(path, gridSize) {
  if (!Array.isArray(path) || !path.length || !(gridSize > 0)) return "";
  const idx = Number(path[0]);
  if (!Number.isInteger(idx) || idx < 0) return "";
  const row = Math.floor(idx / gridSize);
  const col = idx % gridSize;
  const vertical = row < gridSize / 2 ? "haut" : "bas";
  const horizontal = col < gridSize / 2 ? "gauche" : "droite";
  return `${vertical} ${horizontal}`;
}

const NARRATOR_VOWEL_HEAVY_LINES = Object.freeze([
  "Beaucoup de voyelles sur cette grille. Les rallonges devraient etre plus accessibles.",
  "La grille respire cote voyelles. Les terminaisons peuvent rapporter gros.",
  "Les voyelles prennent de la place. Les mots longs auront de quoi s'etirer.",
  "Terrain souple aujourd'hui, les voyelles ouvrent pas mal de portes.",
  "Les voyelles sont genereuses. Cherchez les prolongements avant qu'ils ne filent.",
  "Grille plutot fluide. Les suites de lettres devraient se laisser apprivoiser.",
  "Les voyelles menent la danse. Les mots a rallonge sont peut-etre moins loin qu'ils n'en ont l'air.",
  "Ca chante dans les cases. Les fins de mots peuvent faire grimper le score.",
  "Atmosphere aeree sur la grille. Les grands mots auront un peu plus d'espace.",
  "Les voyelles se montrent. Les joueurs patients devraient pouvoir allonger leurs trouvailles.",
]);

const NARRATOR_CONSONANT_HEAVY_LINES = Object.freeze([
  "Beaucoup de consonnes sur cette grille. Les mots longs seront plus difficiles a construire.",
  "Grille serree en consonnes. Les petits mots bien places peuvent faire la difference.",
  "Les consonnes dominent. Mieux vaut chercher des appuis simples avant les grandes rallonges.",
  "Peu de voyelles disponibles. Les gros mots demanderont plus de patience.",
  "Grille rugueuse aujourd'hui. Les rallonges seront moins evidentes.",
  "Les consonnes se bousculent. Les mots courts peuvent devenir tres rentables.",
  "Terrain dense en consonnes. Les longues trouvailles risquent d'etre plus rares.",
  "Pas beaucoup d'air entre les consonnes. Chaque voyelle compte.",
  "Grille compacte. Les mots longs existent peut-etre, mais il faudra bien les assembler.",
  "Manche nerveuse en consonnes. Les departages peuvent se jouer sur des trouvailles courtes.",
]);

function buildNarratorRoundLine(room) {
  const grid = Array.isArray(room?.currentRound?.grid) ? room.currentRound.grid : [];
  if (!grid.length) return "";
  let vowels = 0;
  let consonants = 0;
  for (const cell of grid) {
    const letter = normalizeLetterKey(cell?.letter || "");
    if (!letter) continue;
    if (/^[aeiouy]/.test(letter)) vowels += 1;
    else consonants += 1;
  }
  const seed = hashAmbientString(`${room?.currentRound?.id || ""}:narrator:${vowels}:${consonants}`);
  if (vowels >= consonants + 3) {
    return pickAmbientLine(NARRATOR_VOWEL_HEAVY_LINES, seed);
  }
  if (consonants >= vowels + 5) {
    return pickAmbientLine(NARRATOR_CONSONANT_HEAVY_LINES, seed);
  }
  return "";
}

const COACH_SUFFIX_MIN_LEN = 4;
const COACH_SUFFIX_MAX_LEN = 9;
const COACH_SUFFIX_BLOCKLIST = new Set([
  "able",
  "ible",
  "ique",
  "ment",
]);

function rankCoachSuffixes(solutions, gridSize = 4) {
  const counts = new Map();
  for (const entry of Array.isArray(solutions) ? solutions : []) {
    const word = normalizeWord(entry?.word || "");
    if (!word || word.length < COACH_SUFFIX_MIN_LEN + 2) continue;
    const maxLen = Math.min(COACH_SUFFIX_MAX_LEN, word.length - 2);
    for (let len = COACH_SUFFIX_MIN_LEN; len <= maxLen; len += 1) {
      const suffix = word.slice(-len);
      if (!/[aeiouy]/.test(suffix)) continue;
      const item = counts.get(suffix) || { suffix, count: 0, words: [] };
      item.count += 1;
      if (item.words.length < 8) item.words.push(word);
      counts.set(suffix, item);
    }
  }

  const minCount = Number(gridSize) >= 5 ? 3 : 2;
  return Array.from(counts.values())
    .filter((item) => {
      if (item.count < minCount) return false;
      if (COACH_SUFFIX_BLOCKLIST.has(item.suffix) && item.count < minCount + 1) return false;
      if (item.suffix.length <= 4 && item.count < minCount + 1) return false;
      return true;
    })
    .map((item) => {
      const len = item.suffix.length;
      const conjugationBoost =
        /(aient|ions|iez|asses|assent|assiez|assions|assiaient|erions|eriez|irions|iriez)$/.test(
          item.suffix
        )
          ? 18
          : 0;
      const score = len * len + item.count * 5 + conjugationBoost;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score || b.suffix.length - a.suffix.length || b.count - a.count);
}

function buildCoachSuffixLine(solutions, gridSize) {
  const best = rankCoachSuffixes(solutions, gridSize)[0];
  if (!best) return "";
  const label = best.count > 1 ? `${best.count} mots possibles` : "plusieurs mots possibles";
  if (best.suffix.length >= 7) {
    return `Je renifle une grosse terminaison: -${best.suffix}. Il y a ${label}, ça vaut le détour.`;
  }
  return `Je conseille de tester la terminaison -${best.suffix}: ${label} semblent s'y accrocher.`;
}

function buildCoachRoundLine(room, planUsed = null) {
  const round = room?.currentRound;
  if (isAmbientTargetRound(room, planUsed) || isAmbientSpeedRound(room, planUsed)) return "";
  const solutions = getPreparedRoundSolutions(round);
  if (!solutions.length) return "";
  const gridSize = Number(room?.config?.gridSize) || 0;
  const suffixLine = buildCoachSuffixLine(solutions, gridSize);
  if (suffixLine) return suffixLine;

  const longByQuadrant = new Map();
  solutions
    .filter((entry) => entry.word.length >= 8)
    .forEach((entry) => {
      const label = getQuadrantLabelForPath(entry.path, gridSize);
      if (!label) return;
      longByQuadrant.set(label, (longByQuadrant.get(label) || 0) + 1);
    });
  const best = Array.from(longByQuadrant.entries()).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 2) {
    return `Indice de coach, sans vendre de mot: plusieurs chemins longs semblent démarrer en zone ${best[0]}.`;
  }
  return "";
}

function buildMaxWordLengthLine(room) {
  const round = room?.currentRound;
  const longest = getPreparedRoundSolutions(round).sort(
    (a, b) => b.word.length - a.word.length || (Number(b.pts) || 0) - (Number(a.pts) || 0)
  )[0];
  const len = Number(longest?.word?.length) || 0;
  if (len < DETECTIVE_MAX_LENGTH_MIN_LEN) return "";
  const line = pickAmbientLine(
    MAX_WORD_LENGTH_LINES,
    hashAmbientString(`${round?.id || ""}:max:${len}`)
  );
  return line.replace("{LEN}", String(len));
}

function scheduleAmbientDetectiveMidRound(room, planUsed = null, roundIntroMs = 0, roundDurationMs = 0) {
  const round = room?.currentRound;
  if (!round || isAmbientTargetRound(room, planUsed) || isAmbientSpeedRound(room, planUsed)) return;
  const solutions = getPreparedRoundSolutions(round);
  if (!solutions.length) return;
  if ((hashAmbientString(`${round.id || ""}:detective:max-word-gate`) % 1000) >= DETECTIVE_MAX_LENGTH_CHANCE * 1000) {
    return;
  }
  const delayMs = Math.max(
    Number(roundIntroMs) + 20_000,
    Number(roundIntroMs) + Math.round(Math.max(30_000, Number(roundDurationMs) || 0) * 0.32)
  );
  scheduleAmbientChatBotMessage(
    room,
    "detective",
    () => buildMaxWordLengthLine(room),
    { delayMs, flag: "detective:max-word-length" }
  );
}

function scheduleAmbientRoundStartBots(room, planUsed, roundIntroMs = 0, roundDurationMs = 0) {
  if (!AMBIENT_CHAT_BOTS_ENABLED || !room?.currentRound) return;
  const round = room.currentRound;
  const delayMs = Math.max(1200, Number(roundIntroMs) + 2200);

  if (isAmbientTargetRound(room, planUsed)) return;

  const coachLine = buildCoachRoundLine(room, planUsed);
  if (coachLine) {
    scheduleAmbientChatBotMessage(room, "coach", coachLine, {
      delayMs,
      flag: "coach:round-start",
    });
  }
}

function maybeScheduleCultureBotForWord(room, word) {
  if (!room?.currentRound) return false;
  const norm = normalizeWord(word);
  if (!norm || norm.length < 5) return false;
  const state = getAmbientChatBotState(room);
  if (!state || state.flags.has("culture:word-fact")) return false;
  const fact = WORD_FACTS_BY_NORMALIZED_WORD[norm];
  if (!fact) return false;
  scheduleAmbientChatBotMessage(room, "culture", fact, {
    delayMs: 1400 + Math.random() * 1800,
    flag: "culture:word-fact",
  });
  return true;
}

function notifyAmbientBotsWordAccepted(room, event = {}) {
  if (!AMBIENT_CHAT_BOTS_ENABLED || !room?.currentRound) return;
  if (event.isBotPlayer) return;
  const len = Number(event.len) || 0;
  const nick = String(event.nick || "Quelqu'un").trim() || "Quelqu'un";
  const specialType = String(event.specialType || "");
  const isTargetRound = isAmbientTargetRoundType(specialType) || isAmbientTargetRound(room);

  if (isTargetRound) return;

  if (len >= 10) {
    const startedAt = Number(room.currentRound?.startsAt) || Date.now();
    const elapsedSec = Math.max(0, (Date.now() - startedAt) / 1000);
    const elapsedLabel = (elapsedSec < 10 ? elapsedSec.toFixed(1) : Math.round(elapsedSec))
      .toString()
      .replace(".", ",");
    scheduleAmbientChatBotMessage(
      room,
      "recordHunter",
      `Premier mot de ${len} lettres trouvé après ${elapsedLabel} secondes.`,
      { delayMs: 900, flag: "record:first-10plus-word" }
    );
  }

  // No word-specific fact during live play: it would reveal a playable word to others.
}

function collectRoundWordHighlights(results) {
  const summary = {
    totalWords: 0,
    bestWord: null,
    longestWord: null,
    rareWord: null,
    foundByWord: new Map(),
    humanPlayers: 0,
  };
  for (const entry of Array.isArray(results) ? results : []) {
    if (entry?.isBot) continue;
    summary.humanPlayers += 1;
    const words = Array.isArray(entry?.words) ? entry.words : [];
    const wordScores = entry?.wordScores && typeof entry.wordScores === "object" ? entry.wordScores : {};
    const wordMeta = entry?.wordMeta && typeof entry.wordMeta === "object" ? entry.wordMeta : {};
    summary.totalWords += words.length;
    for (const rawWord of words) {
      const word = normalizeWord(rawWord);
      if (!word) continue;
      const pts = Number(wordScores[word]) || 0;
      const meta = wordMeta[word] || {};
      const candidate = { word, nick: entry.nick, pts, len: word.length, meta };
      const finders = summary.foundByWord.get(word) || new Set();
      if (entry.nick) finders.add(entry.nick);
      summary.foundByWord.set(word, finders);
      if (!summary.bestWord || candidate.pts > summary.bestWord.pts) {
        summary.bestWord = candidate;
      }
      if (!summary.longestWord || candidate.len > summary.longestWord.len) {
        summary.longestWord = candidate;
      }
      if (!summary.rareWord && meta?.rareBonusWord) {
        summary.rareWord = candidate;
      }
    }
  }
  return summary;
}

async function pickHiddenRemarkableWordWithFact(round, foundWords) {
  const candidates = getPreparedRoundSolutions(round)
    .filter((entry) => entry.word && entry.word.length >= 6 && !foundWords.has(entry.word))
    .map((entry) => ({
      ...entry,
      len: entry.word.length,
      score:
        (entry.rareBonusWord ? 1000 : 0) +
        Math.min(999, Number(entry.rarityScore) || 0) +
        Math.max(0, Number(entry.pts) || 0) * 2 +
        entry.word.length * 12,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 18);
  for (const candidate of candidates) {
    const factDetails = await getOfflineWordFactDetails(candidate.word, { minLen: 6 });
    if (factDetails?.definition && factDetails?.etymology) {
      return { ...candidate, factDetails };
    }
  }
  return null;
}

function buildDetailedHiddenWordFactLine(details) {
  if (!details?.definition || !details?.etymology) return "";
  const word = String(details.displayWord || details.lookupWord || "").trim().toUpperCase();
  if (!word) return "";
  const base = String(details.baseWord || "").trim().toUpperCase();
  const prefix = details.isForm && base && base !== word
    ? `${word}, forme de ${base}`
    : word;
  return `Définition: ${prefix}, ${details.definition}. Étymologie: ${details.etymology}.`;
}

function buildRoundEndCuriosityCandidateWords(highlights) {
  const scored = new Map();
  const add = (word, score) => {
    const norm = normalizeWord(word);
    if (!norm || norm.length < 5) return;
    scored.set(norm, Math.max(Number(scored.get(norm)) || 0, Number(score) || 0));
  };
  add(highlights?.rareWord?.word, 1000);
  add(highlights?.longestWord?.word, 700);
  add(highlights?.bestWord?.word, 650);
  if (highlights?.foundByWord instanceof Map) {
    for (const [word, finders] of highlights.foundByWord.entries()) {
      const finderCount = finders instanceof Set ? finders.size : 0;
      add(word, Math.min(500, normalizeWord(word).length * 28 + finderCount * 12));
    }
  }
  return Array.from(scored.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0], "fr"))
    .map(([word]) => word)
    .slice(0, 28);
}

function buildGrosRobertCandidateWords(room, highlights) {
  const scored = new Map();
  const add = (word, score) => {
    const norm = normalizeWord(word);
    if (!norm || norm.length < 5) return;
    scored.set(norm, Math.max(Number(scored.get(norm)) || 0, Number(score) || 0));
  };

  add(highlights?.rareWord?.word, 1400);
  add(highlights?.longestWord?.word, 1000);
  add(highlights?.bestWord?.word, 900);
  if (highlights?.foundByWord instanceof Map) {
    for (const [word, finders] of highlights.foundByWord.entries()) {
      const finderCount = finders instanceof Set ? finders.size : 0;
      add(word, normalizeWord(word).length * 35 + finderCount * 18 + 250);
    }
  }

  for (const entry of getPreparedRoundSolutions(room?.currentRound)) {
    add(
      entry.word,
      (entry.rareBonusWord ? 850 : 0) +
        Math.min(700, Number(entry.rarityScore) || 0) +
        Math.max(0, Number(entry.pts) || 0) * 2 +
        entry.word.length * 24
    );
  }

  return Array.from(scored.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0], "fr"))
    .map(([word]) => word)
    .slice(0, 60);
}

function shouldScheduleRoundEndWordCuriosity(room) {
  if (AMBIENT_ROUND_END_WORD_CURIOSITY_CHANCE <= 0) return false;
  const roundId = room?.currentRound?.id || "";
  const hash = hashAmbientString(`${room?.id || "room"}:${roundId}:round-end-word-curiosity`);
  return hash / 0xffffffff <= AMBIENT_ROUND_END_WORD_CURIOSITY_CHANCE;
}

function buildInventorFactLine(details) {
  const fact = details?.fact;
  const word = String(details?.displayWord || details?.lookupWord || "").trim().toUpperCase();
  const name = String(fact?.name || "").trim();
  if (!word || !name) return "";
  const text = String(fact?.text || "").replace(/\s+/g, " ").trim();
  if (text) return `Note: ${word}, ${text}.`;
  if (fact.kind === "inventor") return `Note: ${word} porte le nom de ${name}, son inventeur.`;
  return `Note: ${word} est lié au nom de ${name}.`;
}

function buildDoubleDefinitionLine(details) {
  const word = String(details?.displayWord || details?.lookupWord || "").trim().toUpperCase();
  const definitions = Array.isArray(details?.definitions) ? details.definitions : [];
  if (!word || definitions.length < 2) return "";
  const first = definitions[0]?.definition;
  const second = definitions[1]?.definition;
  const third = definitions[2]?.definition;
  if (!first || !second) return "";
  const suffix = third ? ` Troisième détour: ${third}.` : "";
  return `Double sens: ${word} joue sur plusieurs tableaux: 1) ${first} 2) ${second}.${suffix}`;
}

function getGrosRobertTournamentKey(room) {
  return String(room?.currentRound?.tournamentId || room?.tournament?.id || "");
}

function hasGrosRobertSpokenThisTournament(room) {
  const key = getGrosRobertTournamentKey(room);
  return !!key && room?.grosRobertAmbientTournamentId === key && !!room?.grosRobertAmbientSpoken;
}

function markGrosRobertSpokenThisTournament(room) {
  const key = getGrosRobertTournamentKey(room);
  if (!room || !key) return;
  room.grosRobertAmbientTournamentId = key;
  room.grosRobertAmbientSpoken = true;
}

function shouldAttemptGrosRobertRoundEnd(room) {
  if (!AMBIENT_CHAT_BOT_ENABLED_KEYS.has("linguist")) return false;
  if (hasGrosRobertSpokenThisTournament(room)) return false;
  const round = room?.currentRound;
  if (!round || isAmbientTargetRound(room)) return false;
  const tournamentRound = Number(round.tournamentRound) || 0;
  const totalRounds = Number(room?.tournament?.totalRounds) || TOURNAMENT_TOTAL_ROUNDS;
  if (GROSROBERT_FORCE_FINAL_ROUND && tournamentRound >= totalRounds) return true;
  if (GROSROBERT_TOURNAMENT_CHANCE <= 0) return false;
  const hash = hashAmbientString(`${room?.id || "room"}:${round.id || ""}:grosrobert-master`);
  return hash / 0xffffffff <= GROSROBERT_TOURNAMENT_CHANCE;
}

async function pickGrosRobertRoundEndLine(room, highlights) {
  if (!shouldAttemptGrosRobertRoundEnd(room)) return "";
  const words = buildGrosRobertCandidateWords(room, highlights);
  if (!words.length) return "";
  const roundId = room?.currentRound?.id || "";
  const offset = hashAmbientString(`${room?.id || "room"}:${roundId}:grosrobert-offset`) % words.length;
  const orderedWords = [...words.slice(offset), ...words.slice(0, offset)];

  for (const word of orderedWords) {
    const inventorDetails = await getOfflineInventorFactDetails(word, { minLen: 5 });
    const inventorLine = buildInventorFactLine(inventorDetails);
    if (inventorLine) return inventorLine;
  }

  for (const word of orderedWords) {
    const details = await getOfflineWordFactDetails(word, { minLen: 6 });
    const line = buildDetailedHiddenWordFactLine(details);
    if (line) return line;
  }

  return "";
}

async function pickRoundEndWordCuriosity(room, highlights) {
  if (!shouldScheduleRoundEndWordCuriosity(room)) return null;
  const words = buildRoundEndCuriosityCandidateWords(highlights);
  if (!words.length) return null;
  const roundId = room?.currentRound?.id || "";
  const offset = hashAmbientString(`${room?.id || "room"}:${roundId}:curiosity-offset`) % words.length;
  const orderedWords = [...words.slice(offset), ...words.slice(0, offset)];

  for (const word of orderedWords) {
    const details = await getOfflineInventorFactDetails(word, { minLen: 5 });
    const line = buildInventorFactLine(details);
    if (line) return { botKey: "linguist", line, flag: "linguist:inventor-fact" };
  }

  for (const word of orderedWords) {
    const details = await getOfflineDoubleDefinitionDetails(word, { minLen: 5 });
    const line = buildDoubleDefinitionLine(details);
    if (line) return { botKey: "culture", line, flag: "culture:double-definition" };
  }

  return null;
}

function buildStatisticianRoundEndLine(room, highlights, foundWords) {
  const solutions = getPreparedRoundSolutions(room?.currentRound);
  const totalPossible = solutions.length;
  const uniqueFound = foundWords instanceof Set ? foundWords.size : 0;
  const humanPlayers = Number(highlights?.humanPlayers) || 0;
  const lines = [];
  if (totalPossible > 0 && uniqueFound > 0) {
    const pct = Math.round((uniqueFound / totalPossible) * 100);
    lines.push(`Stat de manche: ${uniqueFound}/${totalPossible} mots trouvés collectivement (${pct}%).`);
  }
  if (humanPlayers > 0 && Number(highlights?.totalWords) > 0) {
    const avg = Math.round((Number(highlights.totalWords) / humanPlayers) * 10) / 10;
    const avgLabel = Number.isInteger(avg) ? String(avg) : String(avg).replace(".", ",");
    lines.push(`Moyenne humaine: ${avgLabel} mots par joueur sur cette manche.`);
  }
  const longestPossible = solutions
    .slice()
    .sort((a, b) => b.word.length - a.word.length || (Number(b.pts) || 0) - (Number(a.pts) || 0))[0];
  if (longestPossible?.word && highlights?.longestWord?.word) {
    if (highlights.longestWord.word === longestPossible.word) {
      lines.push(`Le plafond a été atteint: ${longestPossible.word.length} lettres trouvées.`);
    } else if (longestPossible.word.length > highlights.longestWord.len) {
      lines.push(
        `Le plus long mot trouvé fait ${highlights.longestWord.len} lettres, la grille montait à ${longestPossible.word.length}.`
      );
    }
  }
  const picked = pickAmbientLine(
    lines,
    hashAmbientString(`${room?.currentRound?.id || ""}:statatouille:${uniqueFound}:${totalPossible}`)
  );
  return picked || "";
}

function formatAmbientNameList(names) {
  const clean = (Array.isArray(names) ? names : [])
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  if (clean.length === 2) return `${clean[0]} et ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} et ${clean[clean.length - 1]}`;
}

function buildRecordHunterRareGobbleLine(room, results) {
  const flagsByNick =
    room?.currentRound?.gobbleFlags instanceof Map ? room.currentRound.gobbleFlags : new Map();
  if (!flagsByNick.size) return "";
  const humanNicks = (Array.isArray(results) ? results : [])
    .filter((entry) => entry?.nick && !entry?.isBot)
    .map((entry) => String(entry.nick).trim())
    .filter(Boolean);
  if (!humanNicks.length) return "";

  const doubleNicks = humanNicks.filter((nick) => {
    const flags = flagsByNick.get(nick) || {};
    return !!flags.score && !!flags.len;
  });
  const longestNicks = humanNicks.filter((nick) => !!(flagsByNick.get(nick) || {}).len);
  const doubleEligible = doubleNicks.length >= 1 && doubleNicks.length <= 3;
  const longestEligible = longestNicks.length >= 1 && longestNicks.length <= 3;
  if (!doubleEligible && !longestEligible) return "";

  const kind = doubleEligible ? "double" : "longest";
  const names = doubleEligible ? doubleNicks : longestNicks;
  const lines =
    kind === "double"
      ? RECORD_HUNTER_RARE_GOBBLE_LINES.slice(0, 10)
      : RECORD_HUNTER_RARE_GOBBLE_LINES.slice(10);
  if (!lines.length) return "";
  const leaders = computeRoundWordLeaders(room.currentRound, results);
  const word = String(leaders?.longestWord?.word || "").trim().toUpperCase();
  const len =
    Number(leaders?.longestWord?.len) ||
    Number(room?.bestPossibleStats?.maxLen) ||
    0;
  const seed = hashAmbientString(
    `${room?.currentRound?.id || ""}:recordator:${kind}:${names.join("|")}:${word}:${len}`
  );
  const template = pickAmbientLine(lines, seed);
  const text = (names.length === 1 ? template?.singular : template?.plural) || "";
  return text
    .replaceAll("{NAMES}", formatAmbientNameList(names))
    .replaceAll("{WORD}", word || "LE MOT")
    .replaceAll("{LEN}", len ? String(len) : "?")
    .trim();
}

function buildFamilyWordsLine(results) {
  const words = [];
  for (const entry of Array.isArray(results) ? results : []) {
    if (entry?.isBot) continue;
    for (const raw of Array.isArray(entry?.words) ? entry.words : []) {
      const word = normalizeWord(raw);
      if (word && word.length >= 5) words.push(word);
    }
  }
  const byRoot = new Map();
  for (const word of words) {
    const root = word.slice(0, 5);
    const list = byRoot.get(root) || [];
    if (!list.includes(word)) list.push(word);
    byRoot.set(root, list);
  }
  const family = Array.from(byRoot.values())
    .filter((list) => list.length >= 3)
    .sort((a, b) => b.length - a.length)[0];
  if (!family) return "";
  return `${family.slice(0, 4).map((word) => word.toUpperCase()).join(", ")} semblent partager une même famille de formes.`;
}

function isCultureThemeBonusEligibleRound(room, planUsed = null) {
  if (!CULTURE_THEME_BONUS_ENABLED) return false;
  const type = String(planUsed?.type || room?.currentRound?.special?.type || "");
  return type === "normal" && !planUsed?.isSpecial && !room?.currentRound?.special?.isSpecial;
}

function isWikiMamaLightInsightEligibleRound(room, planUsed = null) {
  if (!room?.currentRound) return false;
  const type = String(planUsed?.type || room.currentRound?.special?.type || "normal");
  if (type === "target_long" || type === "target_score" || type === OCID_TYPE) return false;
  return room.currentRound.status === "intro" || room.currentRound.status === "running";
}

function shouldScheduleWikiMamaLightInsight(room, roundId) {
  if (WIKIMAMA_LIGHT_INSIGHT_CHANCE <= 0) return false;
  const hash = hashAmbientString(`${room?.id || "room"}:${roundId}:wikimama-light-insight`);
  return hash / 0xffffffff <= WIKIMAMA_LIGHT_INSIGHT_CHANCE;
}

function pickWikiMamaLightInsightLine(summary, seed = Date.now()) {
  const lines = buildWordInsightChatLines(summary, {
    minDomainCount: 3,
    minOriginCount: 4,
    minFamilyCount: 4,
  }).filter(Boolean);
  if (!lines.length) return "";
  return pickAmbientLine(lines, seed);
}

function scheduleWikiMamaLightInsight(room, summary, planUsed = null) {
  const round = room?.currentRound;
  if (!round || !isWikiMamaLightInsightEligibleRound(room, planUsed)) return false;
  if (round.cultureThemeChallenge) return false;
  if (!shouldScheduleWikiMamaLightInsight(room, round.id)) return false;
  const seed = hashAmbientString(`${room.id}:${round.id}:wikimama-light-line`);
  const line = pickWikiMamaLightInsightLine(summary, seed);
  if (!line) return false;
  const jitterMs = hashAmbientString(`${room.id}:${round.id}:wikimama-light-delay`) % 12000;
  const delayMs = Math.max(0, Number(round.startsAt) + 9000 + jitterMs - Date.now());
  scheduleAmbientChatBotMessage(
    room,
    "culture",
    `Indice: ${line}`,
    { delayMs, flag: "culture:light-insight" }
  );
  return true;
}

function normalizeCultureThemeKey(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function getCultureThemeGenerationOptions(room) {
  const usageCounts = {};
  const source = room?.cultureThemeUsageCounts;
  if (source instanceof Map) {
    for (const [theme, count] of source.entries()) {
      const key = normalizeCultureThemeKey(theme);
      if (key) usageCounts[key] = Math.max(0, Math.trunc(Number(count) || 0));
    }
  }
  return {
    excludedThemes: Array.isArray(room?.cultureThemeRecentThemes)
      ? room.cultureThemeRecentThemes.map((theme) => normalizeCultureThemeKey(theme)).filter(Boolean)
      : [],
    themeUsageCounts: usageCounts,
  };
}

function rememberCultureThemeChallenge(room, challenge) {
  const theme = normalizeCultureThemeKey(challenge?.theme);
  if (!room || !theme) return;
  if (room.currentRound?.cultureThemeRecordedKey === theme) return;
  if (!(room.cultureThemeUsageCounts instanceof Map)) {
    room.cultureThemeUsageCounts = new Map();
  }
  room.cultureThemeUsageCounts.set(theme, (Number(room.cultureThemeUsageCounts.get(theme)) || 0) + 1);
  const previous = Array.isArray(room.cultureThemeRecentThemes) ? room.cultureThemeRecentThemes : [];
  room.cultureThemeRecentThemes = [
    theme,
    ...previous.filter((entry) => normalizeCultureThemeKey(entry) !== theme),
  ].slice(0, CULTURE_THEME_RECENT_LIMIT);
  if (room.currentRound) {
    room.currentRound.cultureThemeRecordedKey = theme;
  }
}

function serializeCultureThemeChallenge(challenge) {
  if (!challenge?.wordSet || !(challenge.wordSet instanceof Set) || !challenge.wordSet.size) {
    return null;
  }
  return {
    theme: String(challenge.theme || ""),
    line: String(challenge.line || ""),
    bonus: Math.max(0, Math.trunc(Number(challenge.bonus) || CULTURE_THEME_BONUS_POINTS)),
    words: Array.from(challenge.wordSet).map((word) => normalizeWord(word)).filter(Boolean),
    requiredCount: Math.max(
      1,
      Math.min(
        challenge.wordSet.size,
        Math.trunc(Number(challenge.requiredCount) || Math.ceil(challenge.wordSet.size * 0.7))
      )
    ),
  };
}

function hydrateCultureThemeChallenge(raw) {
  const words = Array.from(
    new Set(
      (Array.isArray(raw?.words) ? raw.words : [])
        .map((word) => normalizeWord(word))
        .filter(Boolean)
    )
  );
  if (!words.length) return null;
  const requiredCount = Math.max(
    1,
    Math.min(
      words.length,
      Math.trunc(Number(raw?.requiredCount) || Math.ceil(words.length * 0.7))
    )
  );
  return {
    type: String(raw?.type || "lexical_domain"),
    theme: String(raw?.theme || ""),
    line: String(raw?.line || ""),
    count: words.length,
    requiredCount,
    completionRatio: Number(raw?.completionRatio) || 0.7,
    words,
    bonus: CULTURE_THEME_BONUS_POINTS,
    wordSet: new Set(words),
  };
}

function scheduleCultureThemeChallengeStart(room, challenge) {
  const payload = serializeCultureThemeChallenge(challenge);
  if (!payload) return null;
  const delayMs = Math.max(0, Number(room.currentRound?.startsAt) + 1400 - Date.now());
  scheduleAmbientChatBotMessage(
    room,
    "culture",
    `Défi thème: ${challenge.line} Bonus ${CULTURE_THEME_BONUS_POINTS} pts à qui en trouve ${payload.requiredCount}.`,
    { delayMs, flag: "culture:theme-challenge-start", force: true }
  );
  return payload;
}

function maybePrepareCultureThemeChallenge(room, planUsed = null) {
  if (!room?.currentRound) return;
  const cultureBotEnabled = AMBIENT_CHAT_BOT_ENABLED_KEYS.has("culture");
  const canPrepareBonus = cultureBotEnabled && isCultureThemeBonusEligibleRound(room, planUsed);
  const canPrepareLightInsight = cultureBotEnabled && isWikiMamaLightInsightEligibleRound(room, planUsed);
  if (!canPrepareBonus && !canPrepareLightInsight) return;
  if (canPrepareBonus && room.currentRound.cultureThemeChallenge) {
    rememberCultureThemeChallenge(room, room.currentRound.cultureThemeChallenge);
    scheduleCultureThemeChallengeStart(room, room.currentRound.cultureThemeChallenge);
    return;
  }
  const words = getPreparedRoundSolutions(room.currentRound).map((entry) => entry.word).filter(Boolean);
  if (words.length < WIKIMAMA_LIGHT_INSIGHT_MIN_WORDS) return;
  const roundId = room.currentRound.id;
  buildWordInsightSummary(words, { maxLookups: 420 })
    .then((summary) => {
      if (!room.currentRound || room.currentRound.id !== roundId) return;
      if (canPrepareBonus) {
        const challenge = pickWordThemeChallenge(summary, {
          minWords: Math.max(2, Math.trunc(Number(process.env.GOBBLE_CULTURE_THEME_MIN_WORDS) || 10)),
          maxWords: 24,
          completionRatio: 0.7,
          ...getCultureThemeGenerationOptions(room),
          selectionSeed: roundId,
        });
        if (challenge) {
          room.currentRound.cultureThemeChallenge = {
            ...challenge,
            bonus: CULTURE_THEME_BONUS_POINTS,
            wordSet: new Set(challenge.words.map((word) => normalizeWord(word)).filter(Boolean)),
            requiredCount: Math.max(1, Math.trunc(Number(challenge.requiredCount) || 0)),
          };
          rememberCultureThemeChallenge(room, room.currentRound.cultureThemeChallenge);
          const payload = serializeCultureThemeChallenge(room.currentRound.cultureThemeChallenge);
          if (payload) {
            io.to(room.id).emit("cultureThemeChallenge", {
              roomId: room.id,
              roundId,
              challenge: payload,
            });
          }
          scheduleCultureThemeChallengeStart(room, room.currentRound.cultureThemeChallenge);
          return;
        }
      }
      scheduleWikiMamaLightInsight(room, summary, planUsed);
    })
    .catch(() => {});
}

function scheduleCultureThemeChallengeRecap(room, results) {
  const challenge = room?.currentRound?.cultureThemeChallenge;
  if (!challenge?.wordSet || !(challenge.wordSet instanceof Set) || !challenge.wordSet.size) return;
  const words = Array.from(challenge.wordSet).sort((a, b) => a.localeCompare(b, "fr"));
  const winners = (Array.isArray(results) ? results : [])
    .filter((entry) => Number(entry?.cultureThemeBonus?.bonus) > 0)
    .map((entry) => entry.nick)
    .filter(Boolean);
  const winnerText = winners.length
    ? ` Bonus empoché par ${winners.slice(0, 4).join(", ")}${winners.length > 4 ? "..." : ""}.`
    : " Personne n'a raflé le bonus cette fois.";
  scheduleAmbientChatBotMessage(
    room,
    "culture",
    `Récap thème ${String(challenge.theme || "").toUpperCase()}: ${words.map((word) => word.toUpperCase()).join(", ")}.${winnerText}`,
    { delayMs: 7600, flag: "culture:theme-challenge-recap", force: true }
  );
}

async function applyCultureThemeChallengeBonus(room, results) {
  if (!isCultureThemeBonusEligibleRound(room)) return;
  const challenge = room?.currentRound?.cultureThemeChallenge;
  if (!challenge?.wordSet || !(challenge.wordSet instanceof Set) || !challenge.wordSet.size) return;
  const bonus = Math.max(0, Math.trunc(Number(challenge.bonus) || CULTURE_THEME_BONUS_POINTS));
  if (!bonus) return;
  const requiredCount = Math.max(
    1,
    Math.min(
      challenge.wordSet.size,
      Math.trunc(Number(challenge.requiredCount) || Math.ceil(challenge.wordSet.size * 0.7))
    )
  );
  for (const entry of Array.isArray(results) ? results : []) {
    if (!entry || entry.isBot) continue;
    const found = new Set(
      (Array.isArray(entry.uniqueWords) ? entry.uniqueWords : entry.words || [])
        .map((word) => normalizeWord(word))
        .filter(Boolean)
    );
    const missing = Array.from(challenge.wordSet).filter((word) => !found.has(word));
    entry.cultureTheme = {
      theme: challenge.theme || "",
      words: Array.from(challenge.wordSet),
      found: Array.from(challenge.wordSet).filter((word) => found.has(word)),
      missing,
      total: challenge.wordSet.size,
      requiredCount,
    };
    if (!entry.wordMeta || typeof entry.wordMeta !== "object") entry.wordMeta = {};
    for (const word of entry.cultureTheme.found) {
      entry.wordMeta[word] = {
        ...(entry.wordMeta[word] || {}),
        cultureThemeWord: true,
      };
    }
    if (entry.cultureTheme.found.length < requiredCount) continue;
    entry.score = (Number(entry.score) || 0) + bonus;
    entry.cultureThemeBonus = {
      theme: challenge.theme || "",
      bonus,
      words: Array.from(challenge.wordSet),
      requiredCount,
    };
  }
  const winners = results
    .filter((entry) => Number(entry?.cultureThemeBonus?.bonus) > 0)
    .map((entry) => entry.nick)
    .filter(Boolean);
  if (!winners.length) return;
  pushAnnouncement(room, {
    type: "culture_theme_completed",
    nick: winners.length === 1 ? winners[0] : "",
    bonus,
    theme: challenge.theme || "",
    nicks: winners,
    text:
      winners.length === 1
        ? `${winners[0]} valide le bonus WikiMama ${challenge.theme} (+${bonus} pts)`
        : `${winners.length} joueurs valident le bonus WikiMama ${challenge.theme} (+${bonus} pts)`,
  });
}

function scheduleAmbientRoundEndBots(room, results, targetSummary = null) {
  if (!AMBIENT_CHAT_BOTS_ENABLED || !room?.currentRound) return;
  if (isAmbientTargetRound(room) || targetSummary) return;
  const highlights = collectRoundWordHighlights(results);
  const trendWord =
    highlights.rareWord?.word || highlights.longestWord?.word || highlights.bestWord?.word || "";
  if (trendWord) {
    maybeScheduleTrendBotForWord(room, trendWord);
  }

  const roundId = room.currentRound.id;
  pickGrosRobertRoundEndLine(room, highlights)
    .then((line) => {
      if (!room.currentRound || room.currentRound.id !== roundId) return;
      if (!line) return;
      markGrosRobertSpokenThisTournament(room);
      scheduleAmbientChatBotMessage(
        room,
        "linguist",
        line,
        { delayMs: 5600, flag: "linguist:grosrobert-master", force: true }
      );
    })
    .catch(() => {});
}

function getActiveDevBotNicks(room) {
  if (!room) return [];
  const nicks = [];
  for (const player of room.players.values()) {
    if (isBotToken(player?.token) && player?.nick) nicks.push(player.nick);
  }
  if (nicks.length) return nicks;
  return (BOT_ROSTER_4X4 || []).map((bot) => bot?.nick).filter(Boolean).slice(0, 6);
}

function isDevBotChatMessage(message) {
  return (
    message?.meta?.kind === "dev_bot_chat" ||
    message?.meta?.kind === "dev_chat_fill" ||
    String(message?.installId || "").startsWith("dev-bot:")
  );
}

function pushDevBotChatMessage(room, nick, text, opts = {}) {
  if (!room || !nick || !text) return null;
  const replyTo = opts.replyTo ? buildChatReplyPreviewFromMessage(opts.replyTo) : null;
  const message = {
    id: randomUUID(),
    t: Date.now(),
    roomId: room.id,
    nick,
    author: nick,
    installId: `dev-bot:${nick}`,
    text: String(text).trim().slice(0, CHAT_MESSAGE_TEXT_MAX_LEN),
    isBot: true,
    meta: { kind: opts.kind || "dev_bot_chat" },
  };
  if (replyTo) message.replyTo = replyTo;
  pushChatMessage(room, message);
  return message;
}

function pickDevBotNick(room, seed = Date.now()) {
  const nicks = getActiveDevBotNicks(room);
  if (!nicks.length) return "";
  return nicks[Math.abs(Math.trunc(seed)) % nicks.length] || nicks[0] || "";
}

function addDevBotReaction(room, message, seed = Date.now()) {
  if (!room || !message?.id) return;
  const nick = pickDevBotNick(room, seed);
  if (!nick) return;
  const emojis = Array.from(CHAT_REACTION_ALLOWED_EMOJIS);
  const emoji = emojis[Math.abs(Math.trunc(seed)) % emojis.length] || "👍";
  const result = updateChatMessageReactions(room, {
    messageId: message.id,
    emoji,
    installId: `dev-bot:${nick}`,
    nick,
  });
  if (!result.ok) return;
  emitChatSocketEvent(io, room.id, "chat:message_reaction", {
    roomId: room.id,
    messageId: message.id,
    reactions: result.reactions,
    updatedAt: result.message?.reactionsUpdatedAt || Date.now(),
  });
}

function scheduleDevBotResponseForChat(room, message) {
  if (!room || !message || isSystemChatEntry(message) || isDevBotChatMessage(message)) return;
  if (message?.isBot || isAmbientBotChatMessage(message)) return;
  if (isBotNick(room, message.nick)) return;
  const now = Date.now();
  if (isDevControlsActive("botReactions")) {
    setTimeout(() => addDevBotReaction(room, message, now), 450 + Math.random() * 700);
  }
  if (!isDevControlsActive("botChat")) return;
  const last = Number(room.devLastBotChatAt) || 0;
  if (now - last < 12000) return;
  room.devLastBotChatAt = now;
  const replies = [
    "Je teste le chat, bien recu.",
    "Reaction cote bot OK.",
    "Je garde le rythme sans spam.",
    "Message vu pour le test tactile.",
  ];
  const nick = pickDevBotNick(room, now + 7);
  if (!nick) return;
  const text = replies[Math.floor(Math.random() * replies.length)] || replies[0];
  setTimeout(
    () => pushDevBotChatMessage(room, nick, text, { replyTo: message }),
    900 + Math.random() * 1200
  );
}

function scheduleDevSpecialRoundChat(room, roundId, plan, introMs, durationMs) {
  if (!isDevControlsActive("botChat") || !room || !plan?.isSpecial) return;
  const label = plan.label || "manche speciale";
  const lines = [
    `Test bot: ${label}, chat actif.`,
    "Je surveille la manche speciale.",
    "Dernier ping bot pour cette manche.",
  ];
  const offsets = [
    Math.max(900, introMs + 1500),
    Math.max(2500, introMs + Math.round(durationMs * 0.35)),
    Math.max(4000, introMs + Math.round(durationMs * 0.7)),
  ];
  offsets.forEach((offset, idx) => {
    const timer = setTimeout(() => {
      if (!room.currentRound || room.currentRound.id !== roundId) return;
      const nick = pickDevBotNick(room, roundId + idx);
      if (!nick) return;
      pushDevBotChatMessage(room, nick, lines[idx] || lines[0]);
    }, Math.max(0, offset));
    room.currentRound?.timers?.push(timer);
  });
}

function fillDevChat(room, count = 80) {
  if (!room) return 0;
  const nicks = getActiveDevBotNicks(room);
  if (!nicks.length) return 0;
  const templates = [
    "Message de remplissage pour tester le scroll.",
    "Ligne test avec un texte un peu plus long pour la largeur.",
    "Reaction et hauteur de bulle a verifier.",
    "Test tactile chat.",
    "Encore une ligne de charge visuelle.",
  ];
  const total = Math.max(1, Math.min(180, Math.trunc(Number(count) || 80)));
  for (let i = 0; i < total; i += 1) {
    const nick = nicks[i % nicks.length];
    pushDevBotChatMessage(room, nick, `${templates[i % templates.length]} #${i + 1}`, {
      kind: "dev_chat_fill",
    });
  }
  return total;
}

function clearDevChat(room) {
  if (!room || !Array.isArray(room.chatMessages)) return 0;
  const removedMessages = room.chatMessages.filter((message) => isDevBotChatMessage(message));
  const before = room.chatMessages.length;
  room.chatMessages = room.chatMessages.filter((message) => !isDevBotChatMessage(message));
  const removed = before - room.chatMessages.length;
  if (removed > 0) {
    removedMessages.forEach((message) => {
      if (!message?.id) return;
      emitChatSocketEvent(io, room.id, "chat:message_delete", {
        roomId: room.id,
        messageId: message.id,
        deletedAt: Date.now(),
      });
    });
  }
  return removed;
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
  const roundGobbles =
    room.currentRound.gobbles instanceof Map ? room.currentRound.gobbles : new Map();
  const ranking = [];
  for (const [nick, data] of roundSubs.entries()) {
    const lookup = findPlayerByNick(room, nick);
    ranking.push({
      nick,
      userId: Number.isInteger(Number(lookup?.player?.userId)) ? Number(lookup.player.userId) : null,
      score: data.score || 0,
      gobbles: Number(roundGobbles.get(nick)) || 0,
      team: getTeamForInstallCached(lookup?.player?.installId),
      isDailyChampion: isDailyChampionInstallId(lookup?.player?.installId),
      weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForInstallId(lookup?.player?.installId, nick),
      isWeeklyVocabChampion: isWeeklyVocabChampionInstallId(lookup?.player?.installId, nick),
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
  if (plan?.type === FINALE_TYPE) {
    return {
      type: FINALE_TYPE,
      tileBonusMultiplier:
        Number(plan?.tileBonusMultiplier) || FINALE_TILE_BONUS_MULTIPLIER,
    };
  }
  if (plan?.type === "bonus_letter" && plan?.bonusLetter) {
    return {
      bonusLetter: plan.bonusLetter,
      bonusLetterScore: plan.bonusLetterScore || BONUS_LETTER_SCORE,
      disableBonuses: true,
    };
  }
  if (plan?.type === MASSIVE_BOGGLE_TYPE) {
    return {
      classicBoggleScoring: true,
      minWordLength: plan?.minWordLength || 3,
      disableBonuses: true,
    };
  }
  if (plan?.type === FAKE_TWINS_TYPE) {
    return {
      type: FAKE_TWINS_TYPE,
      minWordLength: plan?.minWordLength || FAKE_TWINS_MIN_WORD_LENGTH,
      disableBonuses: true,
    };
  }
  return null;
}

function getSpecialScoreConfig(round) {
  return getSpecialScoreConfigFromPlan(round?.special);
}

function getLiveHeadToHeadRoundType(round) {
  const specialType = round?.special?.type || "";
  if (specialType === "target_long" || specialType === "target_score" || specialType === OCID_TYPE) {
    return "target";
  }
  if (specialType === SELF_SPECIAL_3_WORDS_TYPE) return "special3";
  if (specialType === "bonus_letter") return "bonusLetter";
  if (specialType === MASSIVE_BOGGLE_TYPE) return "massiveBoggle";
  if (specialType === FAKE_TWINS_TYPE) return "fakeTwins";
  return "normal";
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

function sanitizeOcidProposalWord(rawWord) {
  const display = String(rawWord || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
  const normalized = normalizeWord(display);
  if (!display || !normalized) return null;
  if (normalized.length < 2 || normalized.length > 24) return null;
  return { display, normalized };
}

function shuffleOcidOptions(options) {
  const out = Array.isArray(options) ? [...options] : [];
  for (let idx = out.length - 1; idx > 0; idx -= 1) {
    const swapIdx = Math.floor(Math.random() * (idx + 1));
    [out[idx], out[swapIdx]] = [out[swapIdx], out[idx]];
  }
  return out;
}

function buildOcidVoteOptions(room) {
  const round = room?.currentRound;
  if (!round || round.special?.type !== OCID_TYPE) return [];
  if (Array.isArray(round.ocidOptions) && round.ocidOptions.length) return round.ocidOptions;
  const targetNorm = normalizeWord(round.targetWord || "");
  const byNorm = new Map();
  const targetDisplay = String(round.targetWord || "").trim().toUpperCase();
  if (targetNorm) {
    byNorm.set(targetNorm, {
      id: `ocid-target-${targetNorm}`,
      word: targetNorm,
      display: targetDisplay || targetNorm.toUpperCase(),
      isTarget: true,
      authors: [],
      hasBotAuthor: false,
      hasHumanAuthor: false,
    });
  }
  const proposals =
    round.ocidProposals instanceof Map ? Array.from(round.ocidProposals.entries()) : [];
  for (const [nick, proposal] of proposals) {
    const normalized = normalizeWord(proposal?.normalized || proposal?.display || "");
    if (!normalized || normalized === targetNorm) continue;
    const existing = byNorm.get(normalized) || {
      id: `ocid-${normalized}`,
      word: normalized,
      display: (String(proposal?.display || normalized).trim() || normalized).toUpperCase(),
      isTarget: false,
      authors: [],
      hasBotAuthor: false,
      hasHumanAuthor: false,
    };
    if (!existing.authors.includes(nick)) existing.authors.push(nick);
    if (isBotNick(room, nick)) existing.hasBotAuthor = true;
    else existing.hasHumanAuthor = true;
    byNorm.set(normalized, existing);
  }
  const options = shuffleOcidOptions(Array.from(byNorm.values())).map((option, idx) => ({
    ...option,
    id: `ocid-option-${idx}-${option.word}`,
    botOnly: !option.isTarget && option.hasBotAuthor && !option.hasHumanAuthor,
  }));
  round.ocidOptions = options;
  return options;
}

function buildPublicOcidVotePayload(room) {
  const round = room?.currentRound;
  if (!round || round.special?.type !== OCID_TYPE) return null;
  const options = buildOcidVoteOptions(room);
  const voteCounts = new Map();
  if (round.ocidVotes instanceof Map) {
    for (const optionId of round.ocidVotes.values()) {
      voteCounts.set(optionId, (voteCounts.get(optionId) || 0) + 1);
    }
  }
  return {
    roomId: room.id,
    roundId: round.id,
    voteEndsAt: round.ocidVoteEndsAt || round.endsAt || null,
    definition: round.special?.ocidDefinition || "",
    optionCount: options.length,
    options: options.map((option) => ({
      id: option.id,
      display: option.display,
      botOnly: !!option.botOnly,
      voteCount: Number(voteCounts.get(option.id)) || 0,
    })),
  };
}

function clearOcidProposalForNick(room, { roundId, nick }) {
  const round = room?.currentRound;
  if (!room || !round || round.id !== roundId || round.special?.type !== OCID_TYPE) {
    return { ok: false, error: "invalid_round" };
  }
  if (round.status !== "running") {
    return { ok: false, error: "proposal_closed" };
  }
  if (!(round.ocidProposals instanceof Map)) round.ocidProposals = new Map();
  round.ocidProposals.delete(nick);
  return { ok: true };
}

function submitOcidProposalForNick(room, { roundId, nick, word, path = [] }) {
  const round = room?.currentRound;
  if (!room || !round || round.id !== roundId || round.special?.type !== OCID_TYPE) {
    return { ok: false, error: "invalid_round" };
  }
  if (round.status !== "running") {
    return { ok: false, error: "proposal_closed" };
  }
  const player = Array.from(room.players.values()).find((entry) => entry?.nick === nick);
  if (!player) {
    return { ok: false, error: "not_logged_in" };
  }
  const proposal = sanitizeOcidProposalWord(word);
  if (!proposal) {
    if (round.ocidProposals instanceof Map) round.ocidProposals.delete(nick);
    return { ok: false, error: "invalid_word" };
  }
  const submittedPath = Array.isArray(path)
    ? path.map((idx) => Number(idx)).filter((idx) => Number.isInteger(idx) && idx >= 0)
    : [];
  let scored =
    submittedPath.length === path?.length
      ? scoreWordOnGridWithPath(proposal.normalized, round.grid, submittedPath, null)
      : null;
  if (!scored?.path) {
    const fallbackPath = findBestPathForWord(round.grid, proposal.normalized, null);
    scored = Array.isArray(fallbackPath)
      ? scoreWordOnGridWithPath(proposal.normalized, round.grid, fallbackPath, null)
      : null;
  }
  if (!scored?.path) {
    if (round.ocidProposals instanceof Map) round.ocidProposals.delete(nick);
    return { ok: false, error: "not_traceable" };
  }
  if (!(round.ocidProposals instanceof Map)) round.ocidProposals = new Map();
  round.ocidProposals.set(nick, {
    ...proposal,
    display: String(proposal.display || proposal.normalized || "").toUpperCase(),
    path: scored.path,
    submittedAt: Date.now(),
  });
  return { ok: true, proposal: proposal.display, active: true };
}

function submitOcidVoteForNick(room, { roundId, nick, optionId }) {
  const round = room?.currentRound;
  if (!room || !round || round.id !== roundId || round.special?.type !== OCID_TYPE) {
    return { ok: false, error: "invalid_round" };
  }
  if (round.status !== "ocid_vote") {
    return { ok: false, error: "vote_closed" };
  }
  const player = Array.from(room.players.values()).find((entry) => entry?.nick === nick);
  if (!player) {
    return { ok: false, error: "not_logged_in" };
  }
  const selectedOptionId = String(optionId || "");
  const options = buildOcidVoteOptions(room);
  const selectedOption = options.find((option) => option.id === selectedOptionId);
  if (!selectedOption) {
    return { ok: false, error: "invalid_option" };
  }
  if (!(round.ocidVotes instanceof Map)) round.ocidVotes = new Map();
  round.ocidVotes.set(nick, selectedOptionId);
  try {
    io.to(room.id).emit("ocidVoteUpdated", buildPublicOcidVotePayload(room));
  } catch (_) {}
  return { ok: true, optionId: selectedOptionId };
}

function computeOcidRoundResults(room, baseResults) {
  const round = room?.currentRound;
  if (!round || round.special?.type !== OCID_TYPE) return null;
  const options = buildOcidVoteOptions(room);
  const targetNorm = normalizeWord(round.targetWord || "");
  const proposalStartedAt =
    Number.isFinite(round.startsAt)
      ? round.startsAt
      : (Number(round.endsAt) || Date.now()) - (Number(round.durationMs) || OCID_PROPOSAL_DURATION_MS);
  const optionsById = new Map(options.map((option) => [option.id, option]));
  const proposals = round.ocidProposals instanceof Map ? round.ocidProposals : new Map();
  const votes = round.ocidVotes instanceof Map ? round.ocidVotes : new Map();
  const scores = new Map();
  const details = new Map();
  const ocidTargetFoundAt = new Map();
  const ensure = (nick) => {
    if (!scores.has(nick)) scores.set(nick, 0);
    if (!details.has(nick)) {
      details.set(nick, {
        exactTarget: false,
        validProposal: false,
        correctVote: false,
        bluffVotes: 0,
        exactTargetPoints: 0,
        validProposalPoints: 0,
        correctVotePoints: 0,
        bluffVotePoints: 0,
        votersForProposal: [],
        proposal: proposals.get(nick)?.display || "",
        vote: "",
        targetFoundAt: null,
        targetFoundMs: null,
      });
    }
    return details.get(nick);
  };

  for (const [nick, proposal] of proposals.entries()) {
    const normalized = normalizeWord(proposal?.normalized || proposal?.display || "");
    const detail = ensure(nick);
    if (normalized && normalized === targetNorm) {
      const submittedAt = Number(proposal?.submittedAt) || Date.now();
      const elapsedMs = Math.max(0, submittedAt - proposalStartedAt);
      scores.set(nick, (scores.get(nick) || 0) + OCID_EXACT_TARGET_POINTS);
      detail.exactTarget = true;
      detail.exactTargetPoints += OCID_EXACT_TARGET_POINTS;
      detail.targetFoundAt = submittedAt;
      detail.targetFoundMs = elapsedMs;
      ocidTargetFoundAt.set(nick, submittedAt);
    } else if (normalized && dictionary?.has?.(normalized)) {
      scores.set(nick, (scores.get(nick) || 0) + OCID_VALID_PROPOSAL_POINTS);
      detail.validProposal = true;
      detail.validProposalPoints += OCID_VALID_PROPOSAL_POINTS;
    }
  }
  round.targetFoundAt = ocidTargetFoundAt;

  for (const [nick, optionId] of votes.entries()) {
    const option = optionsById.get(optionId);
    if (!option) continue;
    const detail = ensure(nick);
    detail.vote = option.display || "";
    if (option.isTarget) {
      scores.set(nick, (scores.get(nick) || 0) + OCID_CORRECT_VOTE_POINTS);
      detail.correctVote = true;
      detail.correctVotePoints += OCID_CORRECT_VOTE_POINTS;
      continue;
    }
    for (const author of option.authors || []) {
      if (!author || author === nick) continue;
      const authorDetail = ensure(author);
      authorDetail.bluffVotes += 1;
      if (!authorDetail.votersForProposal.includes(nick)) {
        authorDetail.votersForProposal.push(nick);
      }
      scores.set(author, (scores.get(author) || 0) + OCID_BLUFF_VOTE_POINTS);
      authorDetail.bluffVotePoints += OCID_BLUFF_VOTE_POINTS;
    }
  }

  const byNick = new Map((Array.isArray(baseResults) ? baseResults : []).map((entry) => [entry.nick, entry]));
  const roundSubs = room?.submissions?.get?.(round.id) || new Map();
  for (const player of room.players.values()) {
    const connected = isPlayerConnected(player) || isBotToken(player?.token);
    const hasOcidActivity = proposals.has(player.nick) || votes.has(player.nick);
    const roundEligible = roundSubs.has(player.nick);
    if (!roundEligible && !hasOcidActivity) continue;
    if (!connected && !hasOcidActivity) continue;
    if (!byNick.has(player.nick)) {
      byNick.set(player.nick, {
        nick: player.nick,
        words: [],
        wordMeta: {},
        uniqueWords: [],
        newVocabWords: [],
        userId: Number.isInteger(Number(player?.userId)) ? Number(player.userId) : null,
        installId: player?.installId || null,
        team: getTeamForInstallCached(player?.installId),
        isBot: isBotNick(room, player.nick),
        isDailyChampion: isDailyChampionPlayer(player),
        weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForPlayer(player),
        isWeeklyVocabChampion: isWeeklyVocabChampionPlayer(player),
        connected,
        roundEligible,
      });
    } else if (roundEligible) {
      byNick.set(player.nick, { ...byNick.get(player.nick), roundEligible: true });
    }
  }
  const results = Array.from(byNick.values()).map((entry) => {
    const score = Number(scores.get(entry.nick)) || 0;
    const detail = ensure(entry.nick);
    return {
      ...entry,
      score,
      words: detail.exactTarget ? [round.targetWord || ""] : entry.words,
      targetFoundAt: Number.isFinite(detail.targetFoundAt) ? detail.targetFoundAt : null,
      targetFoundMs: Number.isFinite(detail.targetFoundMs) ? detail.targetFoundMs : null,
      participated: !!(detail.proposal || detail.vote || score > 0),
      ocid: detail,
    };
  });
  results.sort(compareOcidRoundResultEntries);
  return {
    results,
    summary: {
      type: OCID_TYPE,
      word: round.targetWord || "",
      definition: round.special?.ocidDefinition || "",
      definitionSource: round.special?.ocidDefinitionSource || "",
      definitionUrl: round.special?.ocidDefinitionUrl || "",
      scoring: {
        exactTarget: OCID_EXACT_TARGET_POINTS,
        correctVote: OCID_CORRECT_VOTE_POINTS,
        validProposal: OCID_VALID_PROPOSAL_POINTS,
        bluffVote: OCID_BLUFF_VOTE_POINTS,
      },
      options: options.map((option) => ({
        display: option.display,
        isTarget: !!option.isTarget,
        authors: Array.isArray(option.authors) ? option.authors : [],
        voters: Array.from(votes.entries())
          .filter(([, value]) => value === option.id)
          .map(([nick]) => nick),
        voteCount: Array.from(votes.values()).filter((value) => value === option.id).length,
      })),
    },
  };
}

function compareOcidRoundResultEntries(a, b) {
  const diff = (Number(b?.score) || 0) - (Number(a?.score) || 0);
  if (diff !== 0) return diff;
  const aFound = Number.isFinite(a?.targetFoundAt);
  const bFound = Number.isFinite(b?.targetFoundAt);
  if (aFound && bFound) {
    const timeDiff = Number(a.targetFoundAt) - Number(b.targetFoundAt);
    if (timeDiff !== 0) return timeDiff;
  } else if (aFound) {
    return -1;
  } else if (bFound) {
    return 1;
  }
  return String(a?.nick || "").localeCompare(String(b?.nick || ""), "fr", {
    sensitivity: "base",
  });
}

function getOcidTournamentTieKey(entry) {
  const score = Number(entry?.score) || 0;
  const foundAt = entry?.targetFoundAt;
  return Number.isFinite(foundAt) ? `${score}:target:${foundAt}` : `${score}:no-target`;
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

function getTargetHiddenLetterCount(word, revealed) {
  if (!word || typeof word !== "string") return 0;
  const expanded = expandTargetRevealed(word, revealed);
  return Math.max(0, word.length - expanded.size);
}

function getTargetHiddenLetterCountAfterReveal(word, expanded, group) {
  const next = new Set(expanded || []);
  if (Array.isArray(group)) {
    group.forEach((idx) => next.add(idx));
  }
  return getTargetHiddenLetterCount(word, next);
}

function pickTargetRevealGroup(word, revealed, options = {}) {
  if (!word || typeof word !== "string") return null;
  const chars = word.split("");
  const expanded = expandTargetRevealed(word, revealed);
  const minHiddenAfter = Math.max(
    0,
    Math.trunc(Number(options?.minHiddenAfter) || 0)
  );
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
  if (minHiddenAfter <= 0) {
    return groups[Math.floor(Math.random() * groups.length)];
  }
  const viableGroups = groups
    .map((group) => ({
      group,
      hiddenAfter: getTargetHiddenLetterCountAfterReveal(word, expanded, group),
    }))
    .filter((entry) => entry.hiddenAfter >= minHiddenAfter);
  if (!viableGroups.length) return null;
  const exactGroups = viableGroups.filter(
    (entry) => entry.hiddenAfter === minHiddenAfter
  );
  const pool = exactGroups.length ? exactGroups : viableGroups;
  return pool[Math.floor(Math.random() * pool.length)].group;
}

function buildEvenTargetHintScheduleMs({ count, firstMs, lastMs, latestAllowed }) {
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (safeCount <= 0) return [];
  const safeLatest = Math.max(1000, Math.trunc(Number(latestAllowed) || 1000));
  const start = Math.max(0, Math.min(safeLatest, Math.trunc(Number(firstMs) || 0)));
  const end = Math.max(
    start,
    Math.min(safeLatest, Math.trunc(Number(lastMs) || safeLatest))
  );
  if (safeCount === 1) return [start];
  const timings = [];
  let prev = -1;
  for (let i = 0; i < safeCount; i += 1) {
    const ratio = i / (safeCount - 1);
    let ms = Math.round(start + (end - start) * ratio);
    if (ms <= prev) ms = prev + 1;
    if (ms > safeLatest) break;
    timings.push(ms);
    prev = ms;
  }
  return timings;
}

function getTargetHintScheduleMs({
  targetWord = "",
  targetLength = null,
  roundDurationMs = 90 * 1000,
  roundType = "target_long",
} = {}) {
  const wordLength = typeof targetWord === "string" ? targetWord.length : 0;
  const configuredLength =
    Number.isFinite(targetLength) && targetLength > 0 ? Number(targetLength) : 0;
  const rawLength = Math.max(configuredLength, wordLength);
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
  if (!isTargetScoreRound) {
    const desiredHintCount = Math.max(0, safeLength - 1);
    if (desiredHintCount > timings.length) {
      const firstMs = timings.length ? timings[0] : 9000;
      const lastMs = timings.length
        ? timings[timings.length - 1]
        : Math.max(firstMs, latestAllowed - 4000);
      return buildEvenTargetHintScheduleMs({
        count: desiredHintCount,
        firstMs,
        lastMs,
        latestAllowed,
      });
    }
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

function maybeAnnounceCloseFight(room) {
  if (!room?.currentRound || room.closeFightAnnounced) return;
  const ranking = getFullRanking(room);
  if (ranking.length < 2) return;
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

function announceMaintenanceModeEnabled() {
  const text = "Attention mise a jour a la fin de ce mini tournoi.";
  for (const room of rooms.values()) {
    pushAnnouncement(room, { type: "maintenance_mode", text });
    pushSystemChatMessage(room, text, { meta: { kind: "maintenance_mode" } });
  }
}

function applyMaintenanceModeChange(previousControls, nextControls) {
  const wasEnabled = !!previousControls?.maintenanceMode;
  const isEnabled = !!nextControls?.maintenanceMode;
  if (wasEnabled === isEnabled) return;
  if (isEnabled) {
    announceMaintenanceModeEnabled();
  }
  for (const room of rooms.values()) {
    if (isEnabled) {
      resetTournamentLobby(room);
    }
    emitTournamentLobby(room);
    emitPlayers(room);
  }
  emitRoomsStats();
}

function processDuelWordUpdates(room, roundRef, roundId, payload, duelWord) {
  const updates = Array.isArray(duelWord?.updates) ? duelWord.updates : [];
  const teamPoints = getObjectiveTeamPointsFromUpdates(updates);
  if (teamPoints > 0 && roundRef && roundRef.id === roundId) {
    if (!(roundRef.duelObjectivePointsByNick instanceof Map)) {
      roundRef.duelObjectivePointsByNick = new Map();
    }
    roundRef.duelObjectivePointsByNick.set(
      payload.nick,
      (Number(roundRef.duelObjectivePointsByNick.get(payload.nick)) || 0) + teamPoints
    );
  }
  updates
    .filter((entry) => entry?.newlyValidated)
    .forEach((entry) => {
      const points = Number(entry?.teamPointsAwarded) || Number(entry?.points) || 0;
      pushAnnouncement(room, {
        type: "objective_validated",
        nick: payload.nick,
        objectiveId: entry?.id || "",
        objectiveTitle: entry?.title || "Objectif",
        objectiveBucket: entry?.bucket || "",
        objectiveProgress: Number(entry?.progress) || 0,
        objectiveTarget: Number(entry?.target) || 0,
        teamPoints: points,
        text: `✅ ${payload.nick} a validé "${entry?.title || "Objectif"}" (+${points} équipe)`,
      });
    });
}

function flushDuelWordAcceptedQueue(room, roundRef, installId) {
  const queues = roundRef?.duelWordAcceptedQueues;
  const queue = queues instanceof Map ? queues.get(installId) : null;
  if (!queue) return Promise.resolve();
  if (queue.processing) return queue.promise || Promise.resolve();
  queue.processing = true;
  if (queue.timer) {
    clearTimeout(queue.timer);
    queue.timer = null;
  }
  queues.delete(installId);

  const task = (async () => {
    try {
      const startedAt = Date.now();
      const events = Array.isArray(queue.events) ? queue.events.splice(0) : [];
      for (const event of events) {
        try {
          const duelWord = await recordMainWordAccepted({
            installId: event.installId,
            nick: event.nick,
            dateId: event.dateId,
            roundSpecialType: event.roundSpecialType,
            wordLength: event.wordLength,
            wordPoints: event.wordPoints,
            usedBonusTile: event.usedBonusTile,
            usedRareLetter: event.usedRareLetter,
          });
          processDuelWordUpdates(room, roundRef, event.roundId, event, duelWord);
        } catch (err) {
          console.warn(`[${room?.id || "room"}] duel word update failed`, err?.message || err);
        }
      }
      scheduleInstallDuelCacheRefresh(installId);
      const elapsed = Date.now() - startedAt;
      if (elapsed > 120) {
        console.warn(
          `[perf:${room?.id || "room"}] duel word flush ${elapsed}ms events=${events.length} install=${installId}`
        );
      }
    } catch (err) {
      console.warn(`[${room?.id || "room"}] duel word flush failed`, err?.message || err);
    }
  })().finally(() => {
    if (roundRef?.duelWordTasks instanceof Set && queue.promise) {
      roundRef.duelWordTasks.delete(queue.promise);
    }
    queue.resolve?.();
  });
  queue.task = task;
  return queue.promise || task;
}

function flushPendingDuelWordAcceptedQueues(roundRef, room) {
  const queues = roundRef?.duelWordAcceptedQueues;
  if (!(queues instanceof Map) || queues.size === 0) return [];
  return Array.from(queues.keys()).map((installId) =>
    flushDuelWordAcceptedQueue(room, roundRef, installId)
  );
}

async function waitForDuelWordTasksBeforeResults(room, tasks) {
  const pendingTasks = Array.isArray(tasks) ? tasks.filter(Boolean) : [];
  if (!pendingTasks.length) return;
  let timeoutId = null;
  const startedAt = Date.now();
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve("timeout"), DUEL_WORD_END_ROUND_WAIT_MS);
    timeoutId.unref?.();
  });
  const settled = Promise.allSettled(pendingTasks).then(() => "settled");
  const result = await Promise.race([settled, timeout]);
  if (timeoutId) clearTimeout(timeoutId);
  if (result === "timeout") {
    console.warn(
      `[perf:${room?.id || "room"}] duel word endRound wait timed out after ${
        Date.now() - startedAt
      }ms tasks=${pendingTasks.length}`
    );
  }
}

function enqueueDuelWordAccepted(room, payload) {
  const roundRef = room?.currentRound;
  const installId = normalizeInstallId(payload?.installId);
  if (!room || !roundRef || !installId || !shouldPersistRoundProgress(roundRef)) return;
  if (!(roundRef.duelWordAcceptedQueues instanceof Map)) {
    roundRef.duelWordAcceptedQueues = new Map();
  }
  let queue = roundRef.duelWordAcceptedQueues.get(installId);
  if (!queue) {
    queue = { events: [], timer: null, promise: null, resolve: null, processing: false };
    queue.promise = new Promise((resolve) => {
      queue.resolve = resolve;
    });
    roundRef.duelWordAcceptedQueues.set(installId, queue);
    if (!(roundRef.duelWordTasks instanceof Set)) {
      roundRef.duelWordTasks = new Set();
    }
    roundRef.duelWordTasks.add(queue.promise);
  }
  queue.events.push({ ...payload, installId });
  bumpRoomPerfCounter(room, "duelWordQueued");
  if (queue.timer) clearTimeout(queue.timer);
  queue.timer = setTimeout(
    () => flushDuelWordAcceptedQueue(room, roundRef, installId),
    DUEL_WORD_ACCEPTED_DEBOUNCE_MS
  );
  queue.timer.unref?.();
}

function submitWordForNick(
  room,
  { roundId, word, path, nick, traceStartedAt = null, deferRankingBroadcast = false }
) {
  const submitStartedAt = Date.now();
  let submitAccepted = false;
  const finish = (result) => {
    const elapsed = Date.now() - submitStartedAt;
    bumpRoomPerfCounter(room, "submitWords");
    if (elapsed > PERF_SUBMIT_WORD_WARN_MS) {
      console.warn(
        `[perf:${room?.id || "room"}] submitWord ${elapsed}ms ok=${!!result?.ok} accepted=${submitAccepted} word=${String(word || "").slice(0, 24)}`
      );
    }
    return result;
  };
  if (!room) return { ok: false, error: "invalid_room" };
  if (!room.currentRound || room.currentRound.id !== roundId) {
    return finish({ ok: false, error: "round_invalid" });
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
  const persistentProgressAllowed = shouldPersistRoundProgress(room.currentRound);
  if (roundSpecialType === OCID_TYPE) {
    return { ok: false, error: "ocid_use_proposal" };
  }
  if (roundSpecialType === SELF_SPECIAL_3_WORDS_TYPE) {
    return { ok: false, error: "special3_use_state_sync" };
  }

  const safePath =
    Array.isArray(path) && path.length > 0 && path.every((idx) => Number.isInteger(idx))
      ? path
      : null;
  const scored = safePath
    ? scoreWordOnGridWithPath(normInput, room.currentRound.grid, safePath, scoreConfig)
    : isTargetRound
    ? scoreWordOnGrid(normInput, room.currentRound.grid, scoreConfig)
    : null;

  if (isTargetRound) {
    if (room.currentRound?.targetFoundAt?.has?.(resolvedNick)) {
      return { ok: false, error: "already_found" };
    }
    const target = normalizeWord(room.currentRound?.targetWord || "");
    if (!target) {
      return { ok: false, error: "invalid_word" };
    }
    if (dictionary && !dictionary.has(normInput)) {
      return { ok: false, error: "invalid_word" };
    }
    if (!scored) return { ok: false, error: "invalid_word" };
    if (normInput !== target) {
      return { ok: false, error: "not_target" };
    }
  }

  if (!safePath) return { ok: false, error: "missing_path" };
  if (!scored) return { ok: false, error: "invalid_word" };

  const { norm, pts, path: scoredPath } = scored;
  const len = norm.length;
  const scoredRareMeta = buildRareBonusSubmittedWordMeta(room.currentRound, norm);
  const scoredCultureThemeMeta = {
    cultureThemeWord: isCultureThemeChallengeWord(room.currentRound, norm),
  };
  const wordPts =
    computeWordScoreForRound(room.currentRound, norm, scoredPath, pts) +
    (Number(scoredRareMeta.rareBonusPoints) || 0);

  const roundSubs = room.submissions.get(roundId);
  if (!roundSubs) {
    return { ok: false, error: "no_round_subs" };
  }

  let data = roundSubs.get(resolvedNick);
  if (!data) {
    data = {
      words: new Set(),
      score: 0,
      wordTimes: new Map(),
      wordMeta: new Map(),
      wordScores: new Map(),
    };
    roundSubs.set(resolvedNick, data);
  }

  if (data.words.has(norm)) {
    return { ok: false, error: "already_played" };
  }

  data.words.add(norm);
  if (!data.wordTimes) data.wordTimes = new Map();
  if (!(data.wordMeta instanceof Map)) data.wordMeta = new Map();
  if (!(data.wordScores instanceof Map)) data.wordScores = new Map();
  if (!data.wordTimes.has(norm)) data.wordTimes.set(norm, Date.now());
  const scoredFakeTwinsMeta = buildFakeTwinsSubmittedWordMeta(room.currentRound, norm, scored);
  data.wordMeta.set(norm, { ...scoredFakeTwinsMeta, ...scoredRareMeta, ...scoredCultureThemeMeta });
  data.wordScores.set(norm, wordPts);
  data.score += wordPts;
  const extraAcceptedWords = [];
  if (roundSpecialType === FAKE_TWINS_TYPE) {
    const variants = buildPathWordVariants(room.currentRound.grid, scoredPath, scoreConfig);
    for (const variant of variants) {
      const variantNorm = normalizeWord(variant?.raw || "");
      if (!variantNorm || variantNorm === norm || data.words.has(variantNorm)) continue;
      if (!dictionary?.has?.(variantNorm)) continue;
      const variantScored = scoreWordOnGridWithPath(
        variantNorm,
        room.currentRound.grid,
        scoredPath,
        scoreConfig
      );
      if (!variantScored?.path) continue;
      const variantRareMeta = buildRareBonusSubmittedWordMeta(room.currentRound, variantScored.norm);
      const variantCultureThemeMeta = {
        cultureThemeWord: isCultureThemeChallengeWord(room.currentRound, variantScored.norm),
      };
      const variantPts =
        computeWordScoreForRound(
        room.currentRound,
        variantScored.norm,
        variantScored.path,
        variantScored.pts
        ) + (Number(variantRareMeta.rareBonusPoints) || 0);
      data.words.add(variantScored.norm);
      if (!data.wordTimes.has(variantScored.norm)) data.wordTimes.set(variantScored.norm, Date.now());
      const variantFakeTwinsMeta = buildFakeTwinsSubmittedWordMeta(
        room.currentRound,
        variantScored.norm,
        variantScored
      );
      data.wordMeta.set(variantScored.norm, {
        ...variantFakeTwinsMeta,
        ...variantRareMeta,
        ...variantCultureThemeMeta,
      });
      data.wordScores.set(variantScored.norm, variantPts);
      data.score += variantPts;
      extraAcceptedWords.push({
        word: variantScored.norm,
        wordScore: variantPts,
        ...variantFakeTwinsMeta,
        ...variantRareMeta,
        ...variantCultureThemeMeta,
      });
    }
  }

  const playerObj = playerEntry?.player || null;
  const playerInstallId = normalizeInstallId(playerObj?.installId);
  const playerKey = getMedalKeyForPlayer(playerObj) || getMedalKeyForNick(resolvedNick);
  const isBotPlayer = isBotToken(playerObj?.token);
  if (persistentProgressAllowed && !isBotPlayer && playerKey && !isTargetRound) {
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
  const maxLenPossible = room.bestPossibleStats.maxLen || 0;
  const maxPtsPossible = getEffectiveMaxPossibleScoreForRound(
    room.currentRound,
    room.bestPossibleStats.maxPts || 0
  );
  const isMaxPossibleLen = maxLenPossible > 0 && len === maxLenPossible;
  const isMaxPossiblePts = maxPtsPossible > 0 && wordPts === maxPtsPossible;

  // Manche "cible" : si on trouve le mot secret, on annonce + voile "bravo" (sans points bonus)
  const specialType = room.currentRound?.special?.type;
  const scoreGobbleAllowed = !isSpeedRound && specialType !== MASSIVE_BOGGLE_TYPE;
  const targetWord = room.currentRound?.targetWord;
  let targetFoundThisSubmission = false;
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
      targetFoundThisSubmission = true;
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
      if (persistentProgressAllowed && !isBotPlayer && playerKey) {
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

  if (specialType === FAKE_TWINS_TYPE) {
    const totalFakeTwinWords = Math.max(
      0,
      Number(
        room.currentRound?.quality?.fakeTwinBonusWords ??
          room.currentRound?.quality?.fakeTwinCompletionWords ??
          room.currentRound?.quality?.fakeTwinWords
      ) || 0
    );
    const fakeTwinsCompletionTarget = Math.max(
      0,
      Number(room.currentRound?.quality?.fakeTwinCompletionTarget) ||
        getFakeTwinsCompletionTarget(totalFakeTwinWords)
    );
    if (fakeTwinsCompletionTarget > 0) {
      if (!room.currentRound.fakeTwinsCompletionAt) {
        room.currentRound.fakeTwinsCompletionAt = new Map();
      }
      const foundFakeTwinWords = Array.from(data.words || []).reduce((count, word) => {
        const meta = data.wordMeta?.get?.(word);
        return meta?.usedFakeTwins ? count + 1 : count;
      }, 0);
      if (
        foundFakeTwinWords >= fakeTwinsCompletionTarget &&
        !room.currentRound.fakeTwinsCompletionAt.has(resolvedNick)
      ) {
        const foundAt = Date.now();
        room.currentRound.fakeTwinsCompletionAt.set(resolvedNick, foundAt);
        io.to(room.id).emit("specialSolved", {
          roomId: room.id,
          roundId,
          nick: resolvedNick,
          kind: FAKE_TWINS_TYPE,
          found: foundFakeTwinWords,
          target: fakeTwinsCompletionTarget,
        });
      }
    }
  }

  if (isTargetRound) {
    notifyAmbientBotsWordAccepted(room, {
      nick: resolvedNick,
      word: norm,
      len,
      pts: wordPts,
      rareBonusWord: !!scoredRareMeta.rareBonusWord,
      isMaxPossibleLen,
      isMaxPossiblePts,
      isBotPlayer,
      specialType,
      targetFound: targetFoundThisSubmission,
    });
    submitAccepted = true;
    return finish({
      ok: true,
      score: data.score,
      wordScore: wordPts,
      ...scoredFakeTwinsMeta,
      ...scoredRareMeta,
      extraWords: extraAcceptedWords,
    });
  }

  if (persistentProgressAllowed && !isBotPlayer && playerInstallId) {
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
    enqueueDuelWordAccepted(room, {
      installId: playerInstallId,
      nick: resolvedNick,
      dateId: getParisDateId(),
      roundSpecialType: room.currentRound?.special?.type || null,
      wordLength: len,
      wordPoints: wordPts,
      usedBonusTile,
      usedRareLetter,
      roundId: duelRoundId,
    });
  }

  if (scoreGobbleAllowed && isMaxPossiblePts) {
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
  } else if (scoreGobbleAllowed && wordPts >= MIN_BIG_WORD) {
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
    (scoreGobbleAllowed && isMaxPossiblePts ? 1 : 0) + (isMaxPossibleLen ? 1 : 0);
  if (persistentProgressAllowed && !isBotPlayer && playerInstallId && liveGobblarsNow > 0) {
    void persistenceClient.addGobblars({
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
        clearThemeProfileResponseCache(playerInstallId);
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

  if (!deferRankingBroadcast) {
    maybeAnnounceCloseFight(room);
    broadcastProvisionalRanking(room);
  }

  notifyAmbientBotsWordAccepted(room, {
    nick: resolvedNick,
    word: norm,
    len,
    pts: wordPts,
    rareBonusWord: !!scoredRareMeta.rareBonusWord,
    isMaxPossibleLen,
    isMaxPossiblePts,
    isBotPlayer,
    specialType,
    targetFound: false,
  });

  submitAccepted = true;
  return finish({
    ok: true,
    score: data.score,
    wordScore: wordPts,
    ...scoredFakeTwinsMeta,
    ...scoredRareMeta,
    ...scoredCultureThemeMeta,
    extraWords: extraAcceptedWords,
  });
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
    data = {
      words: new Set(),
      score: 0,
      wordTimes: new Map(),
      wordMeta: new Map(),
      wordScores: new Map(),
    };
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

async function computeWeeklyVocabRankMap(atTs = Date.now(), overrides = []) {
  const byKey = new Map();
  const addEntry = (entry) => {
    const playerKey =
      typeof entry?.playerKey === "string" && entry.playerKey.trim()
        ? entry.playerKey.trim()
        : getMedalKeyForInstallId(entry?.installId);
    if (!playerKey) return;
    const weeklyVocabCount = Number(entry?.weeklyVocabCount ?? entry?.vocabCount ?? entry?.count);
    if (!Number.isFinite(weeklyVocabCount) || weeklyVocabCount <= 0) return;
    const achievedAt = Number(entry?.achievedAt ?? entry?.updatedAt) || atTs;
    const current = byKey.get(playerKey);
    if (
      !current ||
      weeklyVocabCount > current.weeklyVocabCount ||
      (weeklyVocabCount === current.weeklyVocabCount && achievedAt < current.achievedAt)
    ) {
      byKey.set(playerKey, {
        nick: typeof entry?.nick === "string" ? entry.nick.trim() : "",
        playerKey,
        weeklyVocabCount,
        achievedAt,
      });
    }
  };

  const weeklyStatsSnapshot = getWeeklyStats(500);
  const weeklyVocabEntries = Array.isArray(weeklyStatsSnapshot?.boards?.weeklyVocab)
    ? weeklyStatsSnapshot.boards.weeklyVocab
    : [];
  weeklyVocabEntries.forEach(addEntry);

  const fallbackEntries = await getWeeklyVocabularyLeaderboard(atTs, 500).catch(() => []);
  if (Array.isArray(fallbackEntries)) {
    fallbackEntries.forEach((entry) =>
      addEntry({
        ...entry,
        playerKey: getMedalKeyForInstallId(entry?.installId),
        weeklyVocabCount: Number(entry?.count) || 0,
      })
    );
  }

  for (const override of Array.isArray(overrides) ? overrides : []) {
    const playerKey = typeof override?.playerKey === "string" ? override.playerKey.trim() : "";
    if (!playerKey) continue;
    const weeklyVocabCount = Number(override?.weeklyVocabCount);
    if (!Number.isFinite(weeklyVocabCount) || weeklyVocabCount <= 0) {
      byKey.delete(playerKey);
      continue;
    }
    const existing = byKey.get(playerKey);
    byKey.set(playerKey, {
      nick: typeof override?.nick === "string" ? override.nick.trim() : existing?.nick || "",
      playerKey,
      weeklyVocabCount,
      achievedAt: Number(override?.achievedAt) || existing?.achievedAt || atTs,
    });
  }

  const ranked = Array.from(byKey.values()).sort((a, b) => {
    const diff = (Number(b.weeklyVocabCount) || 0) - (Number(a.weeklyVocabCount) || 0);
    if (diff !== 0) return diff;
    const timeDiff = (Number(a.achievedAt) || 0) - (Number(b.achievedAt) || 0);
    if (timeDiff !== 0) return timeDiff;
    return String(a.nick || "").localeCompare(String(b.nick || ""));
  });
  return new Map(ranked.map((entry, idx) => [entry.playerKey, idx + 1]));
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

function yieldToSocketEventLoop() {
  return new Promise((resolve) => {
    if (typeof setImmediate === "function") {
      setImmediate(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function createEventLoopYielder(minDelayMs = 12) {
  let lastYieldAt = Date.now();
  return async function maybeYieldToSocketEvents() {
    const now = Date.now();
    if (now - lastYieldAt < minDelayMs) return;
    lastYieldAt = now;
    await yieldToSocketEventLoop();
  };
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

function computePlayerWordHighlightsForProfile(round, entry) {
  if (!round || !entry || !Array.isArray(entry.words) || !entry.words.length) {
    return { bestWord: null, longestWord: null };
  }
  const board = round.grid;
  if (!Array.isArray(board) || board.length === 0) {
    return { bestWord: null, longestWord: null };
  }
  const scoreConfig = getSpecialScoreConfig(round);
  const specialType = round?.special?.type;
  const scoringBoard =
    specialType === SELF_SPECIAL_3_WORDS_TYPE
      ? applySpecial3Placements(board, entry?.specialPlacements).board
      : board;
  let bestWord = null;
  let longestWord = null;
  for (const raw of entry.words) {
    const scored = scoreWordOnGrid(raw, scoringBoard, scoreConfig);
    if (!scored) continue;
    const pts = computeWordScoreForRound(round, scored.norm, scored.path, scored.pts);
    if (!bestWord || pts > bestWord.pts) {
      bestWord = { word: scored.norm, pts };
    }
    const len = scored.norm.length;
    if (!longestWord || len > longestWord.len) {
      longestWord = { word: scored.norm, len };
    }
  }
  return { bestWord, longestWord };
}

function summarizeRoundResultsForLog(results) {
  const list = Array.isArray(results) ? results : [];
  let words = 0;
  let participated = 0;
  let bestScore = 0;
  const top = [];
  for (const entry of list) {
    const score = Number(entry?.score) || 0;
    const entryWords = Array.isArray(entry?.words) ? entry.words.length : 0;
    words += entryWords;
    if (entryWords > 0 || score > 0 || entry?.participated) participated += 1;
    if (score > bestScore) bestScore = score;
    top.push({
      nick: String(entry?.nick || ""),
      score,
      words: entryWords,
      isBot: !!entry?.isBot,
    });
  }
  top.sort((a, b) => (b.score || 0) - (a.score || 0));
  return {
    players: list.length,
    participated,
    words,
    bestScore,
    top: top.slice(0, 5),
  };
}

function recomputeRoundGobblesFromResults(room, results) {
  if (!room?.currentRound || !Array.isArray(results)) return;
  const specialType = room.currentRound?.special?.type;
  const isTargetRound =
    specialType === "target_long" || specialType === "target_score";
  const liveGobbles =
    room.currentRound.gobbles instanceof Map ? new Map(room.currentRound.gobbles) : new Map();
  const liveGobbleFlags =
    room.currentRound.gobbleFlags instanceof Map
      ? new Map(room.currentRound.gobbleFlags)
      : new Map();

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
  if (specialType === SELF_SPECIAL_3_WORDS_TYPE) {
    const validWordsByPlayer = [];
    for (const entry of results) {
      const nick = String(entry?.nick || "").trim();
      if (!nick) continue;
      const scoringBoard = applySpecial3Placements(board, entry?.specialPlacements).board;
      const validWords = [];
      for (const raw of Array.isArray(entry?.words) ? entry.words : []) {
        const scored = scoreWordOnGrid(raw, scoringBoard, scoreConfig);
        if (scored?.norm) validWords.push(scored.norm);
      }
      validWordsByPlayer.push({ nick, words: validWords });
    }
    const special3Awards = computeSpecial3GobbleAwards(
      validWordsByPlayer,
      Number(room.bestPossibleStats?.maxLen) || 0
    );
    room.currentRound.gobbles = special3Awards.gobbles;
    room.currentRound.gobbleFlags = special3Awards.gobbleFlags;
    return;
  }

  const maxLenPossible = Number(room.bestPossibleStats?.maxLen) || 0;
  const maxPtsPossible = getEffectiveMaxPossibleScoreForRound(
    room.currentRound,
    Number(room.bestPossibleStats?.maxPts) || 0
  );
  const scoreGobbleEnabled =
    specialType !== "speed" && specialType !== MASSIVE_BOGGLE_TYPE && maxPtsPossible > 0;
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
      const wordMeta =
        entry?.wordMeta && typeof entry.wordMeta === "object" ? entry.wordMeta : {};
      const metaKey = Object.keys(wordMeta).find((key) => normalizeWord(key) === scored.norm);
      const rareBonusPoints = shouldApplyRareWordBonus(room.currentRound)
        ? Number((metaKey ? wordMeta[metaKey] : wordMeta[scored.norm])?.rareBonusPoints) || 0
        : 0;
      const pts = computeWordScoreForRound(
        room.currentRound,
        scored.norm,
        scored.path,
        scored.pts
      ) + rareBonusPoints;
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

  for (const [nick, liveCountRaw] of liveGobbles.entries()) {
    if (!nick) continue;
    const liveCount = Math.max(0, Math.trunc(Number(liveCountRaw) || 0));
    if (liveCount <= 0) continue;
    const recomputedCount = Math.max(0, Math.trunc(Number(gobbles.get(nick)) || 0));
    if (liveCount > recomputedCount) {
      gobbles.set(nick, liveCount);
    }
    const liveFlags = liveGobbleFlags.get(nick) || {};
    const recomputedFlags = gobbleFlags.get(nick) || {};
    gobbleFlags.set(nick, {
      score: !!(recomputedFlags.score || liveFlags.score),
      len: !!(recomputedFlags.len || liveFlags.len),
    });
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
    if (specialType !== "speed" && specialType !== MASSIVE_BOGGLE_TYPE && leaders?.bestWord?.word) {
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
    plan?.type === MASSIVE_BOGGLE_TYPE ||
    plan?.type === FAKE_TWINS_TYPE ||
    plan?.type === OCID_TYPE
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
    classicBoggleScoring: !!plan.classicBoggleScoring,
    tileBonusMultiplier: Number(plan.tileBonusMultiplier) || 0,
    fixedWordScore: plan.fixedWordScore || 0,
    disableBonuses: !!plan.disableBonuses,
    ocidExcludedTargets: Array.isArray(plan.ocidExcludedTargets)
      ? plan.ocidExcludedTargets
      : [],
  });
}

function getRecentOcidTargetSet(room) {
  const values = Array.isArray(room?.ocidRecentTargets) ? room.ocidRecentTargets : [];
  return new Set(values.map((word) => normalizeWord(word || "")).filter(Boolean));
}

function buildPlanWithOcidExclusions(room, plan) {
  if (!plan || plan.type !== OCID_TYPE) return plan;
  const excluded = Array.from(getRecentOcidTargetSet(room));
  return {
    ...plan,
    ocidExcludedTargets: excluded,
  };
}

function isRecentOcidTarget(room, word) {
  const normalized = normalizeWord(word || "");
  return !!normalized && getRecentOcidTargetSet(room).has(normalized);
}

function rememberOcidTarget(room, word) {
  const normalized = normalizeWord(word || "");
  if (!room || !normalized) return;
  const previous = Array.isArray(room.ocidRecentTargets) ? room.ocidRecentTargets : [];
  room.ocidRecentTargets = [
    normalized,
    ...previous.filter((entry) => normalizeWord(entry || "") !== normalized),
  ].slice(0, OCID_RECENT_TARGET_LIMIT);
}

function hasPreparedOrPendingGrid(room, roundNumber) {
  if (!room || !Number.isFinite(roundNumber)) return false;
  return (
    room.nextPreparedGrid?.roundNumber === roundNumber ||
    (room.nextPreparedGridPromise &&
      room.nextPreparedGridPromiseRoundNumber === roundNumber)
  );
}

function emitRoundPreparing(room, plan, roundNumber, tournamentRound) {
  if (!room?.id) return;
  io.to(room.id).emit("roundPreparing", {
    roomId: room.id,
    roundNumber,
    special: plan?.isSpecial ? plan : null,
    tournament: {
      id: room.tournament?.id || null,
      round: tournamentRound || room.tournament?.currentRound || 0,
      totalRounds: room.tournament?.totalRounds || TOURNAMENT_TOTAL_ROUNDS,
    },
    message: plan?.type === FINALE_TYPE
      ? "La grille finale renforcée met un peu plus de temps à générer."
      : plan?.isSpecial
      ? `La manche spéciale ${plan.label || ""} met un peu plus de temps à générer.`
      : "La prochaine grille met un peu plus de temps à générer.",
    startedAt: Date.now(),
  });
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
  const preparedPlan = buildPlanWithOcidExclusions(room, plan);
  if (matchesBufferedPreparedGrid(room, tournamentRound, preparedPlan, tournamentId)) return;
  const pendingMeta = room.bufferedPreparedGridPromiseMeta;
  const planKey = getPreparedPlanCacheKey(preparedPlan);
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
      roundPlan: preparedPlan,
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
          plan: prepared.plan || preparedPlan,
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
  const roundPlan = buildPlanWithOcidExclusions(
    room,
    plan || getRoundPlan(roundNumber, room.config)
  );
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
      const prepareStartedAt = Date.now();
      const cultureThemeGenerationEnabled =
        CULTURE_THEME_BONUS_ENABLED && AMBIENT_CHAT_BOT_ENABLED_KEYS.has("culture");
      const result = await computePool.prepareNextGrid({
        roomConfig: room.config,
        roundPlan,
        roundNumber,
        cultureThemeOptions: cultureThemeGenerationEnabled
          ? getCultureThemeGenerationOptions(room)
          : { disabled: true },
      });
      const prepareElapsedMs = Date.now() - prepareStartedAt;
      const prepared = result || null;
      room.nextPreparedGrid = prepared
        ? { ...prepared, plan: prepared.plan || roundPlan, roundNumber }
        : null;
      const stats = prepared?.prepareStats || null;
      if (
        prepareElapsedMs > 750 ||
        stats?.cultureThemeBudgetExceeded ||
        Number(stats?.cultureThemeChecks) > 0
      ) {
        console.log(
          `[${room.id}] prepareNextGrid round=${roundNumber} type=${roundPlan?.type || "normal"} ` +
            `elapsed=${prepareElapsedMs}ms attempts=${Number(stats?.attempts) || "?"}/${Number(stats?.maxAttempts) || "?"} ` +
            `culture=${stats?.cultureThemeFound ? "yes" : "no"} checks=${Number(stats?.cultureThemeChecks) || 0} ` +
            `cultureMs=${Number(stats?.cultureThemeMs) || 0} budget=${Number(stats?.cultureThemeBudgetMs) || 0} ` +
            `budgetExceeded=${stats?.cultureThemeBudgetExceeded ? "yes" : "no"}`
        );
      }

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

async function startRoundForRoom(room, options = {}) {
  if (!room) return;
  room.roundStartPending = true;
  emitTournamentLobby(room);
  try {
    return await runStartRoundForRoom(room, options);
  } finally {
    room.roundStartPending = false;
    if (!room.currentRound && !room.breakState) {
      emitTournamentLobby(room);
    }
  }
}

async function runStartRoundForRoom(room, options = {}) {
  if (!room) return;
  const trainingRound = !!options?.training;
  const planOverride = options?.planOverride || null;
  clearPendingRankingBroadcast(room);
  room.rankingLastSignature = null;
  room.breakState = null;
  clearTournamentLobbyTimers(room);
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
  let tournamentRound = trainingRound ? 0 : (room.tournament.currentRound || 0) + 1;
  if (!trainingRound && tournamentRound > (room.tournament.totalRounds || TOURNAMENT_TOTAL_ROUNDS)) {
    resetTournament(room);
    tournamentRound = 1;
  }
  if (!trainingRound && tournamentRound === 1) {
    enforcePlaytimeLimitsAtTournamentStart(room);
  }

  const tournamentPlan = planOverride || getTournamentRoundPlan(room, tournamentRound);
  const tournamentIdForRound = trainingRound ? null : room.tournament?.id || null;
  const cached =
    !trainingRound && room.nextPreparedGrid?.roundNumber === roundNumber
      ? room.nextPreparedGrid
      : null;
  if (!trainingRound && room.nextPreparedGrid?.roundNumber === roundNumber) {
    room.nextPreparedGrid = null;
  }
  let prepared = cached;
  let planUsed = prepared?.plan || tournamentPlan;
  if (prepared?.plan?.type === OCID_TYPE && isRecentOcidTarget(room, prepared.targetWord)) {
    prepared = null;
    planUsed = tournamentPlan;
  }
  if (!prepared && !trainingRound) {
    prepared = takeBufferedPreparedGrid(
      room,
      tournamentRound,
      buildPlanWithOcidExclusions(room, tournamentPlan),
      roundNumber,
      tournamentIdForRound
    );
    if (prepared?.plan) {
      planUsed = prepared.plan;
    }
    if (prepared?.plan?.type === OCID_TYPE && isRecentOcidTarget(room, prepared.targetWord)) {
      prepared = null;
      planUsed = tournamentPlan;
    }
  }
  if (!prepared) {
    // Any cache miss means the server must wait for the worker before it can
    // start the round, including a normal grid or a preparation already in
    // progress. Keep players on the preparation screen for that whole wait.
    emitRoundPreparing(room, planUsed, roundNumber, tournamentRound);
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
    planUsed?.type === OCID_TYPE
      ? OCID_PROPOSAL_DURATION_MS
      : planUsed?.type === "target_long" || planUsed?.type === "target_score"
      ? TARGET_SPECIAL_ROUND_DURATION_MS
      : planUsed?.type === "speed" ||
        planUsed?.type === "monstrous" ||
        planUsed?.type === MASSIVE_BOGGLE_TYPE
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
    tournamentId: tournamentIdForRound,
    tournamentRound,
    targetWord: prepared?.targetWord || null,
    targetLength: prepared?.targetLength || null,
    targetPath: prepared?.targetPath || null,
    solutions: sanitizePreparedSolutions(prepared?.solutions),
    cultureThemeChallenge: hydrateCultureThemeChallenge(prepared?.cultureThemeChallenge),
    targetWordCellMap: null,
    targetRevealed: new Set(),
    targetHintScheduleMs: [],
    targetSolvedBy: null,
    ocidProposals: new Map(),
    ocidVotes: new Map(),
    ocidOptions: [],
    ocidVoteEndsAt: null,
    gobbles: new Map(),
    gobbleFlags: new Map(),
    fakeTwinsCompletionAt: new Map(),
    duelWordAcceptedQueues: new Map(),
    duelWordTasks: new Set(),
    duelObjectivePointsByNick: new Map(),
    training: trainingRound,
  };
  resetAmbientChatBotState(room, roundId);
  maybePrepareCultureThemeChallenge(room, planUsed);
  if (planUsed?.type === OCID_TYPE && room.currentRound.targetWord) {
    rememberOcidTarget(room, room.currentRound.targetWord);
  }

  const roundSubs = new Map();
  for (const p of room.players.values()) {
    if (!isPlayerConnected(p) && !isBotToken(p?.token)) continue;
    roundSubs.set(p.nick, {
      words: new Set(),
      score: 0,
      wordTimes: new Map(),
      wordMeta: new Map(),
      wordScores: new Map(),
    });
  }
  room.submissions.set(roundId, roundSubs);
  pruneRoomState(room);

  resetRoomRecords(room);
  room.roundCounter = roundNumber;
  if (!trainingRound) {
    room.tournament.currentRound = tournamentRound;
  }
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
    if (
      (planUsed?.type === "bonus_letter" ||
        planUsed?.type === MASSIVE_BOGGLE_TYPE ||
        planUsed?.type === FINALE_TYPE) &&
      dictionary
    ) {
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
  const payloadBuildStartedAt = Date.now();
  const roundStartedPayload = buildRoundStartedPayload(room);
  const payloadBuildElapsed = Date.now() - payloadBuildStartedAt;
  if (payloadBuildElapsed > 250) {
    console.warn(
      `[${room.id}] roundStarted payload built in ${payloadBuildElapsed}ms round=${roundId} special=${planUsed?.type || "normal"} solutions=${getRoundSolutionsPayloadCount(roundStartedPayload?.solutions)}`
    );
  }
  if (roundStartedPayload) {
    io.to(room.id).emit("roundStarted", roundStartedPayload);
  }

  broadcastProvisionalRanking(room, { force: true });
  scheduleAmbientRoundStartBots(room, planUsed, roundIntroMs, roundDurationMs);

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
      planUsed.type === FINALE_TYPE
        ? "MANCHE FINALE : points du classement ×2 et tuiles spéciales ×2 (L2→L4, L3→L6, M2→M4, M3→M6)"
        : planUsed.type === "speed"
        ? `MANCHE SPECIALE : ${planUsed.label} - tous les mots valent ${planUsed.fixedWordScore} pts`
        : planUsed.type === "monstrous"
        ? `MANCHE SPECIALE : ${planUsed.label} - gros potentiel de points et de mots longs`
        : planUsed.type === SELF_SPECIAL_3_WORDS_TYPE
        ? `MANCHE SPECIALE : ${planUsed.label} - place les bonus et garde 3 mots avec des tuiles de départ différentes`
        : planUsed.type === FAKE_TWINS_TYPE
        ? `MANCHE SPECIALE : ${planUsed.label} - une case vaut 2 lettres, mots de 2 lettres ou plus`
        : planUsed.type === OCID_TYPE
        ? `MANCHE SPECIALE : ${planUsed.label} - propose un mot pour pieger les autres joueurs`
        : planUsed.type === "target_long"
        ? `MANCHE SPECIALE : ${planUsed.label} - objectif: trouver le mot le plus long`
        : planUsed.type === "target_score"
        ? `MANCHE SPECIALE : ${planUsed.label} - objectif: trouver le mot qui rapporte le plus de points`
        : `MANCHE SPECIALE : ${planUsed.label}`;
    pushAnnouncement(room, { type: "special_start", text: specialText });
    scheduleDevSpecialRoundChat(room, roundId, planUsed, roundIntroMs, roundDurationMs);
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
        const group = pickTargetRevealGroup(word, revealed, { minHiddenAfter: 1 });
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
          const revealed = room.currentRound.targetRevealed || new Set();
          if (getTargetHiddenLetterCount(word, revealed) <= 1) return;

          const group = pickTargetRevealGroup(word, revealed, { minHiddenAfter: 1 });
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
      if (planUsed?.type === OCID_TYPE) {
        startOcidVotePhase(room).catch((err) =>
          console.warn("startOcidVotePhase failed", err)
        );
        return;
      }
      endRoundForRoom(room).catch((err) =>
        console.warn("endRoundForRoom failed", err)
      );
    },
    roundIntroMs +
      roundDurationMs +
      (planUsed?.type === OCID_TYPE ? OCID_PROPOSAL_END_GRACE_MS : LIVE_ROUND_END_GRACE_MS)
  ));
}

async function startOcidVotePhase(room) {
  if (!room?.currentRound || room.currentRound.special?.type !== OCID_TYPE) return;
  if (room.currentRound.status !== "running" && room.currentRound.status !== "intro") return;
  const round = room.currentRound;
  round.status = "ocid_vote";
  const now = Date.now();
  round.ocidVoteEndsAt = now + OCID_VOTE_DURATION_MS;
  round.endsAt = round.ocidVoteEndsAt;
  round.durationMs = OCID_VOTE_DURATION_MS;
  const payload = buildPublicOcidVotePayload(room);
  io.to(room.id).emit("ocidVoteStarted", payload);
  pushAnnouncement(room, {
    type: "ocid_vote",
    text: "Vote OCID : trouve le vrai mot parmi les propositions.",
  });
  round.timers.push(
    setTimeout(() => {
      endRoundForRoom(room).catch((err) => console.warn("endRoundForRoom failed", err));
    }, OCID_VOTE_DURATION_MS + LIVE_ROUND_END_GRACE_MS)
  );
}

async function endRoundForRoom(room) {
  const endRoundStartedAt = Date.now();
  const maybeYieldEndRound = createEventLoopYielder();
  if (
    !room ||
    !room.currentRound ||
    (room.currentRound.status !== "running" &&
      room.currentRound.status !== "intro" &&
      room.currentRound.status !== "ocid_vote")
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
  flushPendingDuelWordAcceptedQueues(room.currentRound, room);
  const pendingDuelWordTasks =
    room.currentRound.duelWordTasks instanceof Set
      ? Array.from(room.currentRound.duelWordTasks)
      : [];
  if (pendingDuelWordTasks.length > 0) {
    await waitForDuelWordTasksBeforeResults(room, pendingDuelWordTasks);
  }

  const roundSubs = room.submissions.get(room.currentRound.id) || new Map();
  const results = [];
  const specialType = room.currentRound?.special?.type;
  const isTrainingRound = !shouldPersistRoundProgress(room.currentRound);
  const isTargetRound = specialType === "target_long" || specialType === "target_score";
  let targetPointsMultiplier = 1;
  let targetSummary = null;
  let ocidSummary = null;

  for (const [nick, data] of roundSubs.entries()) {
    await maybeYieldEndRound();
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
    const wordMetaObj =
      data.wordMeta instanceof Map ? Object.fromEntries(data.wordMeta.entries()) : {};
    const wordScoresObj =
      data.wordScores instanceof Map ? Object.fromEntries(data.wordScores.entries()) : {};
    const rareBonusPoints = shouldApplyRareWordBonus(room.currentRound)
      ? Object.values(wordMetaObj).reduce(
          (sum, meta) => sum + (Number(meta?.rareBonusPoints) || 0),
          0
        )
      : 0;
    results.push({
      nick,
      score: data.score,
      words: rawWords,
      wordScores: wordScoresObj,
      wordMeta: wordMetaObj,
      rareBonusPoints,
      wordTimes,
      specialPlacements:
        data?.specialPlacements && typeof data.specialPlacements === "object"
          ? data.specialPlacements
          : null,
      specialWordSlots: Array.isArray(data?.specialWordSlots) ? data.specialWordSlots : null,
      uniqueWords,
      newVocabWords: [],
      userId: Number.isInteger(Number(player?.userId)) ? Number(player.userId) : null,
      installId: player?.installId || null,
      team: getTeamForInstallCached(player?.installId),
      isBot: isBotNick(room, nick),
      isDailyChampion: isDailyChampionPlayer(player),
      weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForInstallId(player?.installId, nick),
      isWeeklyVocabChampion: isWeeklyVocabChampionInstallId(player?.installId, nick),
      connected,
      afk: isPlayerAfk(player),
      participated,
      roundEligible: true,
    });
  }

  if (specialType === FAKE_TWINS_TYPE) {
    const totalFakeTwinWords = Math.max(
      0,
      Number(
        room.currentRound?.quality?.fakeTwinBonusWords ??
          room.currentRound?.quality?.fakeTwinCompletionWords ??
          room.currentRound?.quality?.fakeTwinWords
      ) || 0
    );
    const fakeTwinsCompletionTarget = Math.max(
      0,
      Number(room.currentRound?.quality?.fakeTwinCompletionTarget) ||
        getFakeTwinsCompletionTarget(totalFakeTwinWords)
    );
    const totalFakeTwinBonusWords = Math.max(
      0,
      Number(room.currentRound?.quality?.fakeTwinBonusWords) || 0
    );
    if (fakeTwinsCompletionTarget > 0) {
      for (const entry of results) {
        await maybeYieldEndRound();
        const words = Array.isArray(entry.words) ? entry.words : [];
        const wordMeta = entry?.wordMeta && typeof entry.wordMeta === "object" ? entry.wordMeta : {};
        const foundFakeTwinWords = words.reduce((count, word) => {
          const norm = normalizeWord(word);
          const meta = wordMeta?.[norm];
          return meta?.usedFakeTwins ? count + 1 : count;
        }, 0);
        const foundFakeTwinBonusWords = words.reduce((count, word) => {
          const norm = normalizeWord(word);
          return wordMeta?.[norm]?.usedFakeTwins ? count + 1 : count;
        }, 0);
        entry.fakeTwinWordsFound = foundFakeTwinWords;
        entry.fakeTwinWordsTotal = fakeTwinsCompletionTarget;
        entry.fakeTwinBonusWordsFound = foundFakeTwinBonusWords;
        entry.fakeTwinBonusWordsTotal = totalFakeTwinBonusWords || totalFakeTwinWords;
        if (foundFakeTwinWords >= fakeTwinsCompletionTarget) {
          entry.score = (Number(entry.score) || 0) + FAKE_TWINS_COMPLETION_BONUS;
          entry.fakeTwinsCompletionBonus = FAKE_TWINS_COMPLETION_BONUS;
          pushAnnouncement(room, {
            type: "fake_twins_completed",
            nick: entry.nick,
            bonus: FAKE_TWINS_COMPLETION_BONUS,
            text: `${entry.nick} a atteint l'objectif faux jumeaux (+${FAKE_TWINS_COMPLETION_BONUS} pts)`,
          });
        }
      }
    }
  }

  await applyCultureThemeChallengeBonus(room, results);

  if (specialType === OCID_TYPE) {
    const ocidComputed = computeOcidRoundResults(room, results);
    if (ocidComputed) {
      results.length = 0;
      results.push(...ocidComputed.results);
      ocidSummary = ocidComputed.summary;
      targetSummary = {
        word: ocidSummary.word || "",
        definition: ocidSummary.definition || "",
        definitionSource: ocidSummary.definitionSource || "",
        definitionUrl: ocidSummary.definitionUrl || "",
        ocid: ocidSummary,
      };
    }
  }

  const endedAt = room.currentRound.endsAt || Date.now();
  const resultsByNick = new Map(results.map((entry) => [entry.nick, entry]));
  const vocabEntries = [];
  const vocabLookups = [];
  const vocabInstallIdsByNick = new Map();
  for (const entry of results) {
    await maybeYieldEndRound();
    if (isTrainingRound || specialType === OCID_TYPE || isTargetRound) continue;
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
    const playerKey = getMedalKeyForNickLookup(room, entry.nick);
    if (!playerKey) continue;
    vocabInstallIdsByNick.set(entry.nick, vocabInstallIds);
    const vocabEntry = { installId, words, weeklyWords: words, ts: endedAt, nick: entry.nick };
    vocabEntries.push(vocabEntry);
    vocabLookups.push({
      installId,
      installIds: vocabInstallIds,
      playerKey,
      words,
      nick: entry.nick,
    });
  }
  const weeklyVocabRankBeforeOverrides = [];
  if (vocabLookups.length) {
    for (const lookup of vocabLookups) {
      await maybeYieldEndRound();
      const weeklyCountBefore = await getWeeklyVocabularyCountForInstallIds(
        lookup.installIds?.length ? lookup.installIds : [lookup.installId],
        endedAt
      );
      lookup.weeklyVocabCountBefore = weeklyCountBefore;
      weeklyVocabRankBeforeOverrides.push({
        playerKey: lookup.playerKey,
        nick: lookup.nick,
        weeklyVocabCount: weeklyCountBefore,
        achievedAt: endedAt,
      });
    }
  }
  const weeklyVocabRankBeforeMap = weeklyVocabRankBeforeOverrides.length
    ? await computeWeeklyVocabRankMap(endedAt, weeklyVocabRankBeforeOverrides)
    : new Map();
  if (vocabLookups.length) {
    for (const lookup of vocabLookups) {
      await maybeYieldEndRound();
      const knownWords = await getKnownVocabWordsForInstallIds(
        lookup.installIds?.length ? lookup.installIds : [lookup.installId],
        lookup.words
      );
      const newVocabWords = lookup.words.filter((word) => !knownWords.has(word));
      const resultEntry = resultsByNick.get(lookup.nick);
      if (resultEntry) {
        resultEntry.newVocabWords = newVocabWords;
        resultEntry.vocabWeeklyRank = {
          before: weeklyVocabRankBeforeMap.get(lookup.playerKey) || null,
          after: null,
          delta: 0,
        };
        resultEntry.vocabWeeklyRace = {
          beforeCount: Number(lookup.weeklyVocabCountBefore) || 0,
          afterCount: null,
        };
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
    const weeklyVocabRankAfterOverrides = [];
    const weeklyVocabCountAfterByPlayerKey = new Map();
    for (const entry of vocabEntries) {
      await maybeYieldEndRound();
      const summary = vocabSummary[entry.installId];
      if (!summary) continue;
      const playerKey = getMedalKeyForNickLookup(room, entry.nick);
      if (!playerKey) continue;
      const vocabInstallIds = vocabInstallIdsByNick.get(entry.nick) || [entry.installId];
      const totalCount = await getVocabularyCountForInstallIds(vocabInstallIds);
      recordVocabCount(playerKey, entry.nick, totalCount, endedAt);
      const weeklyCount = await getWeeklyVocabularyCountForInstallIds(vocabInstallIds, endedAt);
      recordWeeklyVocabCount(playerKey, entry.nick, weeklyCount, endedAt);
      weeklyVocabCountAfterByPlayerKey.set(playerKey, weeklyCount);
      weeklyVocabRankAfterOverrides.push({
        playerKey,
        nick: entry.nick,
        weeklyVocabCount: weeklyCount,
        achievedAt: endedAt,
      });
    }
    const weeklyVocabRankAfterMap = weeklyVocabRankAfterOverrides.length
      ? await computeWeeklyVocabRankMap(endedAt, weeklyVocabRankAfterOverrides)
      : new Map();
    for (const entry of vocabEntries) {
      await maybeYieldEndRound();
      const playerKey = getMedalKeyForNickLookup(room, entry.nick);
      if (!playerKey) continue;
      const resultEntry = resultsByNick.get(entry.nick);
      if (!resultEntry) continue;
      const before = Number(resultEntry?.vocabWeeklyRank?.before) || null;
      const after = weeklyVocabRankAfterMap.get(playerKey) || null;
      resultEntry.vocabWeeklyRank = {
        before,
        after,
        delta: Number.isFinite(before) && Number.isFinite(after) ? before - after : 0,
      };
      resultEntry.vocabWeeklyRace = {
        ...(resultEntry.vocabWeeklyRace || {}),
        beforeCount: Number(resultEntry.vocabWeeklyRace?.beforeCount) || 0,
        afterCount: Number(weeklyVocabCountAfterByPlayerKey.get(playerKey)) || 0,
      };
    }
  }

  results.sort((a, b) =>
    specialType === OCID_TYPE ? compareOcidRoundResultEntries(a, b) : b.score - a.score
  );
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
  const profileStatsUpdates = [];
  for (const entry of results) {
    await maybeYieldEndRound();
    if (isTrainingRound) continue;
    if (entry.isBot) continue;
    if (!entry.participated) continue;
    const playerKey = getMedalKeyForNickLookup(room, entry.nick);
    if (!playerKey) continue;
    const wordsCount = Array.isArray(entry.words) ? entry.words.length : 0;
    recordMostWordsInGame(playerKey, entry.nick, wordsCount, roundId, endedAt);
    recordBestRoundScore(playerKey, entry.nick, entry.score, roundId, endedAt);
    const highlights = isTargetRound
      ? { bestWord: null, longestWord: null }
      : computePlayerWordHighlightsForProfile(room.currentRound, entry);
    if (highlights.bestWord?.word) {
      recordBestWord(
        playerKey,
        entry.nick,
        highlights.bestWord.word,
        Number(highlights.bestWord.pts) || 0,
        endedAt
      );
    }
    if (highlights.longestWord?.word) {
      recordLongestWord(
        playerKey,
        entry.nick,
        highlights.longestWord.word,
        Number(highlights.longestWord.len) || 0,
        endedAt
      );
    }
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
    const userIdForProfile = Number(entry?.userId);
    if (Number.isInteger(userIdForProfile) && userIdForProfile > 0) {
      profileStatsUpdates.push({
        userId: userIdForProfile,
        nick: entry.nick,
        roundId,
        score: entry.score || 0,
        wordsCount,
        bestWord: highlights.bestWord,
        longestWord: highlights.longestWord,
        gobblesEarned,
        isTargetRound,
        targetFound: targetFoundAt.has(entry.nick),
        isSpecial3Round,
        ts: endedAt,
      });
    }
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
      scheduleInstallDuelCacheRefresh(installIdForDuel, 60_000);
    }
  }
  queuePlayerRoundStatsUpdates(profileStatsUpdates);

  console.log(
    `[${room.id}] Manche terminée ${room.currentRound.id}`,
    summarizeRoundResultsForLog(results)
  );

  // --- Mini-tournoi : attribution points & finale ---
  const tournamentRound = room.currentRound.tournamentRound || 1;
  const tournamentId = room.currentRound.tournamentId || room.tournament?.id || null;
  const t = room.tournament;
  const roundAwarded = new Map(); // nick -> { points, gobbles, total }

  if (!isTrainingRound && t && tournamentId && t.id === tournamentId) {
    const isFinalRound = tournamentRound === (t.totalRounds || TOURNAMENT_TOTAL_ROUNDS);
    const pointsMultiplier = isFinalRound ? 2 : 1;
    targetPointsMultiplier = pointsMultiplier;
    for (const entry of results) {
      await maybeYieldEndRound();
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
        await maybeYieldEndRound();
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
        await maybeYieldEndRound();
        const scoreVal = results[i]?.score ?? 0;
        const tieGroup = [];
        const tieKey = specialType === OCID_TYPE ? getOcidTournamentTieKey(results[i]) : null;
        while (
          i < results.length &&
          (results[i]?.score ?? 0) === scoreVal &&
          (specialType !== OCID_TYPE || getOcidTournamentTieKey(results[i]) === tieKey)
        ) {
          tieGroup.push(results[i]);
          i++;
        }

        const basePts = (TOURNAMENT_POINTS[pos - 1] ?? 0) * pointsMultiplier;
        for (const entry of tieGroup) {
          await maybeYieldEndRound();
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
      await maybeYieldEndRound();
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
    for (const [nick] of roundSubs.entries()) {
      await maybeYieldEndRound();
      const lookup = findPlayerByNick(room, nick);
      const player = lookup?.player || null;
      const connected = isPlayerConnected(player) || isBotToken(player?.token);
      if (!connected) continue;
      const meta = foundMeta.get(nick);
      targetResults.push({
        nick,
        score: meta ? meta.points : 0,
        words: meta ? [room.currentRound.targetWord || ""] : [],
        targetFoundAt: meta ? meta.ts : null,
        targetFoundMs: meta ? meta.elapsedMs : null,
        userId: Number.isInteger(Number(player?.userId)) ? Number(player.userId) : null,
        installId: player?.installId || null,
        team: getTeamForInstallCached(player?.installId),
        isBot: isBotToken(player?.token),
        isDailyChampion: isDailyChampionPlayer(player),
        weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForPlayer(player),
        isWeeklyVocabChampion: isWeeklyVocabChampionPlayer(player),
        connected,
        afk: isPlayerAfk(player),
        participated: !!meta,
        roundEligible: true,
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

  const liveHeadToHeadRoundType = getLiveHeadToHeadRoundType(room.currentRound);
  const liveHeadToHeadAllowsZeroScores = isTargetRound;
  const liveHeadToHeadParticipants = results
    .filter((entry) => {
      if (entry?.isBot) return false;
      if (!Number.isInteger(Number(entry?.userId)) || Number(entry.userId) <= 0) return false;
      const score = Number(entry?.score);
      if (!Number.isFinite(score)) return false;
      if (liveHeadToHeadAllowsZeroScores && !entry?.roundEligible && !entry?.participated) {
        return false;
      }
      return liveHeadToHeadAllowsZeroScores ? score >= 0 : score > 0;
    })
    .map((entry) => ({
      userId: Number(entry.userId),
      nick: entry.nick,
      score: Number(entry.score) || 0,
    }));
  if (!isTrainingRound && liveHeadToHeadParticipants.length >= 2) {
    queueLiveHeadToHeadUpdate({
      roundType: liveHeadToHeadRoundType,
      participants: liveHeadToHeadParticipants,
      includeZeroScores: liveHeadToHeadAllowsZeroScores,
      ts: endedAt,
    });
  }

  const endedRoundSnapshot = room.currentRound
    ? {
        grid: room.currentRound.grid,
        special: room.currentRound.special,
        targetWord: room.currentRound.targetWord || null,
      }
    : null;

  let totalRanking = [];
  if (!isTrainingRound && t && tournamentId && t.id === tournamentId) {
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
          weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForInstallId(installId, nick),
          isWeeklyVocabChampion: isWeeklyVocabChampionInstallId(installId, nick),
          afk: isPlayerAfk(findPlayerByNick(room, nick)?.player || null),
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

  if (isTrainingRound) {
    breakMs = TRAINING_BREAK_MS;
    breakKind = "training_end";
  }

  if (!isTrainingRound && t && tournamentRound === (t.totalRounds || TOURNAMENT_TOTAL_ROUNDS)) {
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
  const nextTournamentRoundForBreak =
    breakKind === "tournament_end" || breakKind === "training_end" ? 1 : tournamentRound + 1;
  const nextPlanForBreak =
    breakKind === "tournament_end" || breakKind === "training_end"
      ? null
      : getTournamentRoundPlan(room, nextTournamentRoundForBreak);
  const nextPlan =
    breakKind === "training_end" ? null : getTournamentRoundPlan(room, nextTournamentRoundForBreak);
  const nextSpecialForBreak = nextPlanForBreak?.isSpecial ? nextPlanForBreak : null;
  const roundEndedPayload = {
    roomId: room.id,
    roundId: room.currentRound.id,
    training: isTrainingRound,
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

  scheduleAmbientRoundEndBots(room, results, targetSummary);

  if (nextPlan && breakKind !== "tournament_end" && breakKind !== "training_end") {
    scheduleBreakPrecompute(
      room,
      endedRoundSnapshot,
      results,
      targetSummary,
      nextPlan,
      nextRoundNumber
    );
  }
  if (nextPlan && breakKind !== "tournament_end" && breakKind !== "training_end") {
    const preparingNoticeDelayMs = Math.max(0, breakMs - 900);
    setTimeout(() => {
      if (room.breakState?.nextStartAt !== nextStartAt) return;
      const hasReadyGrid =
        room.nextPreparedGrid?.roundNumber === nextRoundNumber ||
        matchesBufferedPreparedGrid(
          room,
          nextTournamentRoundForBreak,
          nextPlan,
          room.tournament?.id || null
        );
      if (hasReadyGrid) return;
      emitRoundPreparing(room, nextPlan, nextRoundNumber, nextTournamentRoundForBreak);
    }, preparingNoticeDelayMs);
  }
  setTimeout(() => {
    if (room.breakState?.nextStartAt !== nextStartAt) return;
    if (breakKind === "tournament_end" || breakKind === "training_end") {
      enterInterTournamentLobby(room);
      return;
    }
    startRoundForRoom(room).catch((e) => console.warn("startRoundForRoom failed", e));
  }, breakMs);
  const endRoundElapsed = Date.now() - endRoundStartedAt;
  if (endRoundElapsed > PERF_END_ROUND_WARN_MS) {
    console.warn(
      `[perf:${room.id}] endRound ${endRoundElapsed}ms results=${results.length} vocab=${vocabEntries.length} teamDuel=${teamDuelUpdates.size} special=${specialType || "normal"}`
    );
  }
  pruneRoomState(room);
}

io.on("connection", (socket) => {
  console.log("Client connecté", socket.id);
  emitRoomsStats();

  socket.on("timeSync", (_payload, cb) => {
    cb?.({ ok: true, serverNow: Date.now() });
  });

  socket.on("playtimeLimit:status", (_payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    cb?.({ ok: true, playtimeLimit: getPlaytimeLimitStatus(identity.userId) });
  });

  socket.on("playtimeLimit:set", (payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const limitMs = Math.round(Number(payload?.limitMs) || 0);
    const username =
      identity.user?.usernameDisplay ||
      identity.user?.usernameNormalized ||
      socket.data?.nick ||
      "";
    const result = setPlaytimeLimit({ userId: identity.userId, username, limitMs });
    cb?.(
      result.ok
        ? { ok: true, playtimeLimit: result.status }
        : {
            ok: false,
            error: result.error || "playtime_limit_failed",
            playtimeLimit: getPlaytimeLimitStatus(identity.userId),
          }
    );
  });

  socket.on("playtimeLimit:usage", (payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const now = Date.now();
    const requestedDeltaMs = Math.max(0, Math.round(Number(payload?.deltaMs) || 0));
    const deltaMs = Math.min(5 * 60 * 1000, requestedDeltaMs);
    socket.data.playtimeUsageLastAt = now;
    const username =
      identity.user?.usernameDisplay ||
      identity.user?.usernameNormalized ||
      socket.data?.nick ||
      "";
    const result = addPlaytimeUsage({ userId: identity.userId, username, deltaMs });
    cb?.({
      ok: result.ok !== false,
      playtimeLimit: result.status || getPlaytimeLimitStatus(identity.userId),
    });
  });

  socket.on("session:resume", async (payload, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = null;
    }
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const activeBan = getActiveModerationBan(identity);
    if (activeBan) {
      cb?.(buildModerationBanResponse(activeBan));
      return;
    }
    const playtimeStatus = getPlaytimeLimitStatus(identity.userId);
    if (playtimeStatus?.active && playtimeStatus.exhausted) {
      cb?.({ ...buildPlaytimeBlockedResponse(playtimeStatus), available: false });
      return;
    }
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
        clearPlayerAfkTimer(match.player);
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
        lastActivityAt: now,
      };
      room.players.set(socket.id, player);
      schedulePlayerAfkTransition(room, socket.id, player);
      room.nickToInstallId.set(player.nick, player.installId || installId);
      persistenceClient.upsertVocabularyProfile({ installId, nick: player.nick, updatedAt: now });
      try {
        await refreshInstallDuelCache(installId);
      } catch (_) {}
      socket.data.installId = installId;
      socket.data.userId = identity.userId;
      socket.data.nick = player.nick;
      socket.data.roomId = room.id;
      socket.data.playtimeUsageLastAt = Date.now();
      socket.roomId = room.id;
      socket.join(room.id);
      joinSocketToChatRoom(socket, room.id);
      emitPlayers(room);
      emitTournamentLobby(room);
      emitMedals(room);
      emitRoomsStats();
    }
    const snapshot = buildSessionSnapshot(room, player);
    cb?.({
      ok: true,
      available: true,
      snapshot,
      playtimeLimit: getPlaytimeLimitStatus(identity.userId),
    });
  });

  socket.on("login", async (payload, cb) => {
    const identity = requireSocketPlayerIdentity(socket, cb);
    if (!identity) return;
    const activeBan = getActiveModerationBan(identity);
    if (activeBan) {
      cb?.(buildModerationBanResponse(activeBan));
      return;
    }
    const playtimeStatus = getPlaytimeLimitStatus(identity.userId);
    if (playtimeStatus?.active && playtimeStatus.exhausted) {
      cb?.(buildPlaytimeBlockedResponse(playtimeStatus));
      return;
    }
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

    if (resumeSocketId && resumeSocketId !== socket.id) {
      clearPendingDisconnect(room, resumeSocketId);
      clearPlayerAfkTimer(room.players.get(resumeSocketId));
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
      lastActivityAt: now,
    });
    schedulePlayerAfkTransition(room, socket.id, room.players.get(socket.id));
    room.nickToInstallId.set(trimmed, installId);
    persistenceClient.upsertVocabularyProfile({ installId, nick: trimmed, updatedAt: now });
    try {
      await refreshInstallDuelCache(installId);
    } catch (_) {}
    socket.data.installId = installId;
    socket.data.userId = identity.userId;
    socket.data.nick = trimmed;
    socket.data.roomId = room.id;
    socket.data.playtimeUsageLastAt = Date.now();
    socket.roomId = room.id;
    socket.join(room.id);
    joinSocketToChatRoom(socket, room.id);
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
    emitTournamentLobby(room);
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
    } else {
      socket.emit("tournamentLobbyUpdate", buildTournamentLobbyPayload(room));
    }
  });

  socket.on("tournament:ready", (payload, cb) => {
    const room = getRoom(socket.roomId || payload?.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    if (isMaintenanceModeActive()) {
      cb?.({ ...buildMaintenanceBlockedPayload(), lobby: buildTournamentLobbyPayload(room) });
      emitTournamentLobby(room);
      return;
    }
    if (!isInterTournamentLobbyOpen(room)) {
      cb?.({ ok: false, error: "room_busy", lobby: buildTournamentLobbyPayload(room) });
      return;
    }
    markSocketPlayerActivity(room, socket, "ready");
    const readyKey = getPlayerReadyKey(player);
    if (!readyKey) {
      cb?.({ ok: false, error: "invalid_player" });
      return;
    }
    const lobby = ensureTournamentLobby(room);
    const requestedReady = payload && typeof payload === "object" && "ready" in payload
      ? !!payload.ready
      : !lobby.readyKeys.has(readyKey);
    if (requestedReady) lobby.readyKeys.add(readyKey);
    else lobby.readyKeys.delete(readyKey);
    emitPlayers(room);
    maybeStartTournamentCountdown(room);
    cb?.({ ok: true, ready: requestedReady, lobby: buildTournamentLobbyPayload(room) });
  });

  socket.on("player:activity", (payload = {}, cb) => {
    if (typeof payload === "function") {
      cb = payload;
      payload = {};
    }
    const room = getRoom(socket.roomId || payload?.roomId);
    if (!room?.players.has(socket.id)) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const rawKind = typeof payload?.kind === "string" ? payload.kind.trim() : "interaction";
    const kind = /^[a-z0-9:_-]{1,40}$/i.test(rawKind) ? rawKind : "interaction";
    const wasAfk = markSocketPlayerActivity(room, socket, kind);
    if (wasAfk) {
      emitPlayers(room);
      emitTournamentLobby(room);
      emitRoomsStats();
      maybeStartTournamentCountdown(room);
    }
    cb?.({ ok: true, active: true, transitioned: wasAfk });
  });

  socket.on("training:start", (payload, cb) => {
    const room = getRoom(socket.roomId || payload?.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    if (isMaintenanceModeActive()) {
      cb?.({ ...buildMaintenanceBlockedPayload(), lobby: buildTournamentLobbyPayload(room) });
      emitTournamentLobby(room);
      return;
    }
    markSocketPlayerActivity(room, socket, "training");
    startTrainingRound(room, payload?.type || "normal")
      .then((result) => cb?.(result))
      .catch((err) => {
        console.warn(`[${room.id}] training:start failed`, err);
        cb?.({ ok: false, error: "internal" });
      });
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
      joinSocketToChatRoom(socket, room.id);
    } else if (!player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    const resumedFromAfk = player
      ? markSocketPlayerActivity(room, socket, "chat")
      : false;
    if (resumedFromAfk) {
      emitPlayers(room);
      emitTournamentLobby(room);
      emitRoomsStats();
    }
    const rateLimit = checkTargetChatRateLimit(room, installId);
    if (!rateLimit.ok) {
      cb?.({
        ok: false,
        error: "rate_limited",
        retryMs: rateLimit.retryMs,
        message: "Attends quelques secondes avant de renvoyer un message.",
      });
      return;
    }
    const safeText = censorTargetSpoilersInChatText(room, trimmed);
    const replyTo = isPayloadObject ? resolveReplyPreviewFromPayload(room, payload.replyTo) : null;
    const message = {
      id: randomUUID(),
      t: Date.now(),
      roomId: room.id,
      nick: authorNick,
      userId: identity.userId,
      installId,
      text: safeText,
      team: getTeamForInstallCached(installId),
      isDailyChampion: isDailyChampionInstallId(installId),
      weeklyVocabPodiumRank: getWeeklyVocabPodiumRankForInstallId(installId, authorNick),
      isWeeklyVocabChampion: isWeeklyVocabChampionInstallId(installId, authorNick),
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
      joinSocketToChatRoom(socket, room.id);
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

    emitChatSocketEvent(io, room.id, "chat:message_reaction", {
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
      joinSocketToChatRoom(socket, room.id);
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
    emitChatSocketEvent(io, room.id, "chat:message_update", {
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
      joinSocketToChatRoom(socket, room.id);
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
    emitChatSocketEvent(io, room.id, "chat:message_delete", {
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
    joinSocketToChatRoom(socket, room.id);
    socket.emit("chat:history", Array.isArray(room.chatMessages) ? room.chatMessages : []);
    const identity = getSocketPlayerIdentity(socket);
    cb?.({
      ok: true,
      roomId: room.id,
      playtimeLimit: identity ? getPlaytimeLimitStatus(identity.userId) : null,
    });
  });

  socket.on("dev:controls:get", (_payload, cb) => {
    if (!areDevToolsAllowedForSocket(socket)) {
      cb?.({ ok: false, error: "dev_tools_unavailable", ...buildDevControlsPayload(socket) });
      return;
    }
    let targetChanged = false;
    targetChanged = ensureDevSelfRewardTarget(devControls, "selfCrown", socket) || targetChanged;
    targetChanged = ensureDevSelfRewardTarget(devControls, "selfGoldNick", socket) || targetChanged;
    targetChanged = ensureDevSelfRewardTarget(devControls, "selfSilverNick", socket) || targetChanged;
    targetChanged = ensureDevSelfRewardTarget(devControls, "selfBronzeNick", socket) || targetChanged;
    if (targetChanged) {
      persistDevControls();
      broadcastCrownUpdate();
    }
    cb?.({ ok: true, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:unlock", (payload, cb) => {
    if (!areDevToolsAllowedForSocket(socket)) {
      cb?.({ ok: false, error: "dev_tools_unavailable", ...buildDevControlsPayload(socket) });
      return;
    }
    socket.data.devToolsUnlocked = true;
    cb?.({ ok: true, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:lock", (_payload, cb) => {
    socket.data.devToolsUnlocked = true;
    cb?.({ ok: true, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:targetWait:catalog", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    try {
      const catalog = getTargetWaitDevCatalog({ limit: payload?.limit });
      cb?.({ ok: true, ...catalog });
    } catch (error) {
      console.warn("[target-wait] catalogue dev indisponible", error?.message || error);
      cb?.({ ok: false, error: "target_wait_catalog_unavailable" });
    }
  });

  socket.on("dev:controls:set", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const previous = normalizeDevControls(devControls);
    devControls = normalizeDevControls({ ...previous, ...(payload || {}) });
    applyDevSelfRewardTargetPatch(previous, devControls, payload, socket);
    persistDevControls();
    applyMaintenanceModeChange(previous, devControls);
    if (previous.botsEnabled !== devControls.botsEnabled) {
      botManager?.setBotsEnabled?.(devControls.botsEnabled);
    }
    if (previous.animatorBotsEnabled !== devControls.animatorBotsEnabled) {
      botManager?.setAnimatorBotsEnabled?.(devControls.animatorBotsEnabled);
    }
    for (const room of rooms.values()) {
      room.nextPreparedGrid = null;
      room.nextPreparedGridPromise = null;
      room.nextPreparedGridPromiseRoundNumber = null;
      room.bufferedPreparedGrid = null;
      room.bufferedPreparedGridPromise = null;
      room.bufferedPreparedGridPromiseMeta = null;
      room.devForcedRoundPickCache = new Map();
      if (!previous.chatFill && devControls.chatFill) {
        fillDevChat(room, 80);
      } else if (previous.chatFill && !devControls.chatFill) {
        clearDevChat(room);
      }
      emitMedals(room);
    }
    if (
      previous.selfCrown !== devControls.selfCrown ||
      previous.selfGoldNick !== devControls.selfGoldNick ||
      previous.selfSilverNick !== devControls.selfSilverNick ||
      previous.selfBronzeNick !== devControls.selfBronzeNick ||
      previous.selfCrownTargetUserId !== devControls.selfCrownTargetUserId ||
      previous.selfCrownTargetInstallId !== devControls.selfCrownTargetInstallId ||
      previous.selfCrownTargetNick !== devControls.selfCrownTargetNick ||
      previous.selfGoldNickTargetUserId !== devControls.selfGoldNickTargetUserId ||
      previous.selfGoldNickTargetInstallId !== devControls.selfGoldNickTargetInstallId ||
      previous.selfGoldNickTargetNick !== devControls.selfGoldNickTargetNick ||
      previous.selfSilverNickTargetUserId !== devControls.selfSilverNickTargetUserId ||
      previous.selfSilverNickTargetInstallId !== devControls.selfSilverNickTargetInstallId ||
      previous.selfSilverNickTargetNick !== devControls.selfSilverNickTargetNick ||
      previous.selfBronzeNickTargetUserId !== devControls.selfBronzeNickTargetUserId ||
      previous.selfBronzeNickTargetInstallId !== devControls.selfBronzeNickTargetInstallId ||
      previous.selfBronzeNickTargetNick !== devControls.selfBronzeNickTargetNick
    ) {
      broadcastCrownUpdate();
    }
    cb?.({ ok: true, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:returnToLiveLobby", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room", ...buildDevControlsPayload(socket) });
      return;
    }
    const interrupted = returnRoomToLiveLobby(room, "dev_button");
    cb?.({ ok: true, interrupted, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:chat:fill", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const count = fillDevChat(room, payload?.count || 80);
    cb?.({ ok: true, count });
  });

  socket.on("dev:chat:clear", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const count = clearDevChat(room);
    cb?.({ ok: true, count });
  });

  socket.on("dev:globalAnnouncement", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const body = sanitizeDevGlobalAnnouncement(payload?.message || payload?.body || "");
    if (!body) {
      cb?.({ ok: false, error: "empty_message" });
      return;
    }
    const account = getSocketDevAccount(socket);
    const createdAt = Date.now();
    const message = {
      id: `dev-global-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      title: "Annonce serveur",
      body,
      createdAt,
      author: account?.label || socket.data?.nick || "",
    };
    io.emit("dev:globalAnnouncement", message);
    console.log(
      `[dev] global announcement by ${message.author || "unknown"}: ${body.slice(0, 140)}`
    );
    cb?.({ ok: true, message, ...buildDevControlsPayload(socket) });
  });

  socket.on("dev:playtimeLimits:list", (_payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    cb?.({ ok: true, limits: listActivePlaytimeLimits() });
  });

  socket.on("dev:playtimeLimits:clear", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const userId = Number(payload?.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      cb?.({ ok: false, error: "invalid_user", limits: listActivePlaytimeLimits() });
      return;
    }
    const result = clearPlaytimeLimit(userId);
    cb?.({
      ok: result.ok,
      removed: !!result.removed,
      limits: listActivePlaytimeLimits(),
    });
  });

  socket.on("dev:bots:list", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    cb?.({
      ok: true,
      roomId: room.id,
      bots:
        typeof botManager?.listBotsForRoom === "function"
          ? botManager.listBotsForRoom(room)
          : [],
    });
  });

  socket.on("dev:bots:set", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const nick = typeof payload?.nick === "string" ? payload.nick.trim() : "";
    const active = !!payload?.active;
    const duration = typeof payload?.duration === "string" ? payload.duration : "rounds:3";
    const result =
      typeof botManager?.setBotActive === "function"
        ? botManager.setBotActive(room, nick, active, duration)
        : { ok: false, error: "bots_unavailable" };
    cb?.({
      ...result,
      roomId: room.id,
      bots:
        typeof botManager?.listBotsForRoom === "function"
          ? botManager.listBotsForRoom(room)
          : [],
    });
  });

  socket.on("dev:bots:setAll", (payload, cb) => {
    if (!requireDevToolsAccess(socket, cb)) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room" });
      return;
    }
    const active = payload?.active !== false;
    const result =
      typeof botManager?.setAllBotsActive === "function"
        ? botManager.setAllBotsActive(room, active, "manual")
        : { ok: false, error: "bots_unavailable" };
    cb?.({
      ...result,
      roomId: room.id,
      bots:
        typeof botManager?.listBotsForRoom === "function"
          ? botManager.listBotsForRoom(room)
          : [],
    });
  });

  socket.on("moderation:state", (payload, cb) => {
    const account = requireModerationAccess(socket, cb);
    if (!account) return;
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room", ...buildModerationPayload(socket) });
      return;
    }
    cb?.({
      ok: true,
      ...buildModerationPayload(socket),
      roomId: room.id,
      players: listModerationPlayers(room),
    });
  });

  socket.on("moderation:action", (payload, cb) => {
    const moderator = requireModerationAccess(socket, cb);
    if (!moderator) return;
    const action = typeof payload?.action === "string" ? payload.action.trim() : "";
    if (action !== "kick" && action !== "ban_5m") {
      cb?.({ ok: false, error: "invalid_action", ...buildModerationPayload(socket) });
      return;
    }
    const requestedRoomId =
      payload && typeof payload.roomId === "string" ? payload.roomId : null;
    const room = getRoom(requestedRoomId || socket.roomId || socket.data?.chatRoomId || "room-4x4");
    if (!room) {
      cb?.({ ok: false, error: "invalid_room", ...buildModerationPayload(socket) });
      return;
    }
    const target = findModerationTarget(room, payload || {});
    if (!target?.player) {
      cb?.({
        ok: false,
        error: "target_not_found",
        ...buildModerationPayload(socket),
        players: listModerationPlayers(room),
      });
      return;
    }
    const moderatorIdentity = getSocketPlayerIdentity(socket);
    const targetUserId = Number.isInteger(Number(target.player?.userId))
      ? Number(target.player.userId)
      : null;
    const targetInstallId = normalizeInstallId(target.player?.installId || "");
    if (
      (targetUserId && Number(moderatorIdentity?.userId) === targetUserId) ||
      (targetInstallId && normalizeInstallId(moderatorIdentity?.installId || "") === targetInstallId)
    ) {
      cb?.({ ok: false, error: "cannot_target_self", ...buildModerationPayload(socket) });
      return;
    }
    const now = Date.now();
    const until = action === "ban_5m" ? now + MODERATION_BAN_5_MIN_MS : null;
    if (until) {
      if (targetInstallId) {
        moderationInstallBans.set(targetInstallId, {
          expiresAt: until,
          action,
          moderator: moderator.label || "",
          targetNick: target.player.nick || "",
        });
      }
      if (targetUserId) {
        moderationUserBans.set(String(targetUserId), {
          expiresAt: until,
          action,
          moderator: moderator.label || "",
          targetNick: target.player.nick || "",
        });
      }
    }
    const message =
      action === "ban_5m"
        ? "Tu as été exclu du live pendant 5 minutes par modération."
        : "Tu as été retiré du live par modération.";
    const notice = {
      action,
      roomId: room.id,
      message,
      until,
      durationMs: until ? MODERATION_BAN_5_MIN_MS : null,
      targetNick: target.player.nick || "",
    };
    appendModerationLog({
      t: now,
      roomId: room.id,
      action,
      moderatorUserId: moderator.userId || null,
      moderator: moderator.label || "",
      targetSocketId: target.socketId,
      targetUserId,
      targetInstallId,
      targetNick: target.player.nick || "",
      until,
      ip: getClientIpFromSocket(socket),
    });
    removeSocketPlayerFromRoom(room, target.socketId, notice);
    cb?.({
      ok: true,
      ...buildModerationPayload(socket),
      roomId: room.id,
      action,
      targetNick: target.player.nick || "",
      until,
      players: listModerationPlayers(room),
    });
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
      const weeklyCount = await getWeeklyVocabularyCountForInstallIds(
        installIds.length ? installIds : [installId]
      );
      cb?.({ count, weeklyCount });
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
    markSocketPlayerActivity(room, socket, "special3");
    const result = updateSpecial3WordsState(room, {
      roundId: payload?.roundId,
      nick: player?.nick,
      wordSlots: payload?.wordSlots,
      specialPlacements: payload?.specialPlacements,
    });
    cb?.(result);
  });

  socket.on("ocid:propose", (payload, cb) => {
    const room = getRoom(socket.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    markSocketPlayerActivity(room, socket, "ocid_propose");
    const result = submitOcidProposalForNick(room, {
      roundId: payload?.roundId,
      nick: player.nick,
      word: payload?.word,
      path: payload?.path,
    });
    cb?.(result);
  });

  socket.on("ocid:clearProposal", (payload, cb) => {
    const room = getRoom(socket.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    markSocketPlayerActivity(room, socket, "ocid_clear");
    const result = clearOcidProposalForNick(room, {
      roundId: payload?.roundId,
      nick: player.nick,
    });
    cb?.(result);
  });

  socket.on("ocid:vote", (payload, cb) => {
    const room = getRoom(socket.roomId);
    const player = room?.players.get(socket.id);
    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in" });
      return;
    }
    markSocketPlayerActivity(room, socket, "ocid_vote");
    const result = submitOcidVoteForNick(room, {
      roundId: payload?.roundId,
      nick: player.nick,
      optionId: payload?.optionId,
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
    markSocketPlayerActivity(room, socket, "submit_word");
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
    const batchStartedAt = Date.now();
    const clientSeq = Number.isFinite(payload?.clientSeq) ? payload.clientSeq : null;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const room = getRoom(socket.roomId);
    const player = room?.players.get(socket.id);
    const roundId = payload?.roundId || null;

    if (!room || !player) {
      cb?.({ ok: false, error: "not_logged_in", clientSeq, results: [] });
      return;
    }
    markSocketPlayerActivity(room, socket, "submit_words_batch");
    if (!roundId || items.length === 0) {
      cb?.({ ok: false, error: "invalid_payload", clientSeq, results: [] });
      return;
    }

    const results = [];
    let acceptedCount = 0;
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
        deferRankingBroadcast: true,
      });
      if (res?.ok) acceptedCount += 1;
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
    if (acceptedCount > 0) {
      bumpRoomPerfCounter(room, "batchWords", acceptedCount);
      maybeAnnounceCloseFight(room);
      broadcastProvisionalRanking(room);
    }
    const batchElapsed = Date.now() - batchStartedAt;
    if (batchElapsed > PERF_SUBMIT_BATCH_WARN_MS) {
      console.warn(
        `[perf:${room.id}] submitWordsBatch ${batchElapsed}ms items=${items.length} accepted=${acceptedCount}`
      );
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
    clearPlayerAfkTimer(player);
    const readyKey = getPlayerReadyKey(player);
    if (readyKey) {
      ensureTournamentLobby(room).readyKeys.delete(readyKey);
    }
    player.connected = false;
    player.lastSeenAt = now;
    clearPendingDisconnect(room, socket.id);
    emitPlayers(room);
    emitTournamentLobby(room);
    emitRoomsStats();
    const timer = setTimeout(() => {
      clearPendingDisconnect(room, socket.id);
      const current = room.players.get(socket.id);
      if (current) {
        clearPlayerAfkTimer(current);
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
  submitOcidProposalForNick,
  clearOcidProposalForNick,
  submitOcidVoteForNick,
  emitPlayers,
  emitMedals,
  broadcastProvisionalRanking,
  botsEnabled: devControls.botsEnabled,
  animatorBotsEnabled: devControls.animatorBotsEnabled,
});

const PORT = 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on *:${PORT}`);
});

rooms.forEach((room) => enterInterTournamentLobby(room));

const dailyToday = getParisDateId();
void ensureDaily(dailyToday);
void refreshConnectedPlayersDuelCache();

const DAILY_TOMORROW_PREP_DELAY_MS = 90 * 1000;
setTimeout(() => {
  const tomorrow = addDaysToDateId(getParisDateId(), 1);
  void ensureDaily(tomorrow);
}, DAILY_TOMORROW_PREP_DELAY_MS).unref?.();

const DAILY_MAINTENANCE_PARIS_HOUR = 4;
const DAILY_MAINTENANCE_PARIS_MINUTE = 15;

function getParisTimeParts(date = new Date()) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value || 0),
    minute: Number(parts.find((part) => part.type === "minute")?.value || 0),
    second: Number(parts.find((part) => part.type === "second")?.value || 0),
  };
}

function getDelayUntilNextDailyMaintenanceMs() {
  const { hour, minute, second } = getParisTimeParts();
  const nowSeconds = hour * 3600 + minute * 60 + second;
  const targetSeconds =
    DAILY_MAINTENANCE_PARIS_HOUR * 3600 + DAILY_MAINTENANCE_PARIS_MINUTE * 60;
  const delaySeconds =
    nowSeconds < targetSeconds
      ? targetSeconds - nowSeconds
      : 24 * 3600 - nowSeconds + targetSeconds;
  return Math.max(60 * 1000, delaySeconds * 1000);
}

function runDailyMaintenance() {
  const today = getParisDateId();
  const tomorrow = addDaysToDateId(today, 1);
  void ensureDaily(today);
  void ensureDaily(tomorrow);
  void refreshConnectedPlayersDuelCache();
  scheduleDailyMaintenance();
}

function scheduleDailyMaintenance() {
  const timer = setTimeout(runDailyMaintenance, getDelayUntilNextDailyMaintenanceMs());
  timer.unref?.();
}

scheduleDailyMaintenance();
