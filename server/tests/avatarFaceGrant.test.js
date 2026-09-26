import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";
import { createAvatarFaceGrant, AVATAR_FACE_GRANT_KEY } from "../stats/avatarFaceGrant.js";
import { registerStarterGrantRoutes } from "../stats/registerStarterGrantRoutes.js";

async function setup(t) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY, last_login_at INTEGER, rounds_played INTEGER);
    INSERT INTO users VALUES (1,1,10000),(2,NULL,0),(3,1,2000);
    CREATE TABLE gobblar_profiles (installId TEXT PRIMARY KEY, balance INTEGER NOT NULL, themeApplied TEXT DEFAULT '{}', themeUnlocks TEXT DEFAULT '{}', updatedAt INTEGER);
    INSERT INTO gobblar_profiles VALUES ('1',1250,'keep','owned',0),('2',0,'{}','{}',0);
    CREATE TABLE gobblar_ledger (installId TEXT, ts INTEGER, delta INTEGER, reason TEXT, meta TEXT);
    CREATE TABLE avatar_unlocks (user_id INTEGER, item_key TEXT);
    INSERT INTO avatar_unlocks VALUES (1,'base:homme');`);
  const migration = await readFile(new URL("../migrations/2026-09-23-avatar-face-gift.sql", import.meta.url), "utf8");
  await db.exec(migration);
  const make = () => createAvatarFaceGrant({ getDb: async () => db, runWrite: runSerializedSqliteWrite, now: () => 12345 });
  return { db, make, migration, grant: make() };
}

test("all existing accounts receive exactly 500 once, regardless of activity, rounds, wallet or face ownership", async t => {
  const { db, grant, make, migration } = await setup(t);
  await Promise.all([grant.initialize(), grant.initialize(), make().initialize()]);
  assert.deepEqual(await db.all("SELECT installId, balance FROM gobblar_profiles ORDER BY installId"), [
    { installId: "1", balance: 1750 }, { installId: "2", balance: 500 }, { installId: "3", balance: 500 },
  ]);
  assert.deepEqual(await db.get("SELECT themeApplied, themeUnlocks FROM gobblar_profiles WHERE installId='1'"), { themeApplied: "keep", themeUnlocks: "owned" });
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM avatar_unlocks")).n, 1);
  assert.equal((await db.get("SELECT SUM(delta) AS amount FROM gobblar_ledger WHERE reason='avatar_face_gift'")).amount, 1500);
  await db.exec(migration);
  await db.exec("INSERT INTO users VALUES (4,12346,0)");
  await make().initialize();
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM gobblar_ledger")).n, 3);
  assert.equal(await make().pending(4), null, "later registrations are outside this one-off deployment gift");
  assert.equal((await grant.pending(2)).amount, 500);
});

test("a failed credit rolls the entire campaign back and the next attempt can finish", async t => {
  const { db, grant, make } = await setup(t);
  await db.exec("CREATE TRIGGER refuse_gift BEFORE INSERT ON gobblar_ledger WHEN NEW.installId='2' BEGIN SELECT RAISE(ABORT,'gift failed'); END;");
  await assert.rejects(grant.initialize(), /gift failed/);
  assert.equal((await db.get("SELECT balance FROM gobblar_profiles WHERE installId='1'")).balance, 1250);
  for (const table of ["gobblar_account_grants", "gobblar_account_grant_campaigns", "gobblar_ledger"]) {
    assert.equal((await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n, 0);
  }
  await db.exec("DROP TRIGGER refuse_gift");
  await grant.initialize();
  await make().initialize();
  assert.equal((await db.get("SELECT balance FROM gobblar_profiles WHERE installId='1'")).balance, 1750);
});

test("gift notifications persist until acknowledged and cannot be consumed for another account", async t => {
  const { db, grant, make } = await setup(t);
  await grant.initialize();
  const routes = new Map();
  registerStarterGrantRoutes({
    router: Object.fromEntries(["get", "post"].map(method => [method, (path, fn) => routes.set(`${method}:${path}`, fn)])),
    getAuthContext: async req => ({ user: req.identity ? { id: req.identity } : null }),
    requireAuth: (auth, res) => { if (auth.user) return true; res.status(401).json({ ok: false }); return false; },
    grants: grant,
  });
  const request = async (identity, userId, key = AVATAR_FACE_GRANT_KEY) => {
    const res = { statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await routes.get("post:/gobblars/starter-grant/ack")({ identity, body: { userId, key } }, res);
    return res;
  };
  assert.equal((await request(null, 1)).statusCode, 401);
  assert.equal((await request(2, 1)).statusCode, 409);
  assert.equal((await request(1, 1, "wrong")).statusCode, 400);
  assert.match((await make().pending(1)).label, /500 gobblars/);
  assert.equal((await request(1, 1)).statusCode, 200);
  assert.equal((await request(1, 1)).statusCode, 200);
  assert.equal(await make().pending(1), null);
  assert.ok(await make().pending(2));
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM gobblar_ledger")).n, 3);
});
