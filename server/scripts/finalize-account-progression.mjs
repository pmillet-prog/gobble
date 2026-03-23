import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : path.join(__dirname, "../data");
const DAILY_DIR = path.join(DATA_DIR, "daily");

const WEEKLY_BOARD_KEYS = [
  "medals",
  "mostWordsInGame",
  "totalScore",
  "bestWord",
  "longestWord",
  "bestSpecial3Score",
  "bestRoundScore",
  "bestTimeTargetLong",
  "bestTimeTargetScore",
  "vocab",
  "mostGobbles",
];
const DUEL_POINTS_DAILY_CAP = 85;

const MANUAL_INSTALL_OWNER_OVERRIDES = Object.freeze({
  "0ad5420a-44d6-4e49-b2dd-d48e9e463e05": 1,
  "26f77300-bce0-4025-a51b-331ab71b162f": 50,
  "877e74dd-68e9-4dab-aad5-17f26209139e": 40,
  "b5d8d39b-931d-4c78-bfbc-f759ceff5c31": 40,
});

function parseArgs(argv) {
  const out = {
    apply: false,
    verbose: false,
    help: false,
    dataDir: DATA_DIR,
  };
  for (const raw of argv) {
    const arg = String(raw || "").trim();
    if (!arg) continue;
    if (arg === "--apply") out.apply = true;
    else if (arg === "--dry-run") out.apply = false;
    else if (arg === "--verbose") out.verbose = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg.startsWith("--data-dir=")) out.dataDir = path.resolve(arg.slice("--data-dir=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printHelp() {
  console.log(
    [
      "Usage: node ./scripts/finalize-account-progression.mjs [--dry-run] [--apply] [--verbose] [--data-dir=...]",
      "",
      "Migrates known legacy install IDs to the canonical account identity String(user.id).",
      "It rewrites progression storage in sqlite/json and persists identity migration signatures.",
    ].join("\n")
  );
}

function normalizeInstallId(raw) {
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeNick(raw) {
  return typeof raw === "string" ? raw.trim().slice(0, 48) : "";
}

function normalizeDateId(raw) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(raw || "")) ? String(raw) : "";
}

function makeCanonicalInstallId(userId) {
  const safeUserId = Number(userId);
  return Number.isInteger(safeUserId) && safeUserId > 0 ? String(safeUserId) : "";
}

function deepClone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (_) {
    return false;
  }
}

async function readJson(targetPath, fallback) {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(cleaned);
  } catch (_) {
    return fallback;
  }
}

async function backupFile(targetPath) {
  if (!(await pathExists(targetPath))) return null;
  const backupPath = `${targetPath}.bak.account-migration.${Date.now()}`;
  await fs.copyFile(targetPath, backupPath);
  return backupPath;
}

async function writeJson(targetPath, payload) {
  const tmpPath = `${targetPath}.tmp`;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    await fs.rename(tmpPath, targetPath);
  } catch (_) {
    try {
      await fs.unlink(targetPath);
    } catch (_) {}
    await fs.rename(tmpPath, targetPath);
  }
}

function compareDailyResults(a, b) {
  const diff = (Number(b?.score) || 0) - (Number(a?.score) || 0);
  if (diff !== 0) return diff;
  const at = Number(a?.submittedAt) || 0;
  const bt = Number(b?.submittedAt) || 0;
  if (at !== bt) return at - bt;
  const ad = Number(a?.durationMs);
  const bd = Number(b?.durationMs);
  if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return ad - bd;
  return String(a?.pseudo || "").localeCompare(String(b?.pseudo || ""));
}

function shouldReplaceWeekly(current, valueKey, nextValue, achievedAt, asc = false) {
  if (!current) return true;
  const currentValue = current?.[valueKey] ?? 0;
  if (asc) {
    if (nextValue < currentValue) return true;
    if (nextValue > currentValue) return false;
  } else {
    if (nextValue > currentValue) return true;
    if (nextValue < currentValue) return false;
  }
  return (Number(achievedAt) || 0) < (Number(current?.achievedAt) || 0);
}

function mergeWeeklyBoardEntry(boardKey, current, incoming) {
  const next = { ...(current || {}) };
  const source = incoming || {};
  const achievedAt = Math.max(Number(next?.achievedAt) || 0, Number(source?.achievedAt) || 0);
  if (boardKey === "medals") {
    next.gold = (Number(next?.gold) || 0) + (Number(source?.gold) || 0);
    next.silver = (Number(next?.silver) || 0) + (Number(source?.silver) || 0);
    next.bronze = (Number(next?.bronze) || 0) + (Number(source?.bronze) || 0);
    next.total = (Number(next.gold) || 0) + (Number(next.silver) || 0) + (Number(next.bronze) || 0);
    next.achievedAt = achievedAt;
    return next;
  }
  if (boardKey === "totalScore") {
    next.totalScore = (Number(next?.totalScore) || 0) + (Number(source?.totalScore) || 0);
    next.roundsPlayed = (Number(next?.roundsPlayed) || 0) + (Number(source?.roundsPlayed) || 0);
    next.achievedAt = achievedAt;
    return next;
  }
  if (boardKey === "mostGobbles") {
    next.gobbles = (Number(next?.gobbles) || 0) + (Number(source?.gobbles) || 0);
    next.achievedAt = achievedAt;
    return next;
  }
  if (boardKey === "vocab") {
    const currentCount = Number(next?.vocabCount) || 0;
    const incomingCount = Number(source?.vocabCount) || 0;
    if (incomingCount > currentCount) {
      next.vocabCount = incomingCount;
      next.achievedAt = Number(source?.achievedAt) || achievedAt;
    } else {
      next.vocabCount = currentCount;
      next.achievedAt = Number(next?.achievedAt) || achievedAt;
    }
    return next;
  }
  if (boardKey === "bestWord") {
    return shouldReplaceWeekly(next, "pts", Number(source?.pts) || 0, source?.achievedAt, false)
      ? { ...source }
      : next;
  }
  if (boardKey === "longestWord") {
    return shouldReplaceWeekly(next, "len", Number(source?.len) || 0, source?.achievedAt, false)
      ? { ...source }
      : next;
  }
  if (boardKey === "bestSpecial3Score" || boardKey === "bestRoundScore") {
    return shouldReplaceWeekly(next, "pts", Number(source?.pts) || 0, source?.achievedAt, false)
      ? { ...source }
      : next;
  }
  if (boardKey === "mostWordsInGame") {
    return shouldReplaceWeekly(
      next,
      "wordsCount",
      Number(source?.wordsCount) || 0,
      source?.achievedAt,
      false
    )
      ? { ...source }
      : next;
  }
  if (boardKey === "bestTimeTargetLong" || boardKey === "bestTimeTargetScore") {
    return shouldReplaceWeekly(next, "ms", Number(source?.ms) || 0, source?.achievedAt, true)
      ? { ...source }
      : next;
  }
  return { ...next, ...source, achievedAt };
}

function canonicalizePlayerKey(rawPlayerKey, installIdMap) {
  const raw = String(rawPlayerKey || "").trim();
  if (!raw.startsWith("install:")) return raw;
  const installId = raw.slice("install:".length).trim();
  const mapped = installIdMap.get(installId) || installId;
  return mapped ? `install:${mapped}` : raw;
}

function rewriteWeeklyStatsPayload(payload, installIdMap, userByTargetInstallId) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  for (const boardKey of WEEKLY_BOARD_KEYS) {
    const board = payload?.[boardKey];
    if (!board || typeof board !== "object") continue;
    const merged = {};
    for (const [rawKey, rawEntry] of Object.entries(board)) {
      const source = rawEntry && typeof rawEntry === "object" ? { ...rawEntry } : {};
      const mappedPlayerKey = canonicalizePlayerKey(
        typeof source?.playerKey === "string" ? source.playerKey : rawKey,
        installIdMap
      );
      if (!mappedPlayerKey) continue;
      const targetInstallId = mappedPlayerKey.startsWith("install:")
        ? mappedPlayerKey.slice("install:".length)
        : "";
      source.playerKey = mappedPlayerKey;
      const user = userByTargetInstallId.get(targetInstallId);
      if (user?.usernameDisplay) {
        source.nick = user.usernameDisplay;
      }
      const current = merged[mappedPlayerKey] || null;
      merged[mappedPlayerKey] = mergeWeeklyBoardEntry(boardKey, current, source);
      merged[mappedPlayerKey].playerKey = mappedPlayerKey;
      if (user?.usernameDisplay) {
        merged[mappedPlayerKey].nick = user.usernameDisplay;
      }
    }
    next[boardKey] = merged;
  }
  if (payload?.history && typeof payload.history === "object") {
    const rewrittenHistory = {};
    for (const [weekKey, weekValue] of Object.entries(payload.history)) {
      rewrittenHistory[weekKey] = rewriteWeeklyStatsPayload(
        weekValue,
        installIdMap,
        userByTargetInstallId
      );
    }
    next.history = rewrittenHistory;
  }
  return next;
}

function mergeDuelObjectiveDay(current, incoming) {
  if (!current) return deepClone(incoming);
  if (!incoming) return deepClone(current);
  const chooseIncoming =
    (Number(incoming?.pointsAwarded) || 0) > (Number(current?.pointsAwarded) || 0) ||
    ((Number(incoming?.pointsAwarded) || 0) === (Number(current?.pointsAwarded) || 0) &&
      (Number(incoming?.updatedAt) || 0) >= (Number(current?.updatedAt) || 0));
  const base = deepClone(chooseIncoming ? incoming : current);
  base.dateId =
    normalizeDateId(base?.dateId) || normalizeDateId(current?.dateId) || normalizeDateId(incoming?.dateId);
  base.rerollUsed = !!current?.rerollUsed || !!incoming?.rerollUsed;
  base.pointsAwarded = Math.min(
    DUEL_POINTS_DAILY_CAP,
    Math.max(Number(current?.pointsAwarded) || 0, Number(incoming?.pointsAwarded) || 0)
  );
  base.updatedAt = Math.max(Number(current?.updatedAt) || 0, Number(incoming?.updatedAt) || 0);
  return base;
}

function mergeDuelContribution(current, incoming, fallbackTeam = null) {
  const next = {
    team: null,
    objectivePoints: 0,
    gobblePoints: 0,
    medalPoints: 0,
    totalPoints: 0,
  };
  const left = current && typeof current === "object" ? current : {};
  const right = incoming && typeof incoming === "object" ? incoming : {};
  next.team = right.team || left.team || fallbackTeam || null;
  next.objectivePoints = (Number(left.objectivePoints) || 0) + (Number(right.objectivePoints) || 0);
  next.gobblePoints = (Number(left.gobblePoints) || 0) + (Number(right.gobblePoints) || 0);
  next.medalPoints = (Number(left.medalPoints) || 0) + (Number(right.medalPoints) || 0);
  next.totalPoints =
    (Number(left.totalPoints) || 0) +
      (Number(right.totalPoints) || 0) ||
    next.objectivePoints + next.gobblePoints + next.medalPoints;
  return next;
}

function rewriteTeamDuelPayload(payload, installIdMap, userByTargetInstallId) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };

  const nextDailyObjectives = {};
  const dailyObjectivesByInstallId =
    payload?.dailyObjectivesByInstallId && typeof payload.dailyObjectivesByInstallId === "object"
      ? payload.dailyObjectivesByInstallId
      : {};
  for (const [rawInstallId, byDate] of Object.entries(dailyObjectivesByInstallId)) {
    const mappedInstallId = installIdMap.get(rawInstallId) || rawInstallId;
    if (!mappedInstallId || !byDate || typeof byDate !== "object") continue;
    if (!nextDailyObjectives[mappedInstallId]) nextDailyObjectives[mappedInstallId] = {};
    for (const [dateId, day] of Object.entries(byDate)) {
      if (!normalizeDateId(dateId)) continue;
      nextDailyObjectives[mappedInstallId][dateId] = mergeDuelObjectiveDay(
        nextDailyObjectives[mappedInstallId][dateId] || null,
        day
      );
    }
  }
  next.dailyObjectivesByInstallId = nextDailyObjectives;

  const nextDailyBattles = {};
  const dailyBattles = payload?.dailyBattles && typeof payload.dailyBattles === "object" ? payload.dailyBattles : {};
  for (const [dateId, battle] of Object.entries(dailyBattles)) {
    if (!battle || typeof battle !== "object") {
      nextDailyBattles[dateId] = battle;
      continue;
    }
    const ignored = Array.isArray(battle.ignoredInstallIds)
      ? Array.from(
          new Set(
            battle.ignoredInstallIds
              .map((value) => installIdMap.get(String(value || "").trim()) || String(value || "").trim())
              .filter(Boolean)
          )
        )
      : [];
    nextDailyBattles[dateId] = {
      ...battle,
      ignoredInstallIds: ignored,
    };
  }
  next.dailyBattles = nextDailyBattles;

  const nextWeeks = {};
  const weeks = payload?.weeks && typeof payload.weeks === "object" ? payload.weeks : {};
  for (const [weekId, week] of Object.entries(weeks)) {
    if (!week || typeof week !== "object") {
      nextWeeks[weekId] = week;
      continue;
    }
    const rewrittenWeek = { ...week };

    const teamByInstallId = {};
    for (const [rawInstallId, team] of Object.entries(week?.teamByInstallId || {})) {
      const mappedInstallId = installIdMap.get(rawInstallId) || rawInstallId;
      if (!mappedInstallId || !teamByInstallId[mappedInstallId]) {
        teamByInstallId[mappedInstallId] = team;
      }
    }
    rewrittenWeek.teamByInstallId = teamByInstallId;

    const levelByInstallId = {};
    for (const [rawInstallId, level] of Object.entries(week?.levelByInstallId || {})) {
      const mappedInstallId = installIdMap.get(rawInstallId) || rawInstallId;
      if (!mappedInstallId) continue;
      levelByInstallId[mappedInstallId] = Math.max(
        Number(levelByInstallId[mappedInstallId]) || 0,
        Number(level) || 0
      );
    }
    rewrittenWeek.levelByInstallId = levelByInstallId;

    const nickByInstallId = {};
    for (const [rawInstallId, nick] of Object.entries(week?.nickByInstallId || {})) {
      const mappedInstallId = installIdMap.get(rawInstallId) || rawInstallId;
      if (!mappedInstallId) continue;
      const user = userByTargetInstallId.get(mappedInstallId);
      nickByInstallId[mappedInstallId] = user?.usernameDisplay || normalizeNick(nick) || nickByInstallId[mappedInstallId] || "";
    }
    rewrittenWeek.nickByInstallId = nickByInstallId;

    const actionsByInstallId = {};
    for (const [rawInstallId, active] of Object.entries(week?.actionsByInstallId || {})) {
      const mappedInstallId = installIdMap.get(rawInstallId) || rawInstallId;
      if (!mappedInstallId) continue;
      actionsByInstallId[mappedInstallId] = !!actionsByInstallId[mappedInstallId] || !!active;
    }
    rewrittenWeek.actionsByInstallId = actionsByInstallId;

    const contributionsByInstallId = {};
    for (const [rawInstallId, contribution] of Object.entries(week?.contributionsByInstallId || {})) {
      const mappedInstallId = installIdMap.get(rawInstallId) || rawInstallId;
      if (!mappedInstallId) continue;
      contributionsByInstallId[mappedInstallId] = mergeDuelContribution(
        contributionsByInstallId[mappedInstallId] || null,
        contribution,
        teamByInstallId[mappedInstallId] || null
      );
    }
    rewrittenWeek.contributionsByInstallId = contributionsByInstallId;

    rewrittenWeek.dailyWinsByDate =
      week?.dailyWinsByDate && typeof week.dailyWinsByDate === "object" ? { ...week.dailyWinsByDate } : {};

    nextWeeks[weekId] = rewrittenWeek;
  }
  next.weeks = nextWeeks;

  const nextCrowns = {};
  const crownsByWeek =
    payload?.crownsByWeek && typeof payload.crownsByWeek === "object" ? payload.crownsByWeek : {};
  for (const [weekId, crowns] of Object.entries(crownsByWeek)) {
    const mappedCrowns = {};
    for (const [rawInstallId, active] of Object.entries(crowns || {})) {
      const mappedInstallId = installIdMap.get(rawInstallId) || rawInstallId;
      if (!mappedInstallId) continue;
      mappedCrowns[mappedInstallId] = !!mappedCrowns[mappedInstallId] || !!active;
    }
    nextCrowns[weekId] = mappedCrowns;
  }
  next.crownsByWeek = nextCrowns;

  return next;
}

function rewriteDailyResultsPayload(payload, installIdMap) {
  const resultsPayload = payload && typeof payload === "object" ? payload : {};
  const rawResults = Array.isArray(resultsPayload.results) ? resultsPayload.results : [];
  const rawAttempts =
    resultsPayload.attempts && typeof resultsPayload.attempts === "object" ? resultsPayload.attempts : {};

  const resultsByKey = new Map();
  for (const rawEntry of rawResults) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    const installId = normalizeInstallId(rawEntry.installId);
    const mappedInstallId = installIdMap.get(installId) || installId;
    if (!mappedInstallId) continue;
    const mode = String(rawEntry.mode || "").trim();
    const dedupeKey = `${mappedInstallId}|${mode}`;
    const nextEntry = { ...rawEntry, installId: mappedInstallId };
    const current = resultsByKey.get(dedupeKey) || null;
    if (!current || compareDailyResults(nextEntry, current) < 0) {
      resultsByKey.set(dedupeKey, nextEntry);
    }
  }
  const results = Array.from(resultsByKey.values()).sort(compareDailyResults);

  const attempts = {};
  for (const [rawInstallId, rawAttempt] of Object.entries(rawAttempts)) {
    const installId = normalizeInstallId(rawInstallId);
    const mappedInstallId = installIdMap.get(installId) || installId;
    if (!mappedInstallId || !rawAttempt || typeof rawAttempt !== "object") continue;
    const current = attempts[mappedInstallId] || null;
    const nextAttempt = { ...rawAttempt };
    const currentTs = Number(current?.startedAt) || 0;
    const nextTs = Number(nextAttempt?.startedAt) || 0;
    if (!current || nextTs >= currentTs) {
      attempts[mappedInstallId] = nextAttempt;
    }
  }

  return {
    ...resultsPayload,
    results,
    attempts,
  };
}

function rewriteChampionPayload(payload, installIdMap) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  const installId = normalizeInstallId(payload.installId);
  if (installId) {
    next.installId = installIdMap.get(installId) || installId;
  }
  return next;
}

async function loadDailyResultFilePaths(dailyDir) {
  if (!(await pathExists(dailyDir))) return [];
  const names = await fs.readdir(dailyDir);
  return names
    .filter((name) => /^results-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .map((name) => path.join(dailyDir, name));
}

async function ensureMigrationTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_identity_migrations (
      user_id INTEGER PRIMARY KEY,
      migration_signature TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

async function loadUsersAndDevices(db) {
  const users = await db.all(
    `SELECT id, username_display AS usernameDisplay, primary_install_id AS primaryInstallId
     FROM users
     ORDER BY id`
  );
  const devices = await db.all(
    `SELECT user_id AS userId, install_id AS installId, created_at AS createdAt, last_seen_at AS lastSeenAt
     FROM user_devices
     ORDER BY user_id, install_id`
  );
  return { users, devices };
}

function resolveInstallOwners(users, devices) {
  const userById = new Map(users.map((user) => [Number(user.id), user]));
  const occurrencesByInstallId = new Map();
  const pushOccurrence = (installId, userId, source) => {
    const safeInstallId = normalizeInstallId(installId);
    const safeUserId = Number(userId);
    if (!safeInstallId || !Number.isInteger(safeUserId) || safeUserId <= 0) return;
    const bucket = occurrencesByInstallId.get(safeInstallId) || [];
    bucket.push({
      userId: safeUserId,
      usernameDisplay: userById.get(safeUserId)?.usernameDisplay || "",
      source,
    });
    occurrencesByInstallId.set(safeInstallId, bucket);
  };
  users.forEach((user) => pushOccurrence(user.primaryInstallId, user.id, "primary"));
  devices.forEach((device) => pushOccurrence(device.installId, device.userId, "device"));

  const ownerByInstallId = new Map();
  const conflicts = [];
  for (const [installId, entries] of occurrencesByInstallId.entries()) {
    const uniqueUserIds = Array.from(new Set(entries.map((entry) => entry.userId)));
    if (uniqueUserIds.length === 1) {
      ownerByInstallId.set(installId, uniqueUserIds[0]);
      continue;
    }
    const overrideUserId = Number(MANUAL_INSTALL_OWNER_OVERRIDES[installId]);
    if (
      Number.isInteger(overrideUserId) &&
      overrideUserId > 0 &&
      uniqueUserIds.includes(overrideUserId)
    ) {
      ownerByInstallId.set(installId, overrideUserId);
      continue;
    }
    conflicts.push({
      installId,
      candidates: entries,
    });
  }
  return { userById, occurrencesByInstallId, ownerByInstallId, conflicts };
}

function choosePrimaryInstallIdForUser(user) {
  return makeCanonicalInstallId(user?.id);
}

async function cleanAuthIdentityRows(db, users, devices, ownerByInstallId) {
  const desiredDeviceRows = new Map();
  for (const device of devices) {
    const installId = normalizeInstallId(device.installId);
    const ownerUserId = ownerByInstallId.get(installId);
    if (!ownerUserId) continue;
    const key = `${ownerUserId}:${installId}`;
    const current = desiredDeviceRows.get(key) || null;
    if (
      !current ||
      Number(device.lastSeenAt) > Number(current.lastSeenAt) ||
      Number(device.createdAt) < Number(current.createdAt)
    ) {
      desiredDeviceRows.set(key, {
        userId: ownerUserId,
        installId,
        createdAt: Number(device.createdAt) || Date.now(),
        lastSeenAt: Number(device.lastSeenAt) || Date.now(),
      });
    }
  }

  await db.exec("BEGIN IMMEDIATE");
  let committed = false;
  try {
    await db.run("DELETE FROM user_devices");
    for (const row of desiredDeviceRows.values()) {
      await db.run(
        `INSERT INTO user_devices (user_id, install_id, created_at, last_seen_at)
         VALUES (?, ?, ?, ?)`,
        row.userId,
        row.installId,
        row.createdAt,
        row.lastSeenAt
      );
    }

    for (const user of users) {
      const nextPrimary = choosePrimaryInstallIdForUser(
        user
      );
      await db.run(
        `UPDATE users
         SET primary_install_id = ?, updated_at = ?
         WHERE id = ?`,
        nextPrimary,
        Date.now(),
        Number(user.id)
      );
    }

    await db.exec("COMMIT");
    committed = true;
  } finally {
    if (!committed) {
      try {
        await db.exec("ROLLBACK");
      } catch (_) {}
    }
  }
}

function safeJsonParse(rawValue, fallback) {
  try {
    return JSON.parse(rawValue);
  } catch (_) {
    return fallback;
  }
}

async function mergeVocabularyForUser(db, targetInstallId, sourceInstallIds, usernameDisplay) {
  if (!sourceInstallIds.length) return;
  for (const sourceInstallId of sourceInstallIds) {
    await db.run(
      `INSERT INTO vocab_words (installId, wordHash, firstSeenTs)
       SELECT ?, wordHash, firstSeenTs
       FROM vocab_words
       WHERE installId = ?
       ON CONFLICT(installId, wordHash)
       DO UPDATE SET firstSeenTs = MIN(vocab_words.firstSeenTs, excluded.firstSeenTs)`,
      targetInstallId,
      sourceInstallId
    );
    await db.run("DELETE FROM vocab_words WHERE installId = ?", sourceInstallId);
    await db.run("DELETE FROM vocab_counts WHERE installId = ?", sourceInstallId);
    await db.run("DELETE FROM vocab_profiles WHERE installId = ?", sourceInstallId);
  }

  const countRow = await db.get(
    `SELECT COUNT(DISTINCT wordHash) AS count
     FROM vocab_words
     WHERE installId = ?`,
    targetInstallId
  );
  const totalCount = Number(countRow?.count) || 0;
  const now = Date.now();
  await db.run(
    `INSERT INTO vocab_counts (installId, count, updatedAt)
     VALUES (?, ?, ?)
     ON CONFLICT(installId)
     DO UPDATE SET count = excluded.count, updatedAt = excluded.updatedAt`,
    targetInstallId,
    totalCount,
    now
  );
  const safeNick = normalizeNick(usernameDisplay);
  if (safeNick) {
    await db.run(
      `INSERT INTO vocab_profiles (installId, nick, updatedAt)
       VALUES (?, ?, ?)
       ON CONFLICT(installId)
       DO UPDATE SET nick = excluded.nick, updatedAt = excluded.updatedAt`,
      targetInstallId,
      safeNick,
      now
    );
  }
}

async function mergeTrophiesForUser(db, targetInstallId, sourceInstallIds) {
  if (!sourceInstallIds.length) return;
  const rows = await db.all(
    `SELECT installId, trophies, league, updatedAt, shieldCount, shieldFloor
     FROM trophies
     WHERE installId IN (${[targetInstallId, ...sourceInstallIds].map(() => "?").join(",")})`,
    targetInstallId,
    ...sourceInstallIds
  );
  const selected =
    (rows || [])
      .slice()
      .sort((a, b) => (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0))[0] || null;

  if (selected) {
    await db.run(
      `INSERT INTO trophies (installId, trophies, league, updatedAt, shieldCount, shieldFloor)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(installId)
       DO UPDATE SET trophies = excluded.trophies, league = excluded.league, updatedAt = excluded.updatedAt,
         shieldCount = excluded.shieldCount, shieldFloor = excluded.shieldFloor`,
      targetInstallId,
      Number(selected?.trophies) || 800,
      selected?.league || "Bronze",
      Number(selected?.updatedAt) || Date.now(),
      Number(selected?.shieldCount) || 0,
      Number.isFinite(Number(selected?.shieldFloor)) ? Number(selected.shieldFloor) : 0
    );
  }

  for (const sourceInstallId of sourceInstallIds) {
    await db.run(
      `INSERT OR IGNORE INTO trophy_history (installId, ts, delta, trophies, league, tournamentId)
       SELECT ?, ts, delta, trophies, league, tournamentId
       FROM trophy_history
       WHERE installId = ?`,
      targetInstallId,
      sourceInstallId
    );
    await db.run("DELETE FROM trophy_history WHERE installId = ?", sourceInstallId);
    await db.run(
      `INSERT INTO bot_encounters (installId, botId, dayKey, count, updatedAt)
       SELECT ?, botId, dayKey, count, updatedAt
       FROM bot_encounters
       WHERE installId = ?
       ON CONFLICT(installId, botId, dayKey)
       DO UPDATE SET count = MAX(bot_encounters.count, excluded.count),
         updatedAt = MAX(bot_encounters.updatedAt, excluded.updatedAt)`,
      targetInstallId,
      sourceInstallId
    );
    await db.run("DELETE FROM bot_encounters WHERE installId = ?", sourceInstallId);
    await db.run("DELETE FROM trophies WHERE installId = ?", sourceInstallId);
  }
}

async function mergeGobblarsForUser(db, targetInstallId, sourceInstallIds) {
  if (!sourceInstallIds.length) return;
  const rows = await db.all(
    `SELECT installId, balance, themeApplied, themeUnlocks, updatedAt
     FROM gobblar_profiles
     WHERE installId IN (${[targetInstallId, ...sourceInstallIds].map(() => "?").join(",")})`,
    targetInstallId,
    ...sourceInstallIds
  );

  let balance = 0;
  let latestThemeTs = 0;
  let mergedTheme = {};
  let mergedUnlocks = {};

  for (const row of rows || []) {
    balance += Math.max(0, Number(row?.balance) || 0);
    const updatedAt = Number(row?.updatedAt) || 0;
    const themeApplied = safeJsonParse(row?.themeApplied, {});
    const themeUnlocks = safeJsonParse(row?.themeUnlocks, {});
    if (updatedAt >= latestThemeTs) {
      latestThemeTs = updatedAt;
      mergedTheme = themeApplied;
    }
    mergedUnlocks = { ...mergedUnlocks, ...themeUnlocks };
  }

  const now = Math.max(Date.now(), latestThemeTs);
  await db.run(
    `INSERT INTO gobblar_profiles (installId, balance, themeApplied, themeUnlocks, updatedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(installId)
     DO UPDATE SET balance = excluded.balance, themeApplied = excluded.themeApplied,
       themeUnlocks = excluded.themeUnlocks, updatedAt = excluded.updatedAt`,
    targetInstallId,
    balance,
    JSON.stringify(mergedTheme || {}),
    JSON.stringify(mergedUnlocks || {}),
    now
  );

  for (const sourceInstallId of sourceInstallIds) {
    await db.run("UPDATE gobblar_ledger SET installId = ? WHERE installId = ?", targetInstallId, sourceInstallId);
    await db.run(
      `INSERT OR IGNORE INTO gobblar_week_rewards (installId, weekId, source, amount, awardedAt)
       SELECT ?, weekId, source, amount, awardedAt
       FROM gobblar_week_rewards
       WHERE installId = ?`,
      targetInstallId,
      sourceInstallId
    );
    await db.run("DELETE FROM gobblar_week_rewards WHERE installId = ?", sourceInstallId);
    await db.run(
      `INSERT OR IGNORE INTO gobblar_global_grants (installId, grantKey, amount, awardedAt)
       SELECT ?, grantKey, amount, awardedAt
       FROM gobblar_global_grants
       WHERE installId = ?`,
      targetInstallId,
      sourceInstallId
    );
    await db.run("DELETE FROM gobblar_global_grants WHERE installId = ?", sourceInstallId);
    await db.run("DELETE FROM gobblar_profiles WHERE installId = ?", sourceInstallId);
  }
}

async function migrateProgressionDb(db, users, sourceInstallIdsByUser) {
  for (const user of users) {
    const userId = Number(user.id);
    const targetInstallId = makeCanonicalInstallId(userId);
    const sourceInstallIds = Array.from(sourceInstallIdsByUser.get(userId) || []).filter(
      (installId) => installId && installId !== targetInstallId
    );
    if (!sourceInstallIds.length) continue;

    await db.exec("BEGIN IMMEDIATE");
    let committed = false;
    try {
      await mergeVocabularyForUser(db, targetInstallId, sourceInstallIds, user.usernameDisplay);
      await mergeTrophiesForUser(db, targetInstallId, sourceInstallIds);
      await mergeGobblarsForUser(db, targetInstallId, sourceInstallIds);
      await db.exec("COMMIT");
      committed = true;
    } finally {
      if (!committed) {
        try {
          await db.exec("ROLLBACK");
        } catch (_) {}
      }
    }
  }
}

async function persistIdentityMigrationSignatures(db, users, sourceInstallIdsByUser, primaryByUserId) {
  const now = Date.now();
  for (const user of users) {
    const userId = Number(user.id);
    const targetInstallId = makeCanonicalInstallId(userId);
    const primaryInstallId = normalizeInstallId(primaryByUserId.get(userId) || "");
    const sourceInstallIds = Array.from(
      new Set(
        [primaryInstallId, ...Array.from(sourceInstallIdsByUser.get(userId) || [])]
          .map((installId) => normalizeInstallId(installId))
          .filter((installId) => installId && installId !== targetInstallId)
      )
    ).sort();
    const signature = `${targetInstallId}|${sourceInstallIds.join(",")}`;
    await db.run(
      `INSERT INTO user_identity_migrations (user_id, migration_signature, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id)
       DO UPDATE SET migration_signature = excluded.migration_signature, updated_at = excluded.updated_at`,
      userId,
      signature,
      now
    );
  }
}

async function buildPlan(db) {
  const { users, devices } = await loadUsersAndDevices(db);
  const { userById, ownerByInstallId, conflicts } = resolveInstallOwners(users, devices);
  if (conflicts.length > 0) {
    throw new Error(`Unresolved install ownership conflicts: ${JSON.stringify(conflicts, null, 2)}`);
  }

  const primaryByUserId = new Map();
  const sourceInstallIdsByUser = new Map();
  const installIdMap = new Map();
  const userByTargetInstallId = new Map();

  for (const user of users) {
    const userId = Number(user.id);
    const targetInstallId = makeCanonicalInstallId(userId);
    userByTargetInstallId.set(targetInstallId, user);
    sourceInstallIdsByUser.set(userId, new Set());
  }

  for (const [installId, ownerUserId] of ownerByInstallId.entries()) {
    const targetInstallId = makeCanonicalInstallId(ownerUserId);
    if (!targetInstallId) continue;
    installIdMap.set(installId, targetInstallId);
    if (installId !== targetInstallId) {
      sourceInstallIdsByUser.get(ownerUserId)?.add(installId);
    }
  }

  for (const user of users) {
    const userId = Number(user.id);
    const desiredPrimary = choosePrimaryInstallIdForUser(user);
    primaryByUserId.set(userId, desiredPrimary);
  }

  return {
    users,
    devices,
    userById,
    ownerByInstallId,
    installIdMap,
    sourceInstallIdsByUser,
    primaryByUserId,
    userByTargetInstallId,
  };
}

async function buildJsonRewritePlan(dataDir, installIdMap, userByTargetInstallId) {
  const weeklyStats = rewriteWeeklyStatsPayload(
    await readJson(path.join(dataDir, "weekly-stats.json"), {}),
    installIdMap,
    userByTargetInstallId
  );
  const teamDuel = rewriteTeamDuelPayload(
    await readJson(path.join(dataDir, "team-duel.json"), {}),
    installIdMap,
    userByTargetInstallId
  );

  const existingAliases = await readJson(path.join(dataDir, "install-aliases.json"), {});
  const aliasSource =
    existingAliases?.aliases && typeof existingAliases.aliases === "object"
      ? existingAliases.aliases
      : existingAliases && typeof existingAliases === "object"
      ? existingAliases
      : {};
  const nextAliases = {};
  for (const [fromRaw, toRaw] of Object.entries(aliasSource)) {
    const from = normalizeInstallId(fromRaw);
    const to = normalizeInstallId(toRaw);
    if (!from || !to) continue;
    const mappedFrom = installIdMap.get(from) || from;
    const mappedTo = installIdMap.get(to) || to;
    if (mappedFrom && mappedTo && mappedFrom !== mappedTo) {
      nextAliases[from] = mappedTo;
    }
  }
  for (const [from, to] of installIdMap.entries()) {
    if (from && to && from !== to) {
      nextAliases[from] = to;
    }
  }
  const installAliases = {
    version: 1,
    updatedAt: Date.now(),
    aliases: Object.fromEntries(
      Object.entries(nextAliases)
        .filter(([from, to]) => from && to && from !== to)
        .sort((a, b) => a[0].localeCompare(b[0]))
    ),
  };

  const dailyResultPaths = await loadDailyResultFilePaths(path.join(dataDir, "daily"));
  const dailyResults = [];
  for (const filePath of dailyResultPaths) {
    const payload = await readJson(filePath, { results: [], attempts: {} });
    dailyResults.push({
      path: filePath,
      payload: rewriteDailyResultsPayload(payload, installIdMap),
    });
  }
  const championPayload = await readJson(path.join(dataDir, "daily", "champion.json"), null);
  const champion = championPayload ? rewriteChampionPayload(championPayload, installIdMap) : null;

  return {
    weeklyStats,
    teamDuel,
    installAliases,
    dailyResults,
    champion,
  };
}

function summarizePlan(plan, jsonPlan) {
  const migratedUsers = plan.users
    .map((user) => {
      const sourceInstallIds = Array.from(plan.sourceInstallIdsByUser.get(Number(user.id)) || []).filter(Boolean);
      return {
        userId: Number(user.id),
        username: user.usernameDisplay,
        targetInstallId: makeCanonicalInstallId(user.id),
        sourceInstallIds,
        desiredPrimaryInstallId: plan.primaryByUserId.get(Number(user.id)) || "",
      };
    })
    .filter((entry) => entry.sourceInstallIds.length > 0);

  return {
    users: plan.users.length,
    migratedUsers: migratedUsers.length,
    sourceInstallIds: migratedUsers.reduce((sum, entry) => sum + entry.sourceInstallIds.length, 0),
    dailyFiles: jsonPlan.dailyResults.length,
    aliasLinks: Object.keys(jsonPlan.installAliases.aliases || {}).length,
    migratedUsersSample: migratedUsers.slice(0, 20),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const dataDir = args.dataDir;
  const dbPath = path.join(dataDir, "gobble.db");
  const weeklyStatsPath = path.join(dataDir, "weekly-stats.json");
  const teamDuelPath = path.join(dataDir, "team-duel.json");
  const installAliasesPath = path.join(dataDir, "install-aliases.json");
  const dailyChampionPath = path.join(dataDir, "daily", "champion.json");

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec("PRAGMA journal_mode = WAL;");
  await db.exec("PRAGMA busy_timeout = 5000;");
  await db.exec("PRAGMA foreign_keys = ON;");
  await ensureMigrationTable(db);

  const plan = await buildPlan(db);
  const jsonPlan = await buildJsonRewritePlan(
    dataDir,
    plan.installIdMap,
    plan.userByTargetInstallId
  );
  const summary = summarizePlan(plan, jsonPlan);
  console.log(JSON.stringify({ mode: args.apply ? "apply" : "dry-run", dataDir, summary }, null, 2));

  if (!args.apply) {
    await db.close();
    return;
  }

  const backups = [];
  backups.push(await backupFile(dbPath));
  backups.push(await backupFile(`${dbPath}-wal`));
  backups.push(await backupFile(`${dbPath}-shm`));
  backups.push(await backupFile(weeklyStatsPath));
  backups.push(await backupFile(teamDuelPath));
  backups.push(await backupFile(installAliasesPath));
  backups.push(await backupFile(dailyChampionPath));
  for (const entry of jsonPlan.dailyResults) {
    backups.push(await backupFile(entry.path));
  }

  await cleanAuthIdentityRows(db, plan.users, plan.devices, plan.ownerByInstallId);
  await migrateProgressionDb(db, plan.users, plan.sourceInstallIdsByUser);
  await persistIdentityMigrationSignatures(db, plan.users, plan.sourceInstallIdsByUser, plan.primaryByUserId);

  await writeJson(weeklyStatsPath, jsonPlan.weeklyStats);
  await writeJson(teamDuelPath, jsonPlan.teamDuel);
  await writeJson(installAliasesPath, jsonPlan.installAliases);
  for (const entry of jsonPlan.dailyResults) {
    await writeJson(entry.path, entry.payload);
  }
  if (jsonPlan.champion) {
    await writeJson(dailyChampionPath, jsonPlan.champion);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        backups: backups.filter(Boolean),
      },
      null,
      2
    )
  );
  await db.close();
}

main().catch((err) => {
  console.error("[finalize-account-progression] failed", err);
  process.exitCode = 1;
});
