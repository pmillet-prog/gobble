import assert from "node:assert/strict";
import test from "node:test";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createGotusStatsRepository } from "./gotusStatsRepository.js";
import { createAchievementCollectionRepository } from "./achievementCollectionRepository.js";
import { readGobblarsHistory } from "./gobblarsHistory.js";

const WEEK = Date.parse("2026-10-18T22:00:00Z");
const END = Date.parse("2026-10-25T23:00:00Z");

async function fixture(t) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username_display TEXT);
    INSERT INTO users VALUES(1,'Tigre'),(2,'Pounie');
    CREATE TABLE gobblar_profiles(installId TEXT PRIMARY KEY,balance INTEGER NOT NULL DEFAULT 0,updatedAt INTEGER);
    CREATE TABLE gobblar_ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,installId TEXT,ts INTEGER,delta INTEGER,reason TEXT,meta TEXT);`);
  const repository = createGotusStatsRepository({ getDb: async () => db, now: () => WEEK - 1000 });
  const achievements = createAchievementCollectionRepository({ getDb: async () => db, now: () => WEEK - 1000 });
  await achievements.bootstrap();
  await repository.init();
  const win = (index, patch = {}) => repository.recordWin({
    userId: 1, roomId: "live", roundId: `round-${index}`, wonAt: WEEK + index,
    attemptsUsed: 3, training: false, ...patch,
  });
  return { db, repository, achievements, win };
}

test("only confirmed live wins count, once per account and room round", async t => {
  const f = await fixture(t);
  assert.equal((await f.win(1)).recorded, true);
  assert.equal((await f.win(1)).duplicate, true);
  assert.equal((await f.win(1, { roomId: "other-room" })).recorded, true);
  assert.equal((await f.win(1, { userId: 2 })).recorded, true);
  for (const training of [true, undefined, "false"]) {
    assert.equal((await f.win(2, { training })).excluded, true);
  }
  assert.equal((await f.win(2, { userId: 999 })).ok, false);
  await assert.rejects(f.win(2, { userId: 0 }), /invalid_gotus_win/);
  assert.equal((await f.repository.profile(1)).totalWins, 2);
  assert.equal((await f.repository.profile(2)).totalWins, 1);
  assert.equal((await f.db.get("SELECT COUNT(*) AS n FROM gotus_wins")).n, 3);
  assert.equal((await f.db.get("SELECT COUNT(*) AS n FROM gobblar_ledger")).n, 0);
  assert.equal((await f.achievements.snapshot(1)).counts.gotus_100, 0);
});

test("each tenth live word awards exactly 500 gobblars with a replayable receipt", async t => {
  const f = await fixture(t);
  for (let index = 1; index <= 9; index++) assert.equal((await f.win(index)).progression.reward, null);
  assert.deepEqual(await f.repository.profile(1), { totalWins: 9, words: 9, cycles: 0, target: 10, rewardAmount: 500 });
  assert.equal((await f.win(10, { training: true })).excluded, true);
  const tenth = await f.win(10);
  assert.equal(tenth.progression.before.words, 9);
  assert.deepEqual(tenth.progression.after, { totalWins: 10, words: 0, cycles: 1, target: 10, rewardAmount: 500 });
  assert.equal(tenth.progression.reward.amount, 500);
  assert.equal(tenth.progression.reward.balance, 500);
  const repeated = await f.win(10);
  assert.equal(repeated.recorded, false);
  assert.deepEqual(repeated.progression, tenth.progression);
  for (let index = 11; index <= 20; index++) await f.win(index);
  assert.equal((await f.db.get("SELECT balance FROM gobblar_profiles WHERE installId='1'")).balance, 1000);
  const history = await readGobblarsHistory(f.db, { installId: "1" });
  assert.deepEqual(history.entries.map(row => [row.kind, row.amount]), [["gotus_milestone", 500], ["gotus_milestone", 500]]);
  const reopened = createGotusStatsRepository({ getDb: async () => f.db });
  assert.deepEqual(await reopened.profile(1), { totalWins: 20, words: 0, cycles: 2, target: 10, rewardAmount: 500 });
  assert.equal((await reopened.recordWin({ userId: 1, roomId: "live", roundId: "round-20", wonAt: END, attemptsUsed: 1, training: false })).duplicate, true);
  assert.equal((await f.db.get("SELECT COUNT(*) AS n FROM gobblar_ledger")).n, 2);
});

test("Gotus unlocks one golden trophy at 100 live wins, without training or lower tiers", async t => {
  const f = await fixture(t);
  for (let index = 1; index < 100; index++) await f.win(index);
  assert.equal((await f.achievements.snapshot(1)).counts.gotus_100, 0);
  await f.win(100, { training: true });
  assert.equal((await f.repository.profile(1)).totalWins, 99);
  const hundredth = await f.win(100);
  assert.deepEqual(hundredth.achievementAwards.map(row => [row.id, row.count, row.roundId]), [["gotus_100", 1, "round-100"]]);
  for (let index = 101; index <= 200; index++) assert.deepEqual((await f.win(index)).achievementAwards, []);
  const collection = await f.achievements.snapshot(1);
  assert.equal(collection.counts.gotus_100, 1);
  assert.equal(collection.counts["gotus_100:bronze"], undefined);
  assert.equal(collection.points, 80);
  assert.equal((await f.repository.profile(1)).totalWins, 200);
});

test("a failed trophy write rolls back the hundredth word, wallet, ledger and stats together", async t => {
  const f = await fixture(t);
  for (let index = 1; index < 100; index++) await f.win(index);
  await f.db.exec("CREATE TRIGGER reject_gotus_trophy BEFORE INSERT ON achievement_events_v2 WHEN NEW.trophy_id='gotus_100' BEGIN SELECT RAISE(ABORT,'gotus_trophy_unavailable'); END");
  await assert.rejects(f.win(100), /gotus_trophy_unavailable/);
  assert.equal((await f.repository.profile(1)).totalWins, 99);
  assert.equal((await f.db.get("SELECT COUNT(*) AS n FROM gotus_wins")).n, 99);
  assert.equal((await f.db.get("SELECT balance FROM gobblar_profiles WHERE installId='1'")).balance, 4500);
  assert.equal((await f.db.get("SELECT COUNT(*) AS n FROM gobblar_ledger")).n, 9);
  await f.db.exec("DROP TRIGGER reject_gotus_trophy");
  assert.equal((await f.win(100)).achievementAwards[0].id, "gotus_100");
  await f.win(100);
  assert.equal((await f.repository.profile(1)).totalWins, 100);
  assert.equal((await f.db.get("SELECT balance FROM gobblar_profiles WHERE installId='1'")).balance, 5000);
  assert.equal((await f.db.get("SELECT COUNT(*) AS n FROM gobblar_ledger")).n, 10);
});

test("weekly and all-time rankings keep Paris boundaries and count words rather than points", async t => {
  const f = await fixture(t);
  await f.win(1, { wonAt: WEEK - 1 });
  await f.win(2, { wonAt: WEEK });
  await f.win(3, { wonAt: END - 1 });
  await f.win(4, { wonAt: END });
  await f.win(5, { userId: 2, wonAt: WEEK + 100 });
  await f.win(6, { userId: 2, wonAt: WEEK + 101, training: true });
  const stats = await f.repository.boards({ weekStartTs: WEEK, nextResetTs: END, topN: 50 });
  assert.deepEqual(stats.boards.gotusWins.map(row => [row.userId, row.wins]), [[1, 2], [2, 1]]);
  assert.deepEqual(stats.allTimeBoards.gotusWins.map(row => [row.userId, row.wins]), [[1, 4], [2, 1]]);
  assert.deepEqual(stats.boards.gotusWins[1], { userId: 2, playerKey: "install:2", nick: "Pounie", wins: 1 });
  assert.equal(stats.trackingStartTs.gotusWins, WEEK - 1000);
  assert.equal((await f.repository.boards({ weekStartTs: END, nextResetTs: END + 604800000, topN: 1 })).boards.gotusWins[0].wins, 1);
});
