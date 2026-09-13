import { createHash } from "node:crypto";
import { normalizeWord } from "../../shared/gameLogic.js";
import { getWeekStartTs } from "./weeklyStatsService.js";

export const hashVocabularyWord = (word) => createHash("sha1").update(word).digest("hex");
const uniqueWords = (words) => Array.from(new Set(
  (Array.isArray(words) ? words : []).filter((word) => typeof word === "string").map(normalizeWord).filter(Boolean)
));

// These queries deliberately propagate SQL failures: an unavailable history is not empty.
export async function readKnownVocabularyHashes(db, installIds, hashes, weekStartTs = null) {
  const found = new Set();
  const weekly = weekStartTs !== null;
  for (let i = 0; i < installIds.length; i += 100) {
    const ids = installIds.slice(i, i + 100);
    for (let h = 0; h < hashes.length; h += 800) {
      const chunk = hashes.slice(h, h + 800);
      const rows = await db.all(
        `SELECT DISTINCT wordHash FROM ${weekly ? "vocab_weekly_words" : "vocab_words"}
         WHERE installId IN (${ids.map(() => "?").join(",")})
           AND wordHash IN (${chunk.map(() => "?").join(",")})
           ${weekly ? "AND weekStartTs = ?" : ""}`,
        [...ids, ...chunk, ...(weekly ? [weekStartTs] : [])]
      );
      rows.forEach((row) => found.add(row.wordHash));
    }
  }
  return found;
}

export async function readVocabularyTotals(db, installIds, weekStartTs) {
  const placeholders = installIds.map(() => "?").join(",");
  const row = await db.get(
    `SELECT
       (SELECT COUNT(DISTINCT wordHash) FROM vocab_words
        WHERE installId IN (${placeholders})) AS total,
       (SELECT COUNT(DISTINCT wordHash) FROM vocab_weekly_words
        WHERE installId IN (${placeholders}) AND weekStartTs = ?) AS weeklyTotal`,
    [...installIds, ...installIds, weekStartTs]
  );
  return { total: row.total, weeklyTotal: row.weeklyTotal };
}

// Called inside the serialized IMMEDIATE transaction. Every retry gets fresh accumulators.
// Only the caller's successful COMMIT makes these words and totals publishable.
export async function writeVocabularyBatch(db, entries, now) {
  const summaries = new Map();
  for (const entry of entries) {
    const installId = typeof entry?.installId === "string" ? entry.installId.trim() : "";
    if (!installId) continue;
    const installIds = Array.from(new Set([installId, ...(Array.isArray(entry.installIds) ? entry.installIds : [])]
      .filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim())));
    const ts = Number.isFinite(entry.ts) ? entry.ts : now;
    const weekStartTs = getWeekStartTs(ts);
    const words = uniqueWords(entry.words);
    const weeklyWords = uniqueWords(Array.isArray(entry.weeklyWords) ? entry.weeklyWords : entry.words);
    const before = await readVocabularyTotals(db, installIds, weekStartTs);
    const known = await readKnownVocabularyHashes(db, installIds, words.map(hashVocabularyWord));
    const weeklyKnown = await readKnownVocabularyHashes(db, installIds, weeklyWords.map(hashVocabularyWord), weekStartTs);
    const newWords = [];
    const newWeeklyWords = [];
    const nick = typeof entry.nick === "string" ? entry.nick.trim().slice(0, 25) : "";
    if (nick) {
      await db.run(
        `INSERT INTO vocab_profiles (installId, nick, updatedAt) VALUES (?, ?, ?)
         ON CONFLICT(installId) DO UPDATE SET nick = excluded.nick, updatedAt = excluded.updatedAt`,
        installId, nick, ts
      );
    }
    for (const word of words) {
      const hash = hashVocabularyWord(word);
      const inserted = await db.run(
        "INSERT OR IGNORE INTO vocab_words (installId, wordHash, firstSeenTs) VALUES (?, ?, ?)",
        installId, hash, ts
      );
      if (inserted.changes > 0 && !known.has(hash)) newWords.push(word);
    }
    for (const word of weeklyWords) {
      const hash = hashVocabularyWord(word);
      const inserted = await db.run(
        "INSERT OR IGNORE INTO vocab_weekly_words (installId, weekStartTs, wordHash, firstSeenTs) VALUES (?, ?, ?, ?)",
        installId, weekStartTs, hash, ts
      );
      if (inserted.changes > 0 && !weeklyKnown.has(hash)) newWeeklyWords.push(word);
    }
    // The leaderboard cache must match stored rows, including after a retried transaction.
    await db.run(
      `INSERT INTO vocab_counts (installId, count, updatedAt)
       SELECT ?, COUNT(*), ? FROM vocab_words WHERE installId = ?
       ON CONFLICT(installId) DO UPDATE SET count = excluded.count, updatedAt = excluded.updatedAt`,
      installId, now, installId
    );
    const after = await readVocabularyTotals(db, installIds, weekStartTs);
    const previous = summaries.get(installId);
    const allNewWords = [...(previous?.newWords || []), ...newWords];
    const allNewWeeklyWords = [...(previous?.weekStartTs === weekStartTs ? previous.newWeeklyWords : []), ...newWeeklyWords];
    summaries.set(installId, {
      newWords: allNewWords,
      newWeeklyWords: allNewWeeklyWords,
      added: allNewWords.length,
      weeklyAdded: allNewWeeklyWords.length,
      beforeTotal: previous?.beforeTotal ?? before.total,
      beforeWeeklyTotal: previous?.weekStartTs === weekStartTs ? previous.beforeWeeklyTotal : before.weeklyTotal,
      total: after.total,
      weeklyTotal: after.weeklyTotal,
      weekStartTs,
    });
  }
  return Object.fromEntries(summaries);
}
