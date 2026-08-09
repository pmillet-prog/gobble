import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import {
  buildLifetimeScoreRollbackChanges,
  buildRestoredWeeklyScoreStats,
  countChangedBoardEntries,
} from "./scoreRecordRollbackPolicy.js";
import { replaceWeeklyScoreRecordBoards } from "./weeklyStatsService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : path.join(__dirname, "../data");
const PENDING_PLAN_FILE = "pending-score-record-rollback.json";

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return JSON.parse(cleaned);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

async function writeJsonAtomic(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

function safeRepairId(raw) {
  const repairId = String(raw || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,80}$/i.test(repairId)) {
    throw new Error("Invalid score-record rollback repairId");
  }
  return repairId;
}

function safeSnapshotPath(dataDir, raw) {
  const filename = String(raw || "").trim();
  if (!filename || path.basename(filename) !== filename) {
    throw new Error("The rollback snapshot must be a filename inside GOBBLE_DATA_DIR");
  }
  return path.join(dataDir, filename);
}

export async function applyPendingScoreRecordRollback({ dataDir = DATA_DIR } = {}) {
  const resolvedDataDir = path.resolve(dataDir);
  const planPath = path.join(resolvedDataDir, PENDING_PLAN_FILE);
  if (!(await pathExists(planPath))) return { status: "none" };

  const plan = await readJson(planPath);
  if (Number(plan?.version) !== 1) throw new Error("Unsupported score-record rollback plan");
  const repairId = safeRepairId(plan.repairId);
  const markerPath = path.join(resolvedDataDir, `score-record-rollback.${repairId}.applied.json`);
  if (await pathExists(markerPath)) return { status: "already-applied", repairId };

  const cutoffAt = Number(plan.cutoffAt) || 0;
  if (!(cutoffAt > 0)) throw new Error("The rollback plan requires cutoffAt");
  const weeklyPath = path.join(resolvedDataDir, "weekly-stats.json");
  const dbPath = path.join(resolvedDataDir, "gobble.db");
  const snapshotPath = safeSnapshotPath(resolvedDataDir, plan.snapshotFile);
  const [currentWeeklyStats, snapshot] = await Promise.all([
    readJson(weeklyPath),
    readJson(snapshotPath),
  ]);
  const restoredWeeklyStats = buildRestoredWeeklyScoreStats(
    currentWeeklyStats,
    snapshot,
    cutoffAt
  );
  const weeklyChanges = { bestWord: 0, bestRoundScore: 0 };
  const currentWeeks = new Map(
    [currentWeeklyStats, ...Object.values(currentWeeklyStats.history || {})].map((week) => [
      Number(week?.weekStartTs) || 0,
      week,
    ])
  );
  const restoredWeeks = [restoredWeeklyStats, ...Object.values(restoredWeeklyStats.history || {})];
  const weeklyRecovery = [];
  for (const week of restoredWeeks) {
    const currentWeek = currentWeeks.get(Number(week?.weekStartTs) || 0) || {};
    const bestWordChanges = countChangedBoardEntries(currentWeek.bestWord, week?.bestWord);
    const bestRoundScoreChanges = countChangedBoardEntries(
      currentWeek.bestRoundScore,
      week?.bestRoundScore
    );
    weeklyChanges.bestWord += bestWordChanges;
    weeklyChanges.bestRoundScore += bestRoundScoreChanges;
    if (bestWordChanges > 0 || bestRoundScoreChanges > 0) {
      weeklyRecovery.push({
        weekStartTs: currentWeek.weekStartTs,
        bestWord: currentWeek.bestWord || {},
        bestRoundScore: currentWeek.bestRoundScore || {},
      });
    }
  }

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  let lifetimeChanges = [];
  try {
    await db.exec("PRAGMA busy_timeout = 15000");
    const rows = await db.all(
      `SELECT installId, bestWord, bestWordScore, bestRoundScore, bestRoundId
       FROM player_lifetime_stats
       ORDER BY installId`
    );
    lifetimeChanges = buildLifetimeScoreRollbackChanges({
      rows,
      currentWeeklyStats,
      restoredWeeklyStats,
      cutoffAt,
    });

    const createdAt = Date.now();
    const recoveryPath = path.join(
      resolvedDataDir,
      `score-record-rollback.${repairId}.recovery.${createdAt}.json`
    );
    await writeJsonAtomic(recoveryPath, {
      version: 1,
      repairId,
      createdAt,
      cutoffAt,
      weekly: weeklyRecovery,
      lifetimeRows: lifetimeChanges.map((change) => ({
        installId: change.installId,
        ...change.current,
      })),
    });

    await db.exec("BEGIN IMMEDIATE");
    try {
      for (const change of lifetimeChanges) {
        await db.run(
          `UPDATE player_lifetime_stats
           SET bestWord = ?,
               bestWordScore = ?,
               bestRoundScore = ?,
               bestRoundId = ?
           WHERE installId = ?`,
          change.next.bestWord || null,
          change.next.bestWordScore,
          change.next.bestRoundScore,
          change.next.bestRoundId || null,
          change.installId
        );
      }
      await db.exec("COMMIT");
    } catch (err) {
      await db.exec("ROLLBACK");
      throw err;
    }

    await replaceWeeklyScoreRecordBoards({
      weeks: restoredWeeks.map((week) => ({
        weekStartTs: week.weekStartTs,
        bestWord: week.bestWord,
        bestRoundScore: week.bestRoundScore,
      })),
    });

    const summary = {
      status: "applied",
      repairId,
      appliedAt: Date.now(),
      cutoffAt,
      snapshotFile: path.basename(snapshotPath),
      recoveryFile: path.basename(recoveryPath),
      weeklyChanges,
      lifetimeRowsChanged: lifetimeChanges.length,
      lifetimeBestWordsChanged: lifetimeChanges.filter((entry) => entry.rollbackBestWord).length,
      lifetimeBestRoundScoresChanged: lifetimeChanges.filter(
        (entry) => entry.rollbackBestRoundScore
      ).length,
    };
    await writeJsonAtomic(markerPath, summary);
    return summary;
  } finally {
    await db.close();
  }
}
