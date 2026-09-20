import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createAvatarStarterGrant, countStarterGrantRounds, recordStarterGrant, STARTER_GRANT_KEY } from "../stats/avatarStarterGrant.js";
import { registerStarterGrantRoutes } from "../stats/registerStarterGrantRoutes.js";
import { runSerializedSqliteWrite, runSqliteImmediateTransaction } from "../sqliteQueue.js";

const NOW = Date.UTC(2026, 8, 20), DAY = 86400000;
async function setup(t, weekly = {}) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY, primary_install_id TEXT, last_login_at INTEGER);
    CREATE TABLE user_sessions (user_id INTEGER, last_seen_at INTEGER);
    CREATE TABLE user_devices (user_id INTEGER, last_seen_at INTEGER);
    CREATE TABLE legacy_username_reservations (claimed_user_id INTEGER, install_id TEXT);
    CREATE TABLE player_lifetime_stats (installId TEXT PRIMARY KEY, roundsPlayed INTEGER);
    CREATE TABLE gobblar_profiles (installId TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0, themeApplied TEXT DEFAULT '{}', themeUnlocks TEXT DEFAULT '{}', updatedAt INTEGER);
    CREATE TABLE gobblar_ledger (installId TEXT, ts INTEGER, delta INTEGER, reason TEXT, meta TEXT);`);
  await db.exec(await readFile(new URL("../migrations/2026-09-21-avatar-starter-gobblars.sql", import.meta.url), "utf8"));
  const make = () => createAvatarStarterGrant({ getDb: async () => db, runWrite: runSerializedSqliteWrite, loadWeeklyStats: async () => weekly, now: () => NOW });
  const user = (id, lastSeen = NOW, primary = `device-${id}`) => db.run("INSERT INTO users VALUES (?, ?, ?)", id, primary, lastSeen);
  return { db, make, user, grant: make() };
}
const week = entries => ({ totalScore: Object.fromEntries(Object.entries(entries).map(([id, roundsPlayed]) => [`install:${id}`, { roundsPlayed }])) });

test("rollout credits only recent accounts below 2000 rounds, including active persistent sessions", async t => {
  const weekly = { ...week({ 1: 1999, 2: 2000, 3: 10, 4: 20, 5: 40, 6: 30, 7: 2 }), weekStartTs: 7 };
  const { db, user, grant, make } = await setup(t, weekly);
  await user(1); await user(2); await user(3, NOW - 30 * DAY - 1);
  await user(4, NOW - 30 * DAY); await user(5, NOW - 60 * DAY); await user(6, null); await user(7); await user(8, NOW + 1);
  await db.run("INSERT INTO user_sessions VALUES (5, ?)", NOW - DAY);
  await db.run("INSERT INTO user_devices VALUES (6, ?)", NOW - DAY);
  await db.run("INSERT INTO player_lifetime_stats VALUES ('7', 2100)");
  await db.run("INSERT INTO gobblar_profiles VALUES ('1', 500, 'kept', 'owned', 0)");
  await Promise.all([grant.initialize(), grant.initialize(), make().initialize()]);
  assert.deepEqual((await db.all("SELECT user_id FROM gobblar_starter_grants ORDER BY user_id")).map(row => row.user_id), [1, 4, 5, 6]);
  assert.deepEqual(await db.get("SELECT balance, themeApplied, themeUnlocks FROM gobblar_profiles WHERE installId='1'"), { balance: 3500, themeApplied: "kept", themeUnlocks: "owned" });
  assert.equal((await db.get("SELECT SUM(delta) AS amount FROM gobblar_ledger")).amount, 12000);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM gobblar_starter_campaigns")).n, 1);
  // Later logins must not change the original deployment cohort.
  await db.run("UPDATE users SET last_login_at=? WHERE id=3", NOW);
  await make().initialize();
  assert.equal(await grant.pending(3), null);
  assert.equal((await grant.pending(1)).amount, 3000);
});

test("round counting uses historical weeks, claimed identities and the larger lifetime total without duplicate weeks", () => {
  const weekly = { ...week({ 1: 20, old: 100 }), weekStartTs: 2,
    history: { 1: { ...week({ old: 1500, legacy: 480 }), weekStartTs: 1 }, 2: { ...week({ 1: 20 }), weekStartTs: 2 } } };
  assert.equal(countStarterGrantRounds(weekly, { id: 1, primary_install_id: "old" }, ["legacy", "old"]), 2000);
  assert.equal(countStarterGrantRounds(weekly, { id: 1, primary_install_id: "old" }, ["legacy"], new Map([["1", 2200]])), 2200);
  assert.throws(() => countStarterGrantRounds(week({ 1: "broken" }), { id: 1 }), /invalid_round_count/);
});

test("historical and claimed rounds exclude experienced accounts even when their current week is empty", async t => {
  const { db, user, grant } = await setup(t, { history: { 1: week({ former: 2000, "device-2": 2001 }) } });
  await user(1); await user(2);
  await db.exec("INSERT INTO legacy_username_reservations VALUES (1, 'former')");
  await grant.initialize();
  assert.equal(await grant.pending(1), null); assert.equal(await grant.pending(2), null);
});

test("registration credits once atomically, with a persistent welcome notification and idempotent acknowledgement", async t => {
  const { db, user, grant, make } = await setup(t);
  await grant.initialize();
  await runSerializedSqliteWrite(() => runSqliteImmediateTransaction(db, async () => {
    await user(1, null);
    assert.equal(await recordStarterGrant(db, 1, { now: NOW }), true);
  }));
  await runSerializedSqliteWrite(() => runSqliteImmediateTransaction(db, () => recordStarterGrant(db, 1, { now: NOW })));
  assert.equal((await db.get("SELECT balance FROM gobblar_profiles WHERE installId='1'")).balance, 3000);
  const pending = await make().pending(1);
  assert.match(pending.label, /Bienvenue/);
  assert.equal(await grant.acknowledge(1, "wrong"), false);
  assert.ok(await grant.pending(1));
  await grant.acknowledge(2, STARTER_GRANT_KEY);
  assert.ok(await grant.pending(1));
  await grant.acknowledge(1, STARTER_GRANT_KEY); await grant.acknowledge(1, STARTER_GRANT_KEY);
  assert.equal(await make().pending(1), null);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM gobblar_ledger")).n, 1);
});

test("failed credits roll back the whole rollout and registration instead of leaving a partial grant", async t => {
  const { db, user, grant } = await setup(t);
  await user(1); await user(2);
  await db.exec("CREATE TRIGGER fail_credit BEFORE INSERT ON gobblar_ledger WHEN NEW.installId = '2' BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  await assert.rejects(grant.initialize(), /test failure/);
  for (const table of ["gobblar_profiles", "gobblar_ledger", "gobblar_starter_grants", "gobblar_starter_campaigns"]) {
    assert.equal((await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n, 0, table);
  }
  await db.exec("DROP TRIGGER fail_credit"); await grant.initialize();
  await db.exec("CREATE TRIGGER fail_credit BEFORE INSERT ON gobblar_ledger BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  await assert.rejects(runSerializedSqliteWrite(() => runSqliteImmediateTransaction(db, async () => {
    await user(3); await recordStarterGrant(db, 3);
  })), /test failure/);
  assert.equal(await db.get("SELECT id FROM users WHERE id=3"), undefined);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM gobblar_starter_grants")).n, 2);
});

test("notification routes authenticate the account for reading and acknowledgement", async () => {
  const routes = new Map(), calls = [];
  registerStarterGrantRoutes({ router: Object.fromEntries(["get", "post"].map(method => [method, (path, handler) => routes.set(`${method}:${path}`, handler)])),
    getAuthContext: async req => ({ user: req.identity ? { id: req.identity } : null }),
    requireAuth: (auth, res) => { if (auth.user) return true; res.status(401).json({ ok: false }); return false; },
    grants: { pending: async id => { calls.push(id); return null; }, acknowledge: async (id, key) => { calls.push([id, key]); return true; } },
  });
  async function request(method, identity, userId) {
    const res = { statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await routes.get(`${method}:/gobblars/starter-grant${method === "post" ? "/ack" : ""}`)({ identity, query: { userId }, body: { userId, key: STARTER_GRANT_KEY } }, res);
    return res;
  }
  for (const method of ["get", "post"]) {
    assert.equal((await request(method, null, 1)).statusCode, 401);
    assert.equal((await request(method, 2, 1)).statusCode, 409);
  }
  assert.deepEqual(calls, []);
  assert.equal((await request("get", 1, 1)).statusCode, 200);
  assert.equal((await request("post", 1, 1)).statusCode, 200);
  assert.deepEqual(calls, [1, [1, STARTER_GRANT_KEY]]);
});
