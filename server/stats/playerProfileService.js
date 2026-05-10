import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

import { getWeeklyNickForInstallId, getWeeklyPlayerSnapshot } from "./weeklyStatsService.js";
import { getVocabularySnapshot } from "./vocabularyService.js";
import { getTrophyStatus } from "./trophyService.js";
import { getWeeklyDuelRecap, getDuelNickForInstallId } from "./teamDuelService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : path.join(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "gobble.db");

let db = null;
let initPromise = null;
let writeQueue = Promise.resolve();
const SQLITE_BUSY_MAX_RETRIES = 30;
const SQLITE_BUSY_RETRY_BASE_MS = 80;

function isSqliteBusyError(err) {
  const code = String(err?.code || "").toUpperCase();
  const msg = String(err?.message || "").toLowerCase();
  return code === "SQLITE_BUSY" || msg.includes("database is locked") || msg.includes("sqlite_busy");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithBusyRetry(task, retries = SQLITE_BUSY_MAX_RETRIES) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (err) {
      if (!isSqliteBusyError(err) || attempt >= retries) throw err;
      await sleep(SQLITE_BUSY_RETRY_BASE_MS * (attempt + 1));
    }
  }
}

function runSerializedWrite(task) {
  const execute = () => runWithBusyRetry(task);
  const next = writeQueue.then(execute, execute);
  writeQueue = next.catch(() => {});
  return next;
}

async function runInImmediateTransaction(task) {
  await db.exec("BEGIN IMMEDIATE");
  let committed = false;
  try {
    const result = await task();
    await db.exec("COMMIT");
    committed = true;
    return result;
  } catch (err) {
    if (!committed) {
      try {
        await db.exec("ROLLBACK");
      } catch (_) {}
    }
    throw err;
  }
}

function normalizeInstallId(installId) {
  return String(installId || "").trim();
}

function normalizeUserId(userId) {
  const safeUserId = Number(userId);
  return Number.isInteger(safeUserId) && safeUserId > 0 ? String(safeUserId) : "";
}

function normalizeRoundType(roundType) {
  const safeType = String(roundType || "").trim();
  if (safeType === "target") return "target";
  if (safeType === "special3") return "special3";
  if (safeType === "bonusLetter") return "bonusLetter";
  if (safeType === "fakeTwins") return "fakeTwins";
  return "normal";
}

function normalizeNick(nick) {
  return String(nick || "").trim().slice(0, 25);
}

function finiteInt(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : fallback;
}

function publicRecord(entry, fields = []) {
  if (!entry || typeof entry !== "object") return null;
  const out = {};
  for (const field of fields) {
    if (entry[field] != null) out[field] = entry[field];
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeLifetimeRow(row) {
  if (!row) {
    return {
      nick: "",
      roundsPlayed: 0,
      totalScore: 0,
      wordsFound: 0,
      bestRoundScore: 0,
      bestWord: null,
      longestWord: null,
      gobbles: 0,
      doubleGobbles: 0,
      targetRoundsPlayed: 0,
      targetRoundsFound: 0,
      special3RoundsPlayed: 0,
      bestSpecial3Score: 0,
      createdAt: 0,
      updatedAt: 0,
    };
  }
  return {
    nick: normalizeNick(row.nick),
    roundsPlayed: finiteInt(row.roundsPlayed),
    totalScore: finiteInt(row.totalScore),
    wordsFound: finiteInt(row.wordsFound),
    bestRoundScore: finiteInt(row.bestRoundScore),
    bestRoundId: String(row.bestRoundId || ""),
    bestWord:
      row.bestWord && finiteInt(row.bestWordScore) > 0
        ? { word: String(row.bestWord), pts: finiteInt(row.bestWordScore) }
        : null,
    longestWord:
      row.longestWord && finiteInt(row.longestWordLength) > 0
        ? { word: String(row.longestWord), len: finiteInt(row.longestWordLength) }
        : null,
    gobbles: finiteInt(row.gobbles),
    doubleGobbles: finiteInt(row.doubleGobbles),
    targetRoundsPlayed: finiteInt(row.targetRoundsPlayed),
    targetRoundsFound: finiteInt(row.targetRoundsFound),
    special3RoundsPlayed: finiteInt(row.special3RoundsPlayed),
    bestSpecial3Score: finiteInt(row.bestSpecial3Score),
    createdAt: finiteInt(row.createdAt),
    updatedAt: finiteInt(row.updatedAt),
  };
}

export async function initPlayerProfileService() {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      db = await open({ filename: DB_PATH, driver: sqlite3.Database });
      await db.exec("PRAGMA journal_mode = WAL;");
      await db.exec("PRAGMA busy_timeout = 15000;");
      await db.exec(`
        CREATE TABLE IF NOT EXISTS player_lifetime_stats (
          installId TEXT PRIMARY KEY,
          nick TEXT NOT NULL DEFAULT '',
          roundsPlayed INTEGER NOT NULL DEFAULT 0,
          totalScore INTEGER NOT NULL DEFAULT 0,
          wordsFound INTEGER NOT NULL DEFAULT 0,
          bestRoundScore INTEGER NOT NULL DEFAULT 0,
          bestRoundId TEXT,
          bestWord TEXT,
          bestWordScore INTEGER NOT NULL DEFAULT 0,
          longestWord TEXT,
          longestWordLength INTEGER NOT NULL DEFAULT 0,
          gobbles INTEGER NOT NULL DEFAULT 0,
          doubleGobbles INTEGER NOT NULL DEFAULT 0,
          targetRoundsPlayed INTEGER NOT NULL DEFAULT 0,
          targetRoundsFound INTEGER NOT NULL DEFAULT 0,
          special3RoundsPlayed INTEGER NOT NULL DEFAULT 0,
          bestSpecial3Score INTEGER NOT NULL DEFAULT 0,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        );
      `);
      await db.exec(`
        CREATE TABLE IF NOT EXISTS player_live_head_to_head (
          playerAUserId TEXT NOT NULL,
          playerBUserId TEXT NOT NULL,
          roundType TEXT NOT NULL,
          playerAWins INTEGER NOT NULL DEFAULT 0,
          playerBWins INTEGER NOT NULL DEFAULT 0,
          draws INTEGER NOT NULL DEFAULT 0,
          roundsPlayed INTEGER NOT NULL DEFAULT 0,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          PRIMARY KEY (playerAUserId, playerBUserId, roundType)
        );
      `);
      return db;
    })();
  }
  try {
    return await initPromise;
  } catch (err) {
    console.warn("Player profile service init failed", err);
    db = null;
    initPromise = null;
    return null;
  }
}

export async function recordPlayerRoundStats({
  userId,
  installId,
  nick = "",
  roundId = "",
  score = 0,
  wordsCount = 0,
  bestWord = null,
  longestWord = null,
  gobblesEarned = 0,
  isTargetRound = false,
  targetFound = false,
  isSpecial3Round = false,
  ts = Date.now(),
} = {}) {
  const safeUserId = normalizeUserId(userId);
  const safeProfileKey = safeUserId || normalizeInstallId(installId);
  if (!safeProfileKey) return null;
  const ready = await initPlayerProfileService();
  if (!ready) return null;
  const safeNick = normalizeNick(nick);
  const safeScore = finiteInt(score);
  const safeWordsCount = finiteInt(wordsCount);
  const bestWordText = isTargetRound ? "" : String(bestWord?.word || "").trim().slice(0, 40);
  const bestWordScore = isTargetRound ? 0 : finiteInt(bestWord?.pts);
  const longestWordText = isTargetRound
    ? ""
    : String(longestWord?.word || "").trim().slice(0, 40);
  const longestWordLength = isTargetRound
    ? 0
    : finiteInt(longestWord?.len || longestWordText.length);
  const gobbles = finiteInt(gobblesEarned);
  const doubleGobbles = gobbles >= 2 ? 1 : 0;
  const targetRoundsPlayed = isTargetRound ? 1 : 0;
  const targetRoundsFound = isTargetRound && targetFound ? 1 : 0;
  const special3RoundsPlayed = isSpecial3Round ? 1 : 0;
  const bestSpecial3Score = isSpecial3Round ? safeScore : 0;
  const safeTs = finiteInt(ts, Date.now());

  return runSerializedWrite(async () => {
    await db.run(
      `INSERT INTO player_lifetime_stats (
         installId, nick, roundsPlayed, totalScore, wordsFound,
         bestRoundScore, bestRoundId, bestWord, bestWordScore, longestWord,
         longestWordLength, gobbles, doubleGobbles, targetRoundsPlayed,
         targetRoundsFound, special3RoundsPlayed, bestSpecial3Score, createdAt, updatedAt
       )
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(installId) DO UPDATE SET
         nick = CASE WHEN excluded.nick <> '' THEN excluded.nick ELSE player_lifetime_stats.nick END,
         roundsPlayed = player_lifetime_stats.roundsPlayed + 1,
         totalScore = player_lifetime_stats.totalScore + excluded.totalScore,
         wordsFound = player_lifetime_stats.wordsFound + excluded.wordsFound,
         bestRoundScore = MAX(player_lifetime_stats.bestRoundScore, excluded.bestRoundScore),
         bestRoundId = CASE
           WHEN excluded.bestRoundScore > player_lifetime_stats.bestRoundScore
           THEN excluded.bestRoundId
           ELSE player_lifetime_stats.bestRoundId
         END,
         bestWord = CASE
           WHEN excluded.bestWordScore > player_lifetime_stats.bestWordScore
           THEN excluded.bestWord
           ELSE player_lifetime_stats.bestWord
         END,
         bestWordScore = MAX(player_lifetime_stats.bestWordScore, excluded.bestWordScore),
         longestWord = CASE
           WHEN excluded.longestWordLength > player_lifetime_stats.longestWordLength
           THEN excluded.longestWord
           ELSE player_lifetime_stats.longestWord
         END,
         longestWordLength = MAX(player_lifetime_stats.longestWordLength, excluded.longestWordLength),
         gobbles = player_lifetime_stats.gobbles + excluded.gobbles,
         doubleGobbles = player_lifetime_stats.doubleGobbles + excluded.doubleGobbles,
         targetRoundsPlayed = player_lifetime_stats.targetRoundsPlayed + excluded.targetRoundsPlayed,
         targetRoundsFound = player_lifetime_stats.targetRoundsFound + excluded.targetRoundsFound,
         special3RoundsPlayed = player_lifetime_stats.special3RoundsPlayed + excluded.special3RoundsPlayed,
         bestSpecial3Score = MAX(player_lifetime_stats.bestSpecial3Score, excluded.bestSpecial3Score),
         updatedAt = excluded.updatedAt`,
      safeProfileKey,
      safeNick,
      safeScore,
      safeWordsCount,
      safeScore,
      String(roundId || "").slice(0, 120),
      bestWordText,
      bestWordScore,
      longestWordText,
      longestWordLength,
      gobbles,
      doubleGobbles,
      targetRoundsPlayed,
      targetRoundsFound,
      special3RoundsPlayed,
      bestSpecial3Score,
      safeTs,
      safeTs
    );
    return { ok: true, profileKey: safeProfileKey };
  });
}

export async function recordLiveHeadToHeadOutcomes({
  roundType = "normal",
  participants = [],
  ts = Date.now(),
} = {}) {
  const safeRoundType = normalizeRoundType(roundType);
  const safeTs = finiteInt(ts, Date.now());
  const cleanParticipants = Array.isArray(participants)
    ? participants
        .map((participant) => ({
          userId: normalizeUserId(participant?.userId),
          nick: normalizeNick(participant?.nick),
          score: Number(participant?.score),
        }))
        .filter(
          (participant) =>
            participant.userId && Number.isFinite(participant.score) && participant.score > 0
        )
    : [];
  const byUser = new Map();
  for (const participant of cleanParticipants) {
    const current = byUser.get(participant.userId);
    if (!current || participant.score > current.score) {
      byUser.set(participant.userId, participant);
    }
  }
  const players = Array.from(byUser.values());
  if (players.length < 2) return 0;
  const ready = await initPlayerProfileService();
  if (!ready) return 0;

  return runSerializedWrite(() => runInImmediateTransaction(async () => {
    let recorded = 0;
    for (let i = 0; i < players.length; i += 1) {
      for (let j = i + 1; j < players.length; j += 1) {
        const first = players[i];
        const second = players[j];
        const [a, b] =
          Number(first.userId) < Number(second.userId) ? [first, second] : [second, first];
        const aWins = a.score > b.score ? 1 : 0;
        const bWins = b.score > a.score ? 1 : 0;
        const draws = a.score === b.score ? 1 : 0;
        await db.run(
          `INSERT INTO player_live_head_to_head (
             playerAUserId, playerBUserId, roundType, playerAWins, playerBWins,
             draws, roundsPlayed, createdAt, updatedAt
           )
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(playerAUserId, playerBUserId, roundType) DO UPDATE SET
             playerAWins = player_live_head_to_head.playerAWins + excluded.playerAWins,
             playerBWins = player_live_head_to_head.playerBWins + excluded.playerBWins,
             draws = player_live_head_to_head.draws + excluded.draws,
             roundsPlayed = player_live_head_to_head.roundsPlayed + 1,
             updatedAt = excluded.updatedAt`,
          a.userId,
          b.userId,
          safeRoundType,
          aWins,
          bWins,
          draws,
          safeTs,
          safeTs
        );
        recorded += 1;
      }
    }
    return recorded;
  }));
}

export async function getPlayerLifetimeStats(installId) {
  const safeInstallId = normalizeInstallId(installId);
  if (!safeInstallId) return sanitizeLifetimeRow(null);
  const ready = await initPlayerProfileService();
  if (!ready) return sanitizeLifetimeRow(null);
  try {
    const row = await runWithBusyRetry(() =>
      db.get("SELECT * FROM player_lifetime_stats WHERE installId = ?", safeInstallId)
    );
    return sanitizeLifetimeRow(row);
  } catch (err) {
    console.warn("Player lifetime stats read failed", err);
    return sanitizeLifetimeRow(null);
  }
}

async function getLiveHeadToHeadSummary(viewerUserId, targetUserId) {
  const safeViewerUserId = normalizeUserId(viewerUserId);
  const safeTargetUserId = normalizeUserId(targetUserId);
  if (!safeViewerUserId || !safeTargetUserId || safeViewerUserId === safeTargetUserId) {
    return null;
  }
  const ready = await initPlayerProfileService();
  if (!ready) return null;
  const [aId, bId] =
    Number(safeViewerUserId) < Number(safeTargetUserId)
      ? [safeViewerUserId, safeTargetUserId]
      : [safeTargetUserId, safeViewerUserId];
  const viewerIsA = safeViewerUserId === aId;
  const rows = await runWithBusyRetry(() =>
    db.all(
      `SELECT roundType, playerAWins, playerBWins, draws, roundsPlayed, updatedAt
       FROM player_live_head_to_head
       WHERE playerAUserId = ? AND playerBUserId = ?`,
      aId,
      bId
    )
  ).catch((err) => {
    console.warn("Live head-to-head read failed", err);
    return [];
  });
  const byType = {};
  const total = {
    viewerWins: 0,
    targetWins: 0,
    draws: 0,
    roundsPlayed: 0,
    updatedAt: 0,
  };
  for (const row of Array.isArray(rows) ? rows : []) {
    const viewerWins = finiteInt(viewerIsA ? row.playerAWins : row.playerBWins);
    const targetWins = finiteInt(viewerIsA ? row.playerBWins : row.playerAWins);
    const draws = finiteInt(row.draws);
    const roundsPlayed = finiteInt(row.roundsPlayed);
    const updatedAt = finiteInt(row.updatedAt);
    const entry = {
      viewerWins,
      targetWins,
      draws,
      roundsPlayed,
      updatedAt,
    };
    byType[normalizeRoundType(row.roundType)] = entry;
    total.viewerWins += viewerWins;
    total.targetWins += targetWins;
    total.draws += draws;
    total.roundsPlayed += roundsPlayed;
    total.updatedAt = Math.max(total.updatedAt, updatedAt);
  }
  return {
    viewerUserId: Number(safeViewerUserId),
    targetUserId: Number(safeTargetUserId),
    total,
    byType,
  };
}

export async function getPublicPlayerProfileByUserId(
  userId,
  { fallbackNick = "", viewerUserId = null } = {}
) {
  const safeUserId = normalizeUserId(userId);
  if (!safeUserId) return null;

  const [lifetime, weekly, vocabulary, trophies, duelRecap] = await Promise.all([
    getPlayerLifetimeStats(safeUserId),
    Promise.resolve(getWeeklyPlayerSnapshot(safeUserId)),
    getVocabularySnapshot(safeUserId),
    getTrophyStatus(safeUserId).catch(() => null),
    getWeeklyDuelRecap(null, safeUserId).catch(() => null),
  ]);

  const nick =
    normalizeNick(fallbackNick) ||
    normalizeNick(vocabulary?.nick) ||
    normalizeNick(lifetime?.nick) ||
    normalizeNick(getWeeklyNickForInstallId(safeUserId)) ||
    normalizeNick(getDuelNickForInstallId(safeUserId)) ||
    "Joueur";
  const currentWeek = weekly?.currentWeek || {};
  const weeklyAllTime = weekly?.allTime || {};
  const duelContribution = duelRecap?.myContribution || null;

  return {
    userId: Number(safeUserId),
    nick,
    lifetime,
    weekly: {
      playerKey: weekly?.playerKey || `install:${safeUserId}`,
      currentWeek: {
        totalScore: publicRecord(currentWeek.totalScore, ["totalScore", "roundsPlayed", "achievedAt"]),
        medals: publicRecord(currentWeek.medals, ["gold", "silver", "bronze", "total", "achievedAt"]),
        bestWord: publicRecord(currentWeek.bestWord, ["word", "pts", "achievedAt"]),
        longestWord: publicRecord(currentWeek.longestWord, ["word", "len", "achievedAt"]),
        bestRoundScore: publicRecord(currentWeek.bestRoundScore, ["pts", "roundId", "achievedAt"]),
        bestSpecial3Score: publicRecord(currentWeek.bestSpecial3Score, ["pts", "roundId", "achievedAt"]),
        mostWordsInGame: publicRecord(currentWeek.mostWordsInGame, [
          "wordsCount",
          "roundId",
          "achievedAt",
        ]),
        mostGobbles: publicRecord(currentWeek.mostGobbles, ["gobbles", "achievedAt"]),
      },
      allTime: {
        weeksWithStats: finiteInt(weeklyAllTime.weeksWithStats),
        medals: weeklyAllTime.medals || { gold: 0, silver: 0, bronze: 0, total: 0 },
        totalScore: finiteInt(weeklyAllTime.totalScore),
        roundsPlayed: finiteInt(weeklyAllTime.roundsPlayed),
        mostGobbles: finiteInt(weeklyAllTime.mostGobbles),
        bestWord: publicRecord(weeklyAllTime.bestWord, ["word", "pts", "achievedAt"]),
        longestWord: publicRecord(weeklyAllTime.longestWord, ["word", "len", "achievedAt"]),
        bestRoundScore: publicRecord(weeklyAllTime.bestRoundScore, ["pts", "roundId", "achievedAt"]),
        bestSpecial3Score: publicRecord(weeklyAllTime.bestSpecial3Score, [
          "pts",
          "roundId",
          "achievedAt",
        ]),
        mostWordsInGame: publicRecord(weeklyAllTime.mostWordsInGame, [
          "wordsCount",
          "roundId",
          "achievedAt",
        ]),
        bestTimeTargetLong: publicRecord(weeklyAllTime.bestTimeTargetLong, ["word", "ms", "achievedAt"]),
        bestTimeTargetScore: publicRecord(weeklyAllTime.bestTimeTargetScore, [
          "word",
          "ms",
          "achievedAt",
        ]),
      },
    },
    vocabulary: {
      count: finiteInt(vocabulary?.count),
      rank: Number.isFinite(Number(vocabulary?.rank)) ? Number(vocabulary.rank) : null,
      totalPlayers: finiteInt(vocabulary?.totalPlayers),
      updatedAt: finiteInt(vocabulary?.updatedAt),
    },
    trophies: trophies
      ? {
          trophies: finiteInt(trophies.trophies),
          league: trophies.league || trophies.progress?.league || "Bronze",
          progress: trophies.progress || null,
        }
      : null,
    duel: {
      weekId: duelRecap?.weekId || "",
      team: duelContribution?.team || null,
      rank: Number.isFinite(Number(duelContribution?.rank)) ? Number(duelContribution.rank) : null,
      points: finiteInt(duelContribution?.points),
      objectivePoints: finiteInt(duelContribution?.objectivePoints),
      gobblePoints: finiteInt(duelContribution?.gobblePoints),
      medalPoints: finiteInt(duelContribution?.medalPoints),
    },
    headToHead: await getLiveHeadToHeadSummary(viewerUserId, safeUserId),
  };
}

export async function getPublicPlayerProfile(installId, { fallbackNick = "" } = {}) {
  const safeUserId = normalizeUserId(installId);
  if (!safeUserId) return null;
  return getPublicPlayerProfileByUserId(safeUserId, { fallbackNick });
}
