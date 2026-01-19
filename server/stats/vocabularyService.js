import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { createHash } from "crypto";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { normalizeWord } from "../../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "gobble.db");

let db = null;

function hashWord(word) {
  return createHash("sha1").update(word).digest("hex");
}

export async function getKnownVocabWords(installId, words = []) {
  if (!db || !installId) return new Set();
  const rawWords = Array.isArray(words) ? words : [];
  const normalizedWords = Array.from(
    new Set(
      rawWords
        .map((word) => normalizeWord(word))
        .filter((word) => typeof word === "string" && word)
    )
  );
  if (normalizedWords.length === 0) return new Set();

  const hashToWord = new Map();
  normalizedWords.forEach((word) => {
    hashToWord.set(hashWord(word), word);
  });
  const hashes = Array.from(hashToWord.keys());
  const knownHashes = new Set();
  const chunkSize = 900;

  try {
    for (let i = 0; i < hashes.length; i += chunkSize) {
      const chunk = hashes.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(", ");
      const rows = await db.all(
        `SELECT wordHash FROM vocab_words WHERE installId = ? AND wordHash IN (${placeholders})`,
        [installId, ...chunk]
      );
      if (Array.isArray(rows)) {
        rows.forEach((row) => {
          if (row?.wordHash) knownHashes.add(row.wordHash);
        });
      }
    }
  } catch (err) {
    console.warn("Vocabulary lookup failed", err);
    return new Set();
  }

  const knownWords = new Set();
  knownHashes.forEach((hash) => {
    const word = hashToWord.get(hash);
    if (word) knownWords.add(word);
  });
  return knownWords;
}

export async function initVocabularyService() {
  if (db) return;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.exec("PRAGMA journal_mode = WAL;");
    await db.exec(`
      CREATE TABLE IF NOT EXISTS vocab_words (
        installId TEXT NOT NULL,
        wordHash TEXT NOT NULL,
        firstSeenTs INTEGER NOT NULL,
        PRIMARY KEY(installId, wordHash)
      );
      CREATE TABLE IF NOT EXISTS vocab_counts (
        installId TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        updatedAt INTEGER NOT NULL
      );
    `);
  } catch (err) {
    console.warn("Vocabulary service init failed", err);
    db = null;
  }
}

export async function recordVocabularyBatch(entries = []) {
  if (!db) return {};
  const safeEntries = Array.isArray(entries) ? entries : [];
  const now = Date.now();
  const addedByInstall = new Map();
  const seenInstallIds = new Set();

  try {
    await db.exec("BEGIN");
    for (const entry of safeEntries) {
      const installId = entry?.installId;
      if (!installId) continue;
      seenInstallIds.add(installId);
      const ts = Number.isFinite(entry?.ts) ? entry.ts : now;
      const words = Array.isArray(entry?.words) ? entry.words : [];
      const uniqueWords = new Set();
      for (const raw of words) {
        const normalized = normalizeWord(raw);
        if (!normalized) continue;
        uniqueWords.add(normalized);
      }
      for (const normalized of uniqueWords) {
        const hash = hashWord(normalized);
        const result = await db.run(
          "INSERT OR IGNORE INTO vocab_words (installId, wordHash, firstSeenTs) VALUES (?, ?, ?)",
          installId,
          hash,
          ts
        );
        if (result?.changes > 0) {
          addedByInstall.set(installId, (addedByInstall.get(installId) || 0) + 1);
        }
      }
    }

    for (const [installId, added] of addedByInstall.entries()) {
      if (added <= 0) continue;
      await db.run(
        `INSERT INTO vocab_counts (installId, count, updatedAt)
         VALUES (?, ?, ?)
         ON CONFLICT(installId)
         DO UPDATE SET count = count + excluded.count, updatedAt = excluded.updatedAt`,
        installId,
        added,
        now
      );
    }
    await db.exec("COMMIT");
  } catch (err) {
    try {
      await db.exec("ROLLBACK");
    } catch (_) {}
    console.warn("Vocabulary batch failed", err);
    return {};
  }

  const result = {};
  for (const installId of seenInstallIds) {
    result[installId] = {
      added: addedByInstall.get(installId) || 0,
      total: await getVocabularyCount(installId),
    };
  }
  return result;
}

export async function getVocabularyCount(installId) {
  if (!db || !installId) return 0;
  try {
    const row = await db.get(
      "SELECT count FROM vocab_counts WHERE installId = ?",
      installId
    );
    return row?.count ?? 0;
  } catch (err) {
    console.warn("Vocabulary count failed", err);
    return 0;
  }
}

// Manual test:
// - Play 2 rounds with the same words for the same installId.
// - Ensure the count increases only after round 1 and persists after restart.
