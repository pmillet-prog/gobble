import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "gobble.db");

const DEFAULT_TROPHIES = 1000;
const K_BASE = 24;
const MAX_DELTA = 25;

const LEAGUES = [
  { name: "Bronze", min: 0 },
  { name: "Argent", min: 900 },
  { name: "Or", min: 1200 },
  { name: "Cristal", min: 1500 },
  { name: "Master", min: 1800 },
  { name: "L\u00e9gende", min: 2100 },
];

let db = null;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getDayKey(ts) {
  const date = new Date(ts);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getLeagueFromTrophies(trophies) {
  const value = Number.isFinite(trophies) ? trophies : 0;
  let league = LEAGUES[0];
  for (const entry of LEAGUES) {
    if (value >= entry.min) league = entry;
  }
  return league?.name || "Bronze";
}

export function getLeagueProgress(trophies) {
  const value = Number.isFinite(trophies) ? trophies : 0;
  let current = LEAGUES[0];
  let next = null;
  for (let i = 0; i < LEAGUES.length; i++) {
    if (value >= LEAGUES[i].min) {
      current = LEAGUES[i];
      next = LEAGUES[i + 1] || null;
    } else {
      break;
    }
  }
  const currentFloor = current?.min ?? 0;
  const nextFloor = next?.min ?? null;
  const pct =
    nextFloor != null
      ? clamp((value - currentFloor) / Math.max(1, nextFloor - currentFloor), 0, 1)
      : 1;
  return {
    league: current?.name || "Bronze",
    currentFloor,
    nextFloor,
    pct,
  };
}

export async function initTrophyService() {
  if (db) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.exec("PRAGMA journal_mode = WAL;");
    await db.exec(`
      CREATE TABLE IF NOT EXISTS trophies (
        installId TEXT PRIMARY KEY,
        trophies INTEGER NOT NULL,
        league TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        shieldCount INTEGER NOT NULL DEFAULT 0,
        shieldFloor INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS trophy_history (
        installId TEXT NOT NULL,
        ts INTEGER NOT NULL,
        delta INTEGER NOT NULL,
        trophies INTEGER NOT NULL,
        league TEXT NOT NULL,
        tournamentId TEXT,
        PRIMARY KEY(installId, ts)
      );
      CREATE TABLE IF NOT EXISTS bot_encounters (
        installId TEXT NOT NULL,
        botId TEXT NOT NULL,
        dayKey TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY(installId, botId, dayKey)
      );
    `);
  } catch (err) {
    console.warn("Trophy service init failed", err);
    db = null;
  }
}

async function getOrCreateTrophyRow(installId) {
  if (!db || !installId) return null;
  const row = await db.get(
    "SELECT installId, trophies, league, updatedAt, shieldCount, shieldFloor FROM trophies WHERE installId = ?",
    installId
  );
  if (row) return row;
  const now = Date.now();
  const league = getLeagueFromTrophies(DEFAULT_TROPHIES);
  await db.run(
    "INSERT INTO trophies (installId, trophies, league, updatedAt, shieldCount, shieldFloor) VALUES (?, ?, ?, ?, ?, ?)",
    installId,
    DEFAULT_TROPHIES,
    league,
    now,
    0,
    LEAGUES.find((l) => l.name === league)?.min ?? 0
  );
  return {
    installId,
    trophies: DEFAULT_TROPHIES,
    league,
    updatedAt: now,
    shieldCount: 0,
    shieldFloor: LEAGUES.find((l) => l.name === league)?.min ?? 0,
  };
}

export async function getTrophyHistory(installId, limit = 10) {
  if (!db || !installId) return [];
  try {
    const rows = await db.all(
      "SELECT ts, delta, trophies, league, tournamentId FROM trophy_history WHERE installId = ? ORDER BY ts DESC LIMIT ?",
      installId,
      Math.max(1, Math.min(30, limit))
    );
    return rows || [];
  } catch (err) {
    console.warn("Trophy history failed", err);
    return [];
  }
}

export async function getTrophyStatus(installId) {
  if (!db || !installId) {
    const progress = getLeagueProgress(DEFAULT_TROPHIES);
    return {
      trophies: DEFAULT_TROPHIES,
      league: progress.league,
      progress,
      shieldCount: 0,
      shieldFloor: progress.currentFloor,
      history: [],
    };
  }
  try {
    const row = await getOrCreateTrophyRow(installId);
    if (!row) return null;
    const progress = getLeagueProgress(row.trophies);
    const history = await getTrophyHistory(installId, 10);
    return {
      trophies: row.trophies,
      league: row.league || progress.league,
      progress,
      shieldCount: row.shieldCount || 0,
      shieldFloor: row.shieldFloor || progress.currentFloor,
      history,
    };
  } catch (err) {
    console.warn("Trophy status failed", err);
    return null;
  }
}

function computeExpectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function compareRank(aRank, bRank) {
  if (aRank === bRank) return 0.5;
  return aRank < bRank ? 1 : 0;
}

export async function updateTrophiesForTournament({
  tournamentId,
  participants = [],
  now = Date.now(),
  kBase = K_BASE,
} = {}) {
  if (!db || !Array.isArray(participants) || participants.length < 2) {
    return [];
  }

  const humans = participants.filter((p) => !p.isBot && p.installId);
  const bots = participants.filter((p) => p.isBot);
  if (humans.length === 0) return [];

  const humanWeight = clamp(humans.length / 3, 0, 1);
  const kEff = kBase * (0.25 + 0.75 * humanWeight);
  const dayKey = getDayKey(now);

  const statusMap = new Map();
  for (const human of humans) {
    statusMap.set(human.installId, await getOrCreateTrophyRow(human.installId));
  }

  const encounters = new Map();
  if (bots.length > 0) {
    const botIds = bots.map((b) => b.botId).filter(Boolean);
    const installIds = humans.map((h) => h.installId);
    if (botIds.length && installIds.length) {
      const placeholders = botIds.map(() => "?").join(",");
      const rows = await db.all(
        `SELECT installId, botId, count FROM bot_encounters WHERE dayKey = ? AND botId IN (${placeholders}) AND installId IN (${installIds
          .map(() => "?")
          .join(",")})`,
        dayKey,
        ...botIds,
        ...installIds
      );
      for (const row of rows || []) {
        encounters.set(`${row.installId}|${row.botId}`, row.count || 0);
      }
    }
  }

  const updates = [];
  await db.exec("BEGIN");
  try {
    for (const human of humans) {
      const row = statusMap.get(human.installId);
      if (!row) continue;
      const rating = Number.isFinite(row.trophies) ? row.trophies : DEFAULT_TROPHIES;
      const rank = human.rank;
      let sum = 0;

      for (const opp of participants) {
        if (opp === human) continue;
        const oppRating = Number.isFinite(opp.rating)
          ? opp.rating
          : opp.installId
          ? (statusMap.get(opp.installId)?.trophies ?? DEFAULT_TROPHIES)
          : DEFAULT_TROPHIES;
        const s = compareRank(rank, opp.rank);
        const expected = computeExpectedScore(rating, oppRating);
        let contribution = s - expected;
        if (opp.isBot && opp.botId) {
          const key = `${human.installId}|${opp.botId}`;
          const count = encounters.get(key) || 0;
          const fatigue = 1 / Math.sqrt(1 + count);
          contribution *= fatigue;
        }
        sum += contribution;
      }

      const denom = Math.max(1, participants.length - 1);
      let delta = Math.round(kEff * (sum / denom));
      delta = clamp(delta, -MAX_DELTA, MAX_DELTA);

      const oldTrophies = rating;
      let newTrophies = Math.max(0, oldTrophies + delta);
      const oldProgress = getLeagueProgress(oldTrophies);
      let shieldCount = row.shieldCount || 0;
      let shieldFloor = Number.isFinite(row.shieldFloor)
        ? row.shieldFloor
        : oldProgress.currentFloor;

      if (shieldCount > 0 && newTrophies < shieldFloor) {
        newTrophies = shieldFloor;
        shieldCount = Math.max(0, shieldCount - 1);
        delta = newTrophies - oldTrophies;
      }

      const newLeague = getLeagueFromTrophies(newTrophies);
      const newProgress = getLeagueProgress(newTrophies);
      if (newProgress.currentFloor > oldProgress.currentFloor) {
        shieldCount = 1;
        shieldFloor = newProgress.currentFloor;
      } else {
        shieldFloor = newProgress.currentFloor;
        if (newProgress.currentFloor < oldProgress.currentFloor) {
          shieldCount = 0;
        }
      }

      const updatedAt = now;
      await db.run(
        `INSERT INTO trophies (installId, trophies, league, updatedAt, shieldCount, shieldFloor)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(installId)
         DO UPDATE SET trophies = excluded.trophies, league = excluded.league, updatedAt = excluded.updatedAt,
           shieldCount = excluded.shieldCount, shieldFloor = excluded.shieldFloor`,
        human.installId,
        newTrophies,
        newLeague,
        updatedAt,
        shieldCount,
        shieldFloor
      );

      await db.run(
        "INSERT OR IGNORE INTO trophy_history (installId, ts, delta, trophies, league, tournamentId) VALUES (?, ?, ?, ?, ?, ?)",
        human.installId,
        updatedAt,
        delta,
        newTrophies,
        newLeague,
        tournamentId || null
      );

      updates.push({
        installId: human.installId,
        nick: human.nick || "",
        oldTrophies,
        newTrophies,
        delta,
        league: newLeague,
        progress: getLeagueProgress(newTrophies),
        shieldCount,
        shieldFloor,
        updatedAt,
      });
    }

    if (bots.length > 0 && humans.length > 0) {
      for (const human of humans) {
        for (const bot of bots) {
          if (!bot.botId) continue;
          await db.run(
            `INSERT INTO bot_encounters (installId, botId, dayKey, count, updatedAt)
             VALUES (?, ?, ?, 1, ?)
             ON CONFLICT(installId, botId, dayKey)
             DO UPDATE SET count = count + 1, updatedAt = excluded.updatedAt`,
            human.installId,
            bot.botId,
            dayKey,
            now
          );
        }
      }
    }

    await db.exec("COMMIT");
  } catch (err) {
    try {
      await db.exec("ROLLBACK");
    } catch (_) {}
    console.warn("Trophy update failed", err);
    return [];
  }

  return updates;
}

export function getBotRatingFromStrength(strength) {
  const s = clamp(Number.isFinite(strength) ? strength : 0, 0, 1);
  return Math.round(800 + 1200 * s);
}

export { DEFAULT_TROPHIES, K_BASE };
