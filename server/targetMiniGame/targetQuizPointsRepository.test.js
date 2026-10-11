import test from "node:test";
import assert from "node:assert/strict";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createTargetQuizProgressRepository } from "./targetQuizProgressRepository.js";
import { createTargetQuizPointsRepository } from "./targetQuizPointsRepository.js";
import { readGobblarsHistory } from "../stats/gobblarsHistory.js";
import { createAchievementCollectionRepository } from "../stats/achievementCollectionRepository.js";

async function fixture(t) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`CREATE TABLE gobblar_profiles (installId TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER);
    CREATE TABLE gobblar_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, installId TEXT, ts INTEGER, delta INTEGER, reason TEXT, meta TEXT);`);
  const cursors = createTargetQuizProgressRepository({ getDb: async () => db });
  const repository = createTargetQuizPointsRepository({ getDb: async () => db, cursors, now: () => 123456 });
  await repository.init();
  let sequence = 0;
  const answer = (delta, extra = {}) => repository.answer({ playerKey: "user:7", roundId: "live#42", endsAt: 200000, delta,
    questionToken: `question-${++sequence}`, progress: { version: "v1", routeIndex: 0, questionIndex: sequence }, ...extra });
  const finish = (extra = {}) => repository.finish({ playerKey: "user:7", roundId: "live#42", ...extra });
  return { db, cursors, repository, answer, finish };
}

test("the signed total may go negative while the independent gauge stops at zero", async t => {
  const f = await fixture(t);
  assert.deepEqual(await f.repository.load("user:7"), { total: 0, points: 0, cycles: 0 });
  await f.answer(-75);
  assert.deepEqual((await f.answer(-75)).after, { total: -150, points: 0, cycles: 0 });
  assert.deepEqual((await f.answer(100)).after, { total: -50, points: 100, cycles: 0 });
  assert.deepEqual((await f.answer(-75)).after, { total: -125, points: 25, cycles: 0 });
  assert.deepEqual(await f.repository.load("user:7"), { total: 0, points: 0, cycles: 0 }, "answers remain provisional");
  await f.finish();
  assert.deepEqual(await f.repository.load("user:7"), { total: -125, points: 25, cycles: 0 });
});

test("exact threshold and surplus credit the wallet only at settlement, exactly once, preserving earlier rewards", async t => {
  const f = await fixture(t);
  await f.db.run("INSERT INTO target_quiz_points (user_id, total, points, cycles, updated_at) VALUES (7, 19900, 9900, 1, 0)");
  await f.db.run("INSERT INTO gobblar_profiles (installId, balance, updatedAt) VALUES ('7', 50, 0)");
  await f.db.run("INSERT INTO gobblar_ledger (installId, ts, delta, reason, meta) VALUES ('7', 0, 50, 'target_quiz_milestone', '{}')");
  const first = await f.answer(100, { questionToken: "reward-token" });
  assert.deepEqual(first.after, { total: 20000, points: 0, cycles: 2 });
  assert.equal(first.reward, null);
  assert.equal((await f.db.get("SELECT count(*) AS n FROM gobblar_ledger")).n, 1);
  assert.equal((await f.db.get("SELECT balance FROM gobblar_profiles WHERE installId = '7'")).balance, 50);
  assert.deepEqual(await f.answer(100, { questionToken: "reward-token" }), first);
  assert.equal((await f.cursors.load("user:7")).questionIndex, 1, "retry does not advance twice");
  await f.answer(-75);
  const settled = await f.finish();
  assert.equal(settled.rewards[0].amount, 500);
  assert.equal(settled.rewards[0].balance, 550);
  assert.deepEqual(await f.finish(), settled);
  assert.deepEqual(await f.repository.load("user:7"), { total: 19925, points: 0, cycles: 2 });
  await f.db.run("UPDATE target_quiz_points SET points = 9950 WHERE user_id = 7");
  const next = await f.answer(200, { roundId: "live#43" });
  assert.equal(next.after.points, 150);
  assert.equal((await f.finish({ roundId: "live#43" })).rewards[0].balance, 1050);
  const history = await readGobblarsHistory(f.db, { installId: "7" });
  assert.equal(history.entries.length, 3);
  assert.ok(history.entries.every(entry => entry.kind === "target_quiz_milestone"));
  assert.deepEqual(history.entries.map(entry => entry.amount), [500, 500, 50], "earlier gains retain their original amount");
  assert.equal((await readGobblarsHistory(f.db, { installId: "8" })).entries.length, 0);
});

test("a failed cursor write rolls the entire award back and retry stays safe", async t => {
  const f = await fixture(t);
  await f.db.run("INSERT INTO target_quiz_points (user_id, total, points, cycles, updated_at) VALUES (7, 9990, 9990, 0, 0)");
  await assert.rejects(f.answer(100, { progress: { version: "v1", routeIndex: -1, questionIndex: 2 } }), /invalid.*progress/);
  assert.deepEqual(await f.repository.load("user:7"), { total: 9990, points: 9990, cycles: 0 });
  assert.equal((await f.db.get("SELECT count(*) AS n FROM gobblar_ledger")).n, 0);
  assert.equal((await f.db.get("SELECT count(*) AS n FROM gobblar_profiles")).n, 0);
  assert.equal(await f.cursors.load("user:7"), null);
  await f.answer(100);
  assert.equal((await f.finish()).rewards[0].amount, 500);
});

test("knockout cancels gains, losses and threshold awards but retains the question cursor", async t => {
  const f = await fixture(t);
  await f.db.run("INSERT INTO target_quiz_points (user_id, total, points, cycles, updated_at) VALUES (7, -300, 9950, 2, 0)");
  await f.answer(100);
  await f.answer(-75);
  const cancelled = await f.finish({ cancelled: true });
  assert.deepEqual(cancelled, { before: { total: -300, points: 9950, cycles: 2 }, after: { total: -300, points: 9950, cycles: 2 }, steps: [], rewards: [] });
  assert.deepEqual(await f.finish({ cancelled: true }), cancelled);
  await f.finish(); // Closing the round after a knockout cannot award anything.
  assert.deepEqual(await f.repository.load("user:7"), cancelled.before);
  assert.equal((await f.cursors.load("user:7")).questionIndex, 2);
  assert.equal((await f.db.get("SELECT count(*) AS n FROM gobblar_ledger")).n, 0);
  await assert.rejects(f.answer(100), /round_finished/);
  await f.answer(100, { roundId: "live#43" });
  await f.finish({ roundId: "live#43" });
  const earned = await f.repository.load("user:7");
  await f.answer(-75, { roundId: "live#44" });
  await f.finish({ roundId: "live#44", cancelled: true });
  assert.deepEqual(await f.repository.load("user:7"), earned, "previous rounds remain untouched");
  assert.equal((await f.db.get("SELECT balance FROM gobblar_profiles WHERE installId = '7'")).balance, 500);
});

test("persisted provisional answers survive repository reload and can still be cancelled", async t => {
  const f = await fixture(t);
  await f.answer(100);
  const reopened = createTargetQuizPointsRepository({ getDb: async () => f.db, cursors: f.cursors, now: () => 123456 });
  await reopened.finish({ playerKey: "user:7", roundId: "live#42", cancelled: true });
  assert.deepEqual(await reopened.load("user:7"), { total: 0, points: 0, cycles: 0 });
});

test("expired orphaned sessions settle on the next profile read without duplicate rewards", async t => {
  const f = await fixture(t);
  await f.db.run("INSERT INTO target_quiz_points (user_id, total, points, cycles, updated_at) VALUES (7, 9950, 9950, 0, 0)");
  await f.answer(100);
  const reopened = createTargetQuizPointsRepository({ getDb: async () => f.db, cursors: f.cursors, now: () => 300000 });
  assert.deepEqual(await reopened.load("user:7"), { total: 10050, points: 50, cycles: 1 });
  await reopened.load("user:7");
  assert.equal((await f.db.get("SELECT count(*) AS n FROM gobblar_ledger")).n, 1);
});

test("developer simulation and guest cursors never receive account rewards", async t => {
  const f = await fixture(t);
  for (const playerKey of ["dev:user:7", "install:guest"]) {
    assert.equal(await f.answer(100, { playerKey }), null);
    assert.equal(await f.repository.load(playerKey), null);
    assert.ok(await f.cursors.load(playerKey));
  }
  assert.deepEqual(await f.repository.load("user:7"), { total: 0, points: 0, cycles: 0 });
  assert.equal((await f.db.get("SELECT count(*) AS n FROM gobblar_ledger")).n, 0);
});

async function activateAchievements(f, at = 100000) {
  await f.db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,username_display TEXT); INSERT INTO users VALUES(7,'Tigre')");
  const achievements = createAchievementCollectionRepository({ getDb: async () => f.db, now: () => at });
  await achievements.bootstrap();
  return achievements;
}

test("quiz achievements use only confirmed post-launch deltas, survive losses and settle atomically", async t => {
  const f = await fixture(t);
  await f.db.run("INSERT INTO target_quiz_points (user_id,total,points,cycles,updated_at) VALUES(7,9000000,0,0,0)");
  const achievements = await activateAchievements(f);
  assert.equal((await achievements.snapshot(7)).totalCount, 0);
  const initial = await achievements.record({ userId: 7, progress: { eventKey: "earlier-post-launch", changes: { foukro: 19900 } } });
  await achievements.acknowledge(7, initial.map(award => award.eventId));
  await f.answer(100);
  assert.equal((await achievements.snapshot(7)).totalCount, 2);
  assert.equal((await achievements.snapshot(7)).counts.foukro_500000, 0, "provisional answers do not award gold");
  const settled = await f.finish();
  assert.equal(settled.achievementAwards[0].id, "foukro_500000");
  assert.equal(settled.achievementAwards[0].roundId, "42");
  assert.deepEqual(await f.finish(), settled);
  await f.answer(-75, { roundId: "live#43" });
  await f.finish({ roundId: "live#43" });
  assert.equal((await f.repository.load("user:7")).total, 9000025);
  assert.deepEqual(await f.db.get("SELECT value,peak FROM achievement_progress_v2 WHERE user_id=7 AND metric='foukro'"), { value: 19925, peak: 20000 });
  await f.answer(200, { roundId: "live#44" });
  await f.finish({ roundId: "live#44", cancelled: true });
  assert.equal((await achievements.snapshot(7)).counts.foukro_500000, 1);
  await f.answer(200, { roundId: "live#45" });
  await f.db.exec("CREATE TRIGGER reject_peak BEFORE UPDATE ON achievement_progress_v2 BEGIN SELECT RAISE(ABORT,'peak rollback'); END");
  await assert.rejects(f.finish({ roundId: "live#45" }), /peak rollback/);
  assert.equal((await f.repository.load("user:7")).total, 9000025);
  assert.equal((await f.db.get("SELECT status FROM target_quiz_pending WHERE user_id=7")).status, "pending");
  await f.db.exec("DROP TRIGGER reject_peak");
  await f.finish({ roundId: "live#45" });
  assert.equal((await achievements.snapshot(7)).counts.foukro_500000, 1);
  assert.equal((await achievements.pending(7)).length, 1);
});

test("a legacy pending session cannot become eligible when more answers arrive after activation", async t => {
  const f = await fixture(t);
  await f.answer(200, { startedAt: 90000 });
  const achievements = await activateAchievements(f);
  // NULL is the migration value for sessions created by the earlier server.
  await f.db.run("UPDATE target_quiz_pending SET started_at=NULL");
  await f.answer(200, { startedAt: 123456 });
  assert.equal((await f.db.get("SELECT started_at FROM target_quiz_pending")).started_at, null);
  await f.finish();
  assert.equal((await f.repository.load("user:7")).total, 400);
  assert.equal((await f.db.get("SELECT count(*) AS n FROM achievement_progress_v2")).n, 0);
  await f.answer(200, { roundId: "live#43", startedAt: 99999 });
  await f.finish({ roundId: "live#43" });
  assert.equal((await f.db.get("SELECT count(*) AS n FROM achievement_progress_v2")).n, 0);
  await f.answer(100, { roundId: "live#44", startedAt: 123456 });
  await f.finish({ roundId: "live#44" });
  assert.equal((await f.db.get("SELECT value FROM achievement_progress_v2 WHERE metric='foukro'")).value, 100);
  assert.equal((await achievements.snapshot(7)).totalCount, 0);
});

test("recovered post-launch quiz achievements are returned for immediate publication and remain pending", async t => {
  const f = await fixture(t);
  const achievements = await activateAchievements(f);
  const initial = await achievements.record({ userId: 7, progress: { eventKey: "earlier", changes: { foukro: 19900 } } });
  await achievements.acknowledge(7, initial.map(award => award.eventId));
  await f.answer(100);
  const reopened = createTargetQuizPointsRepository({ getDb: async () => f.db, cursors: f.cursors, now: () => 300000 });
  const recovered = await reopened.load("user:7");
  assert.equal(recovered.achievementAwards[0].id, "foukro_500000");
  assert.equal(recovered.achievementAwards[0].earnedAt, 200000);
  assert.deepEqual(await achievements.pending(7), recovered.achievementAwards);
  assert.equal((await reopened.load("user:7")).achievementAwards, undefined);
});
