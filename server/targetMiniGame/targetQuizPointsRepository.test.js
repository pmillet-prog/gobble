import test from "node:test";
import assert from "node:assert/strict";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createTargetQuizProgressRepository } from "./targetQuizProgressRepository.js";
import { createTargetQuizPointsRepository } from "./targetQuizPointsRepository.js";
import { readGobblarsHistory } from "../stats/gobblarsHistory.js";

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

test("exact threshold and surplus credit the wallet only at settlement, exactly once", async t => {
  const f = await fixture(t);
  await f.db.run("INSERT INTO target_quiz_points (user_id, total, points, cycles, updated_at) VALUES (7, 9900, 9900, 0, 0)");
  const first = await f.answer(100, { questionToken: "reward-token" });
  assert.deepEqual(first.after, { total: 10000, points: 0, cycles: 1 });
  assert.equal(first.reward, null);
  assert.equal((await f.db.get("SELECT count(*) AS n FROM gobblar_ledger")).n, 0);
  assert.deepEqual(await f.answer(100, { questionToken: "reward-token" }), first);
  assert.equal((await f.cursors.load("user:7")).questionIndex, 1, "retry does not advance twice");
  await f.answer(-75);
  const settled = await f.finish();
  assert.equal(settled.rewards[0].amount, 50);
  assert.equal(settled.rewards[0].balance, 50);
  assert.deepEqual(await f.finish(), settled);
  assert.deepEqual(await f.repository.load("user:7"), { total: 9925, points: 0, cycles: 1 });
  await f.db.run("UPDATE target_quiz_points SET points = 9950 WHERE user_id = 7");
  const next = await f.answer(200, { roundId: "live#43" });
  assert.equal(next.after.points, 150);
  assert.equal((await f.finish({ roundId: "live#43" })).rewards[0].balance, 100);
  const history = await readGobblarsHistory(f.db, { installId: "7" });
  assert.equal(history.entries.length, 2);
  assert.ok(history.entries.every(entry => entry.kind === "target_quiz_milestone" && entry.amount === 50));
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
  assert.equal((await f.finish()).rewards[0].amount, 50);
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
  assert.equal((await f.db.get("SELECT balance FROM gobblar_profiles WHERE installId = '7'")).balance, 50);
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
