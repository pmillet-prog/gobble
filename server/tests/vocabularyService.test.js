import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";

const tmpRoot = path.resolve(".tmp");
await mkdir(tmpRoot, { recursive: true });
const dataDir = await mkdtemp(path.join(tmpRoot, "vocabulary-sql-test-"));
process.env.GOBBLE_DATA_DIR = dataDir;
const vocabulary = await import("../stats/vocabularyService.js");
const { getWeekStartTs } = await import("../stats/weeklyStatsService.js");
const { recordRoundVocabularyProgress } = await import("../stats/roundVocabularyProgress.js");
const { resolveVocabRoundProgress } = await import("../../src/features/stats/vocabRoundProgress.js");
const { scoreWordOnGridWithPath } = await import("../../shared/gameLogic.js");
let serviceDb;
const originalExec = Database.prototype.exec;
const captureDb = mock.method(Database.prototype, "exec", function (...args) {
  serviceDb = this;
  return originalExec.apply(this, args);
});
await vocabulary.initVocabularyService();
captureDb.mock.restore();
const inspector = await open({ filename: path.join(dataDir, "gobble.db"), driver: sqlite3.Database });
const ts = Date.parse("2026-09-11T12:00:00Z");
after(async () => {
  await inspector.close();
  await serviceDb.close();
  const relative = path.relative(tmpRoot, dataDir);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  await rm(dataDir, { recursive: true, force: true });
});

test("SQL distinguishes known short words and new long words across linked identities", async () => {
  await vocabulary.recordVocabularyBatch([{ installId: "old-device", words: ["CHAT", "ÉTÉ"], ts }]);
  const result = await vocabulary.recordVocabularyBatch([{
    installId: "101", installIds: ["101", "old-device"],
    words: ["chat", "ETE", "ANTICONSTITUTIONNELLEMENT", "anticonstitutionnellement"], ts,
  }]);
  assert.deepEqual(result["101"].newWords, ["anticonstitutionnellement"]);
  assert.deepEqual(result["101"].newWeeklyWords, ["anticonstitutionnellement"]);
  assert.equal(result["101"].beforeTotal, 2);
  assert.equal(result["101"].added, 1);
  assert.equal(result["101"].total, 3);
  assert.equal(result["101"].weeklyAdded, 1);
  assert.equal(result["101"].weeklyTotal, 3);
  assert.equal(await vocabulary.getVocabularyCountForInstallIds(["101", "old-device"]), 3);
});

test("a known season word can be new for a week; the summary uses the round's week", async () => {
  const priorWeek = ts - 7 * 86400000;
  await vocabulary.recordVocabularyBatch([{ installId: "102", words: ["CHAT"], ts: priorWeek }]);
  const result = await vocabulary.recordVocabularyBatch([{ installId: "102", words: ["CHAT", "INCONSTITUTIONNEL"], ts }]);
  assert.deepEqual(result["102"].newWords, ["inconstitutionnel"]);
  assert.deepEqual(result["102"].newWeeklyWords, ["chat", "inconstitutionnel"]);
  assert.equal(result["102"].beforeWeeklyTotal, 0);
  assert.equal(result["102"].weeklyTotal, 2);
  const historical = await vocabulary.recordVocabularyBatch([{ installId: "103", words: ["CHAT"], ts: priorWeek }]);
  assert.equal(historical["103"].weeklyTotal, 1);
  assert.equal(historical["103"].weekStartTs, getWeekStartTs(priorWeek));
});

test("replaying a saved round adds no season or weekly words", async () => {
  const entries = [{ installId: "104", words: ["CHAT", "HIPPOPOTAME"], ts }];
  await vocabulary.recordVocabularyBatch(entries);
  const result = (await vocabulary.recordVocabularyBatch(entries))["104"];
  assert.equal(result.added, 0);
  assert.equal(result.weeklyAdded, 0);
  assert.deepEqual(result.newWords, []);
  assert.deepEqual(result.newWeeklyWords, []);
  assert.equal(result.beforeTotal, result.total);
  assert.equal(result.beforeWeeklyTotal, result.weeklyTotal);
});

test("concurrent saves return the counts and words of their own committed transaction", async () => {
  const results = await Promise.all([
    vocabulary.recordVocabularyBatch([{ installId: "105", words: ["CHAT"], ts }]),
    vocabulary.recordVocabularyBatch([{ installId: "105", words: ["CHAT", "HIPPOPOTAME"], ts }]),
  ]);
  const first = results[0]["105"];
  const second = results[1]["105"];
  assert.deepEqual([first.beforeTotal, first.total, first.added, first.newWords], [0, 1, 1, ["chat"]]);
  assert.deepEqual([second.beforeTotal, second.total, second.added, second.newWords], [1, 2, 1, ["hippopotame"]]);
  assert.deepEqual([first.weeklyTotal, second.beforeWeeklyTotal, second.weeklyTotal], [1, 1, 2]);
});

test("SQL read failures are not reported as an empty history or zero vocabulary", async () => {
  await inspector.exec("ALTER TABLE vocab_words RENAME TO vocab_words_unavailable");
  try {
    await assert.rejects(vocabulary.getKnownVocabWordsForInstallIds(["101"], ["CHAT"]), /no such table/);
    await assert.rejects(vocabulary.getVocabularyCountForInstallIds(["101"]), /no such table/);
  } finally {
    await inspector.exec("ALTER TABLE vocab_words_unavailable RENAME TO vocab_words");
  }
  await inspector.exec("ALTER TABLE vocab_weekly_words RENAME TO vocab_weekly_words_unavailable");
  try {
    await assert.rejects(vocabulary.getWeeklyVocabularyCountForInstallIds(["101"], ts), /no such table/);
  } finally {
    await inspector.exec("ALTER TABLE vocab_weekly_words_unavailable RENAME TO vocab_weekly_words");
  }
});

test("a rejected SQL write rolls back the whole batch without publishing discoveries", async () => {
  await inspector.exec(`CREATE TRIGGER reject_vocab_test BEFORE INSERT ON vocab_weekly_words
    WHEN NEW.installId = '106' BEGIN SELECT RAISE(ABORT, 'test write failure'); END`);
  try {
    await assert.rejects(vocabulary.recordVocabularyBatch([{ installId: "106", words: ["HIPPOPOTAME"], ts }]), /test write failure/);
    assert.equal((await inspector.get("SELECT COUNT(*) AS count FROM vocab_words WHERE installId = '106'")).count, 0);
  } finally {
    await inspector.exec("DROP TRIGGER reject_vocab_test");
  }
  const saved = (await vocabulary.recordVocabularyBatch([{ installId: "106", words: ["HIPPOPOTAME"], ts }]))["106"];
  assert.deepEqual(saved.newWords, ["hippopotame"]);
  assert.equal(saved.total, 1);
});

test("retrying a rolled-back transaction does not double the SQL counter or discoveries", async () => {
  let failedOnce = false;
  const failCommit = mock.method(Database.prototype, "exec", function (sql, ...args) {
    if (this === serviceDb && sql === "COMMIT" && !failedOnce) {
      failedOnce = true;
      return Promise.reject(Object.assign(new Error("SQLITE_BUSY: test commit failure"), { code: "SQLITE_BUSY" }));
    }
    return originalExec.call(this, sql, ...args);
  });
  try {
    const result = (await vocabulary.recordVocabularyBatch([{ installId: "107", words: ["CHAT"], ts }]))["107"];
    assert.equal(failedOnce, true);
    assert.equal(result.added, 1);
    assert.equal(result.weeklyAdded, 1);
    assert.equal(result.total, 1);
    assert.equal((await inspector.get("SELECT count FROM vocab_counts WHERE installId = '107'")).count, 1);
  } finally { failCommit.mock.restore(); }
});

test("identity migration preserves both histories and their word deduplication", async () => {
  await vocabulary.recordVocabularyBatch([
    { installId: "108", words: ["CHAT"], ts },
    { installId: "migration-device", words: ["CHAT", "HIPPOPOTAME"], ts },
  ]);
  await vocabulary.migrateVocabularyProfile("108", ["migration-device"]);
  assert.equal(await vocabulary.getVocabularyCountForInstallIds(["108", "migration-device"]), 2);
  assert.equal(await vocabulary.getWeeklyVocabularyCountForInstallIds(["108", "migration-device"], ts), 2);
  const result = (await vocabulary.recordVocabularyBatch([{ installId: "108", words: ["CHAT", "HIPPOPOTAME", "ANTICONSTITUTIONNELLEMENT"], ts }]))["108"];
  assert.deepEqual(result.newWords, ["anticonstitutionnellement"]);
});

function roundDependencies() {
  const savedStats = [];
  const warnings = [];
  return {
    savedStats, warnings,
    recordVocabularyBatch: vocabulary.recordVocabularyBatch,
    computeWeeklyVocabRankMap: async (_ts, entries) => new Map(entries.map((entry) => [entry.playerKey, entry.weeklyVocabCount ? 1 : null])),
    recordVocabCount: (...args) => savedStats.push(["season", ...args]),
    recordWeeklyVocabCount: (...args) => savedStats.push(["week", ...args]),
    logger: { warn: (...args) => warnings.push(args) },
  };
}

test("AA validates as a two-letter word and never counts twice in the same season or week", async () => {
  const board = ["A", "A", ...Array(14).fill("Z")].map((letter) => ({ letter, bonus: null }));
  const scored = scoreWordOnGridWithPath("AA", board, [0, 1]);
  assert.equal(scored?.norm, "aa");

  const first = (await vocabulary.recordVocabularyBatch([
    { installId: "aa-old-device", words: [scored.norm], ts: ts - 7 * 86400000 },
  ]))["aa-old-device"];
  assert.equal(first.added, 1);
  assert.equal(first.weeklyAdded, 1);
  assert.deepEqual([...await vocabulary.getKnownVocabWordsForInstallIds(["111", "aa-old-device"], ["AA"])], ["aa"]);

  const words = ["AA", "aa", "ANTICONSTITUTIONNELLEMENT"];
  const entries = [{ installId: "111", installIds: ["111", "aa-old-device"], nick: "Test AA", playerKey: "install:111", words, ts }];
  const results = [{ nick: "Test AA", words }];
  await recordRoundVocabularyProgress({ results, entries, atTs: ts }, roundDependencies());
  assert.deepEqual(results[0].newVocabWords, ["anticonstitutionnellement"]);
  assert.deepEqual(results[0].newWeeklyVocabWords, ["aa", "anticonstitutionnellement"]);
  const progress = resolveVocabRoundProgress({ result: results[0] });
  assert.equal(progress.delta, 1);
  assert.equal(progress.weeklyDelta, 2);
  assert.equal(progress.newWords.includes("aa"), false);

  await recordRoundVocabularyProgress({ results, entries, atTs: ts }, roundDependencies());
  const replay = resolveVocabRoundProgress({ result: results[0] });
  assert.equal(replay.delta, 0);
  assert.equal(replay.weeklyDelta, 0);
  assert.deepEqual(replay.newWords, []);
});

test("the round payload and client progression match the words committed to SQLite", async () => {
  await vocabulary.recordVocabularyBatch([{ installId: "109", words: ["CHAT"], ts: ts - 7 * 86400000 }]);
  const words = ["chat", "anticonstitutionnellement"];
  const results = [{ nick: "Test SQL", words }];
  const dependencies = roundDependencies();
  await recordRoundVocabularyProgress({
    results, entries: [{ installId: "109", nick: "Test SQL", playerKey: "install:109", words, ts }], atTs: ts,
  }, dependencies);
  const result = results[0];
  assert.deepEqual(result.newVocabWords, ["anticonstitutionnellement"]);
  assert.deepEqual(result.newWeeklyVocabWords, words);
  assert.deepEqual(result.vocabProgress, { status: "recorded", beforeCount: 1, afterCount: 2, weekStartTs: getWeekStartTs(ts) });
  assert.deepEqual(result.vocabWeeklyRace, { beforeCount: 0, afterCount: 2 });
  assert.deepEqual(dependencies.savedStats, [["season", "install:109", "Test SQL", 2, ts], ["week", "install:109", "Test SQL", 2, ts]]);
  const progress = resolveVocabRoundProgress({ result, count: 999, weeklyCount: 999 });
  assert.equal(progress.count, await vocabulary.getVocabularyCount("109"));
  assert.equal(progress.weeklyCount, await vocabulary.getWeeklyVocabularyCount("109", ts));
  assert.equal(progress.delta, 1);
  assert.equal(progress.weeklyDelta, 2);
});

test("a failed round write publishes neither progress nor leaderboard counts", async () => {
  await inspector.exec(`CREATE TRIGGER reject_round_test BEFORE INSERT ON vocab_weekly_words
    WHEN NEW.installId = '110' BEGIN SELECT RAISE(ABORT, 'test round failure'); END`);
  try {
    const results = [{ nick: "Test failure", newVocabWords: [] }];
    const dependencies = roundDependencies();
    await recordRoundVocabularyProgress({
      results, entries: [{ installId: "110", nick: "Test failure", playerKey: "install:110", words: ["CHAT"], ts }], atTs: ts,
    }, dependencies);
    assert.deepEqual(results[0].vocabProgress, { status: "unavailable" });
    assert.equal(results[0].newVocabWords, null);
    assert.deepEqual(dependencies.savedStats, []);
    assert.equal(dependencies.warnings.length, 1);
    assert.equal(resolveVocabRoundProgress({ result: results[0], count: 999, baseline: 0 }).available, false);
    assert.equal(await vocabulary.getVocabularyCount("110"), 0);
  } finally { await inspector.exec("DROP TRIGGER reject_round_test"); }
});
