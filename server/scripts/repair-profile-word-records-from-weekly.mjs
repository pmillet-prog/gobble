import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : path.join(__dirname, "../data");

function parseArgs(argv) {
  const out = {
    apply: false,
    verbose: false,
    help: false,
    dataDir: DEFAULT_DATA_DIR,
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
      "Usage: node ./scripts/repair-profile-word-records-from-weekly.mjs [--dry-run] [--apply] [--verbose] [--data-dir=...]",
      "",
      "Rebuilds profile lifetime bestWord/longestWord from weekly-stats history.",
      "weekly-stats bestWord/longestWord are treated as the non-target source of truth.",
      "",
      "Default mode is --dry-run. Use --apply to update gobble.db.",
    ].join("\n")
  );
}

function normalizePlayerKey(raw) {
  const key = String(raw || "").trim();
  return key.startsWith("install:") ? key : "";
}

function normalizeInstallIdFromPlayerKey(raw) {
  const key = normalizePlayerKey(raw);
  return key ? key.slice("install:".length).trim() : "";
}

function normalizeWord(raw) {
  return String(raw || "").trim().slice(0, 40);
}

function finiteInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.trunc(num)) : 0;
}

function shouldReplaceScored(current, candidate) {
  if (!candidate) return false;
  if (!current) return true;
  const scoreDiff = finiteInt(candidate.pts) - finiteInt(current.pts);
  if (scoreDiff !== 0) return scoreDiff > 0;
  return finiteInt(candidate.achievedAt) < finiteInt(current.achievedAt);
}

function shouldReplaceLongest(current, candidate) {
  if (!candidate) return false;
  if (!current) return true;
  const lenDiff = finiteInt(candidate.len) - finiteInt(current.len);
  if (lenDiff !== 0) return lenDiff > 0;
  return finiteInt(candidate.achievedAt) < finiteInt(current.achievedAt);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return JSON.parse(cleaned);
}

function getWeekObjects(payload) {
  const weeks = [];
  if (payload && typeof payload === "object") weeks.push(payload);
  const history = payload?.history && typeof payload.history === "object" ? payload.history : {};
  for (const week of Object.values(history)) {
    if (week && typeof week === "object") weeks.push(week);
  }
  return weeks;
}

function collectBoardEntries(board) {
  if (Array.isArray(board)) {
    return board.map((entry, index) => [String(index), entry]);
  }
  if (board && typeof board === "object") {
    return Object.entries(board);
  }
  return [];
}

function collectWeeklyRecords(weeklyStats) {
  const byInstallId = new Map();
  for (const week of getWeekObjects(weeklyStats)) {
    for (const [entryKey, entry] of collectBoardEntries(week.bestWord)) {
      if (!entry || typeof entry !== "object") continue;
      const installId = normalizeInstallIdFromPlayerKey(entry.playerKey || entryKey);
      const word = normalizeWord(entry.word);
      const pts = finiteInt(entry.pts);
      if (!installId || !word || pts <= 0) continue;
      const current = byInstallId.get(installId) || {};
      const candidate = {
        word,
        pts,
        achievedAt: finiteInt(entry.achievedAt),
      };
      if (shouldReplaceScored(current.bestWord, candidate)) {
        current.bestWord = candidate;
      }
      byInstallId.set(installId, current);
    }

    for (const [entryKey, entry] of collectBoardEntries(week.longestWord)) {
      if (!entry || typeof entry !== "object") continue;
      const installId = normalizeInstallIdFromPlayerKey(entry.playerKey || entryKey);
      const word = normalizeWord(entry.word);
      const len = finiteInt(entry.len || word.length);
      if (!installId || !word || len <= 0) continue;
      const current = byInstallId.get(installId) || {};
      const candidate = {
        word,
        len,
        achievedAt: finiteInt(entry.achievedAt),
      };
      if (shouldReplaceLongest(current.longestWord, candidate)) {
        current.longestWord = candidate;
      }
      byInstallId.set(installId, current);
    }
  }
  return byInstallId;
}

function sqlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function createSqliteBackup(db, dbPath) {
  const backupPath = `${dbPath}.bak.profile-word-records.${Date.now()}`;
  try {
    await db.exec(`VACUUM INTO ${sqlQuote(backupPath)}`);
    return backupPath;
  } catch (_) {
    await fs.copyFile(dbPath, backupPath);
    return backupPath;
  }
}

function normalizeCurrentRow(row) {
  return {
    bestWord: normalizeWord(row?.bestWord),
    bestWordScore: finiteInt(row?.bestWordScore),
    longestWord: normalizeWord(row?.longestWord),
    longestWordLength: finiteInt(row?.longestWordLength),
  };
}

function buildNextRow(records) {
  const bestWord = records?.bestWord || null;
  const longestWord = records?.longestWord || null;
  return {
    bestWord: bestWord?.word || "",
    bestWordScore: finiteInt(bestWord?.pts),
    longestWord: longestWord?.word || "",
    longestWordLength: finiteInt(longestWord?.len),
  };
}

function rowsDiffer(current, next) {
  return (
    current.bestWord !== next.bestWord ||
    current.bestWordScore !== next.bestWordScore ||
    current.longestWord !== next.longestWord ||
    current.longestWordLength !== next.longestWordLength
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const dataDir = path.resolve(args.dataDir);
  const weeklyPath = path.join(dataDir, "weekly-stats.json");
  const dbPath = path.join(dataDir, "gobble.db");
  const weeklyStats = await readJson(weeklyPath);
  const recordsByInstallId = collectWeeklyRecords(weeklyStats);

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    await db.exec("PRAGMA busy_timeout = 15000");
    const rows = await db.all(
      `SELECT installId, bestWord, bestWordScore, longestWord, longestWordLength
       FROM player_lifetime_stats
       ORDER BY installId`
    );

    const changes = [];
    for (const row of rows || []) {
      const installId = String(row?.installId || "").trim();
      if (!installId) continue;
      const current = normalizeCurrentRow(row);
      const next = buildNextRow(recordsByInstallId.get(installId));
      if (!rowsDiffer(current, next)) continue;
      changes.push({ installId, current, next });
    }

    const withBestWord = Array.from(recordsByInstallId.values()).filter((entry) => entry.bestWord).length;
    const withLongestWord = Array.from(recordsByInstallId.values()).filter(
      (entry) => entry.longestWord
    ).length;

    console.log(
      JSON.stringify(
        {
          mode: args.apply ? "apply" : "dry-run",
          dataDir,
          weeklyRecords: {
            players: recordsByInstallId.size,
            bestWord: withBestWord,
            longestWord: withLongestWord,
          },
          profileRows: rows?.length || 0,
          rowsToUpdate: changes.length,
        },
        null,
        2
      )
    );

    if (args.verbose || !args.apply) {
      for (const change of changes.slice(0, args.verbose ? changes.length : 25)) {
        console.log(
          JSON.stringify(
            {
              installId: change.installId,
              current: change.current,
              next: change.next,
            },
            null,
            2
          )
        );
      }
      if (!args.verbose && changes.length > 25) {
        console.log(`... ${changes.length - 25} more row(s). Use --verbose to print all.`);
      }
    }

    if (!args.apply || changes.length === 0) return;

    const backupPath = await createSqliteBackup(db, dbPath);
    await db.exec("BEGIN IMMEDIATE");
    try {
      for (const change of changes) {
        await db.run(
          `UPDATE player_lifetime_stats
           SET bestWord = ?,
               bestWordScore = ?,
               longestWord = ?,
               longestWordLength = ?
           WHERE installId = ?`,
          change.next.bestWord || null,
          change.next.bestWordScore,
          change.next.longestWord || null,
          change.next.longestWordLength,
          change.installId
        );
      }
      await db.exec("COMMIT");
    } catch (err) {
      try {
        await db.exec("ROLLBACK");
      } catch (_) {}
      throw err;
    }
    console.log(`Updated ${changes.length} row(s). Backup: ${backupPath}`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
