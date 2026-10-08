import test from "node:test";
import assert from "node:assert/strict";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createPlayerProgressBoardsRepository, normalizeProgressBoardsRequest } from "./playerProgressBoardsRepository.js";
import { createAvatarObjectivesRepository } from "../avatars/avatarObjectivesRepository.js";
import { createTargetQuizPointsRepository } from "../targetMiniGame/targetQuizPointsRepository.js";
import { createTargetQuizProgressRepository } from "../targetMiniGame/targetQuizProgressRepository.js";
import { getWeekStartTs } from "./parisWeek.js";
import { buildAllTimeGobbleCandidates } from "./allTimeGobbleCandidates.js";

const WEEK = Date.parse("2026-10-04T22:00:00Z"); // Monday 00:00, Paris.
const END = Date.parse("2026-10-11T22:00:00Z");
const LAUNCH = WEEK + 1000;

async function fixture(t) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username_display TEXT);
    INSERT INTO users VALUES (1, 'Premier'), (2, 'Pseudonyme très long conservé'), (3, 'Troisième');
    CREATE TABLE avatar_objective_epochs (objective TEXT PRIMARY KEY, started_at INTEGER);
    CREATE TABLE avatar_objective_progress (user_id INTEGER, objective TEXT, value INTEGER, PRIMARY KEY(user_id, objective));
    CREATE TABLE avatar_objective_events (user_id INTEGER, objective TEXT, event_key TEXT, recorded_at INTEGER, PRIMARY KEY(user_id, objective, event_key));
    CREATE TABLE player_lifetime_stats (installId TEXT PRIMARY KEY, gobbles INTEGER, doubleGobbles INTEGER);
    CREATE TABLE gobblar_profiles (installId TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER);
    CREATE TABLE gobblar_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, installId TEXT, ts INTEGER, delta INTEGER, reason TEXT, meta TEXT);`);
  await db.run("INSERT INTO avatar_objective_epochs VALUES ('lepers_correct_answers', ?)", WEEK - 7 * 86_400_000);
  let now = LAUNCH;
  const cursors = createTargetQuizProgressRepository({ getDb: async () => db });
  const points = createTargetQuizPointsRepository({ getDb: async () => db, cursors, now: () => now });
  await points.init();
  const boards = createPlayerProgressBoardsRepository({ getDb: async () => db });
  const objectives = createAvatarObjectivesRepository({ getDb: async () => db, runWrite: fn => fn(), loadCatalog: async () => ({ families: {} }) });
  let sequence = 0;
  const answer = (userId, delta, roundId = "round", endsAt = END - 1) => points.answer({
    playerKey: `user:${userId}`, delta, roundId, endsAt, questionToken: `answer-${++sequence}`,
    progress: { version: "v1", routeIndex: 0, questionIndex: sequence },
  });
  const finish = (userId, roundId = "round", cancelled = false) => points.finish({ playerKey: `user:${userId}`, roundId, cancelled });
  const read = (extra = {}) => boards.read({ weekStartTs: WEEK, nextResetTs: END, topN: 50, ...extra });
  return { db, points, boards, objectives, answer, finish, read, setNow: value => { now = value; } };
}

test("QPUG rankings reuse dated authoritative events and preserve historical profile totals", async t => {
  const f = await fixture(t);
  await f.db.run("INSERT INTO avatar_objective_progress VALUES (2, 'lepers_correct_answers', 20)");
  const events = [
    { userId: 1, objective: "lepers_correct_answers", eventKey: "before", occurredAt: WEEK - 1 },
    { userId: 1, objective: "lepers_correct_answers", eventKey: "monday", occurredAt: WEEK },
    { userId: 1, objective: "lepers_correct_answers", eventKey: "sunday", occurredAt: END - 1 },
    { userId: 2, objective: "lepers_correct_answers", eventKey: "answer", occurredAt: WEEK + 5000 },
    { userId: 2, objective: "lepers_correct_answers", eventKey: "next-week", occurredAt: END },
    { userId: 999, objective: "lepers_correct_answers", eventKey: "missing-account", occurredAt: WEEK + 5000 },
  ];
  await f.objectives.recordBatch(events);
  await f.objectives.recordBatch(events); // A retry must not multiply either ranking.
  const result = await f.read();
  assert.deepEqual(result.boards.qpugAnswers.map(row => [row.userId, row.correctCount]), [[1, 2], [2, 1]]);
  assert.deepEqual(result.allTimeBoards.qpugAnswers.map(row => [row.userId, row.correctCount]), [[2, 22], [1, 3]]);
  assert.equal(result.allTimeBoards.qpugAnswers[0].nick, "Pseudonyme très long conservé");
  assert.equal(result.allTimeBoards.qpugAnswers[0].playerKey, "install:2");
  assert.equal(result.trackingStartTs.qpugAnswers, WEEK - 7 * 86_400_000);
  assert.equal(result.trackingStartTs.targetQuizPoints, LAUNCH);
});

test("quiz weekly totals include settled signed scores once and exclude provisional or knocked out sessions", async t => {
  const f = await fixture(t);
  await f.db.run("INSERT INTO target_quiz_points (user_id,total,points,cycles,updated_at) VALUES (1, 450, 450, 0, ?)", WEEK - 1);
  await f.answer(1, 100);
  await f.answer(1, -75);
  assert.deepEqual((await f.read()).boards.targetQuizPoints, []);
  await f.finish(1);
  await f.finish(1);
  await f.answer(1, 200, "cancelled");
  await f.finish(1, "cancelled", true);
  await f.finish(1, "cancelled");
  await f.answer(2, -75);
  await f.finish(2);
  const result = await f.read();
  assert.deepEqual(result.boards.targetQuizPoints.map(row => [row.userId, row.points]), [[1, 25], [2, -75]]);
  assert.deepEqual(result.allTimeBoards.targetQuizPoints.map(row => [row.userId, row.points]), [[1, 475], [2, -75]]);
  assert.equal((await f.read({ topN: 1 })).boards.targetQuizPoints.length, 1);
});

test("the weekly score, durable score and wallet settlement share a rollback boundary", async t => {
  const f = await fixture(t);
  await f.db.run("INSERT INTO target_quiz_points (user_id,total,points,cycles,updated_at) VALUES (1, 9950, 9950, 0, ?)", WEEK);
  await f.answer(1, 100);
  await f.db.exec("CREATE TRIGGER reject_weekly BEFORE INSERT ON target_quiz_weekly_stats BEGIN SELECT RAISE(ABORT, 'weekly_unavailable'); END");
  await assert.rejects(f.finish(1), /weekly_unavailable/);
  assert.equal((await f.db.get("SELECT total FROM target_quiz_points WHERE user_id=1")).total, 9950);
  assert.equal((await f.db.get("SELECT COUNT(*) AS n FROM gobblar_ledger")).n, 0);
  assert.equal((await f.db.get("SELECT status FROM target_quiz_pending WHERE user_id=1")).status, "pending");
  await f.db.exec("DROP TRIGGER reject_weekly");
  await f.finish(1);
  await f.finish(1);
  assert.equal((await f.read()).boards.targetQuizPoints[0].points, 100);
  assert.equal((await f.db.get("SELECT COUNT(*) AS n FROM gobblar_ledger")).n, 1);
});

test("recovery after Monday keeps the score in the week when the round ended", async t => {
  const f = await fixture(t);
  await f.answer(1, 100, "sunday", END - 1);
  f.setNow(END + 120_000);
  await f.points.load("user:1");
  assert.equal((await f.read()).boards.targetQuizPoints[0].points, 100);
  assert.deepEqual((await f.read({ weekStartTs: END, nextResetTs: END + 7 * 86_400_000 })).boards.targetQuizPoints, []);
});

test("all-time Gobble boards read existing profile totals, without resetting or estimating history", async t => {
  const f = await fixture(t);
  await f.db.exec("INSERT INTO player_lifetime_stats VALUES ('1', 900, 120), ('2', 800, 210), ('3', 0, 0), ('unknown-install', 9999, 9999)");
  const result = await f.read();
  assert.deepEqual(result.allTimeBoards.gobbles.map(row => [row.userId, row.gobbles]), [[1, 900], [2, 800]]);
  assert.deepEqual(result.allTimeBoards.doubleGobbles.map(row => [row.userId, row.doubleGobbles]), [[2, 210], [1, 120]]);
});

test("historic weekly Gobbles retain the same max fallback as profiles before limiting the ranking", async t => {
  const f = await fixture(t);
  await f.db.exec("INSERT INTO player_lifetime_stats VALUES ('1', 900, 120), ('2', 100, 20)");
  const weeks = [
    { mostGobbles: new Map([["install:1", { gobbles: 200 }], ["install:2", { gobbles: 500 }], ["install:3", { gobbles: 600 }]]) },
    { mostGobbles: new Map([["install:1", { gobbles: 100 }], ["install:2", { gobbles: 600 }], ["install:3", { gobbles: 400 }], ["nick:old-guest", { gobbles: 9999 }]]) },
  ];
  const historicalGobbles = buildAllTimeGobbleCandidates(weeks, 2);
  assert.deepEqual(historicalGobbles, [{ userId: 2, gobbles: 1100 }, { userId: 3, gobbles: 1000 }]);
  const result = await f.read({ historicalGobbles, topN: 2 });
  assert.deepEqual(result.allTimeBoards.gobbles.map(row => [row.userId, row.gobbles]), [[2, 1100], [3, 1000]]);
  const all = await f.read({ historicalGobbles: buildAllTimeGobbleCandidates(weeks) });
  assert.deepEqual(all.allTimeBoards.gobbles.map(row => [row.userId, row.gobbles]), [[2, 1100], [3, 1000], [1, 900]]);
  assert.equal((await f.db.get("SELECT gobbles FROM player_lifetime_stats WHERE installId='2'")).gobbles, 100, "the read never rewrites historical data");
});

test("weekly request boundaries follow Paris time through daylight-saving changes", () => {
  const start = Date.parse("2026-10-18T22:00:00Z");
  const request = normalizeProgressBoardsRequest({ weekStartTs: start, topN: 999 });
  assert.equal(request.weekStartTs, getWeekStartTs(start));
  assert.equal(request.nextResetTs, Date.parse("2026-10-25T23:00:00Z"));
  assert.equal(request.topN, 200);
});
