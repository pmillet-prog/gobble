import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { scryptSync } from "node:crypto";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createAccountAdminService } from "../admin/accountAdminService.js";
import { isAdminAccount } from "../admin/adminAccess.js";
import { isAccountUnderMaintenance } from "../admin/accountMaintenance.js";
import { registerAccountAdminRoutes } from "../admin/registerAccountAdminRoutes.js";
import { promisify } from "node:util";
import { scrypt, randomBytes } from "node:crypto";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";

const derive = promisify(scrypt);
const hashPassword = async password => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(password, salt, 64)).toString("hex")}`;
};

async function setup(t) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  for (const file of ["2026-03-12-auth-accounts.sql", "2026-03-12-auth-multi-account-devices.sql", "2026-09-28-account-administration.sql"]) await db.exec(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  await db.exec(`
    INSERT INTO users(id,username_display,username_normalized,password_hash,primary_install_id,created_at,updated_at)
      VALUES(1,'Principal','principal','old','acct-a',1,1),(2,'Secondaire','secondaire','old','acct-b',2,2),(3,'Autre','autre','old','acct-c',3,3);
    INSERT INTO user_sessions VALUES('a',1,'hash-a',1,1,9999999999999,NULL),('b',2,'hash-b',1,1,9999999999999,NULL);
    INSERT INTO user_devices(user_id,install_id,created_at,last_seen_at) VALUES(1,'shared',1,1),(2,'shared',1,1),(3,'shared',1,1);
    CREATE TABLE vocab_words(installId TEXT,wordHash TEXT,firstSeenTs INTEGER,PRIMARY KEY(installId,wordHash));
    INSERT INTO vocab_words VALUES('1','a',9),('2','a',2),('2','b',4),('3','c',5),('shared','private',7);
    CREATE TABLE vocab_weekly_words(installId TEXT,weekStartTs INTEGER,wordHash TEXT,firstSeenTs INTEGER,PRIMARY KEY(installId,weekStartTs,wordHash));
    INSERT INTO vocab_weekly_words VALUES('1',10,'a',9),('2',10,'a',2),('2',10,'b',4);
    CREATE TABLE vocab_counts(installId TEXT PRIMARY KEY,count INTEGER,updatedAt INTEGER);
    INSERT INTO vocab_counts VALUES('1',1,1),('2',2,1);
    CREATE TABLE vocab_profiles(installId TEXT PRIMARY KEY,nick TEXT,updatedAt INTEGER);
    CREATE TABLE gobblar_profiles(installId TEXT PRIMARY KEY,balance INTEGER);
    INSERT INTO gobblar_profiles VALUES('1',100),('2',50),('3',300);
    CREATE TABLE player_live_head_to_head(playerAUserId TEXT,playerBUserId TEXT);
    CREATE TABLE player_lifetime_stats(installId TEXT PRIMARY KEY,nick TEXT DEFAULT '',roundsPlayed INTEGER DEFAULT 0,totalScore INTEGER DEFAULT 0,wordsFound INTEGER DEFAULT 0,bestWordsInRound INTEGER DEFAULT 0,bestWordsInRoundId TEXT,bestRoundScore INTEGER DEFAULT 0,bestRoundId TEXT,bestWord TEXT,bestWordScore INTEGER DEFAULT 0,longestWord TEXT,longestWordLength INTEGER DEFAULT 0,gobbles INTEGER DEFAULT 0,doubleGobbles INTEGER DEFAULT 0,targetRoundsPlayed INTEGER DEFAULT 0,targetRoundsFound INTEGER DEFAULT 0,special3RoundsPlayed INTEGER DEFAULT 0,bestSpecial3Score INTEGER DEFAULT 0,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
    INSERT INTO player_lifetime_stats(installId,roundsPlayed,bestWord,bestWordScore,bestSpecial3Score,createdAt,updatedAt) VALUES('1',10,'ancien',150,69,1,1),('2',2,'nouveau',100,79,2,2);
  `);
  const cleared = [];
  const service = createAccountAdminService({ getDb: async () => db, runWrite: runSerializedSqliteWrite, hashPassword, clearAuthCache: value => cleared.push(value.userId), getWeeklySnapshot: id => ({ allTime: { bestTimeTargetLong: { ms: id === "1" ? 4000 : 3000, word: id === "1" ? "ancien" : "rapide" }, bestWord: { pts: id === "1" ? 196 : 120, word: "historique" } } }) });
  return { db, service, cleared };
}
const args = { action: "merge", targetId: 1, sourceId: 2, actorId: 99, operationId: "operation-fusion-0001" };

test("fusion unites vocabulary, earliest discoveries and records, deletes the source, preserves wallets/devices of other accounts", async t => {
  const { db, service, cleared } = await setup(t);
  const preview = await service.preview(1, 2);
  assert.equal(preview.newWords, 1);
  const result = await service.operate({ ...args, assertOffline(ids) { assert.ok(ids.every(isAccountUnderMaintenance)); } });
  assert.equal(result.vocabulary, 2);
  assert.deepEqual(await db.all("SELECT wordHash,firstSeenTs FROM vocab_words WHERE installId='1' ORDER BY wordHash"), [{ wordHash: "a", firstSeenTs: 2 }, { wordHash: "b", firstSeenTs: 4 }]);
  const stats = await db.get("SELECT * FROM player_lifetime_stats WHERE installId='1'");
  assert.equal(stats.roundsPlayed, 12);
  assert.equal(stats.bestSpecial3Score, 79);
  assert.equal(stats.bestWordScore, 196);
  assert.equal(stats.bestWord, "historique");
  assert.equal(JSON.parse((await db.get("SELECT records_json FROM account_absolute_records WHERE user_id=1")).records_json).bestTimeTargetLong.ms, 3000);
  assert.equal(await db.get("SELECT * FROM users WHERE id=2"), undefined);
  assert.equal(await db.get("SELECT * FROM user_sessions WHERE user_id=2"), undefined);
  assert.equal((await db.get("SELECT balance FROM gobblar_profiles WHERE installId='1'")).balance, 100);
  assert.equal((await db.get("SELECT balance FROM gobblar_profiles WHERE installId='3'")).balance, 300);
  assert.equal((await db.get("SELECT wordHash FROM vocab_words WHERE installId='shared'")).wordHash, "private");
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM user_devices WHERE user_id=3")).n, 1);
  assert.ok(cleared.includes(2));
  assert.equal(isAccountUnderMaintenance(1), false);
  const backup = JSON.parse((await db.get("SELECT backup_json FROM admin_account_operations")).backup_json);
  assert.equal(backup.users.length, 2);
  assert.equal(backup.gobblar_profiles.length, 2);
  assert.deepEqual(await service.operate(args), result);
  assert.equal((await db.get("SELECT roundsPlayed FROM player_lifetime_stats WHERE installId='1'")).roundsPlayed, 12);
});

test("reset uses the usual scrypt format, requires a new password and invalidates sessions", async t => {
  const { db, service } = await setup(t);
  await service.operate({ ...args, action: "reset-password", sourceId: null });
  const user = await db.get("SELECT * FROM users WHERE id=1");
  const [kind, salt, key] = user.password_hash.split("$");
  assert.equal(kind, "scrypt");
  assert.equal(scryptSync("gobble2026", salt, 64).toString("hex"), key);
  assert.equal(user.must_reset_password, 1);
  assert.ok((await db.get("SELECT invalidated_at FROM user_sessions WHERE user_id=1")).invalidated_at);
  assert.equal((await db.get("SELECT password_hash FROM users WHERE id=2")).password_hash, "old");
});

test("failed deletion rolls back progression, accounts, wallet and audit together", async t => {
  const { db, service } = await setup(t);
  await db.exec("CREATE TRIGGER forbid_deletion BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT,'test'); END;");
  await assert.rejects(service.operate(args), /test/);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM users")).n, 3);
  assert.equal((await db.get("SELECT count FROM vocab_counts WHERE installId='1'")).count, 1);
  assert.equal((await db.get("SELECT balance FROM gobblar_profiles WHERE installId='2'")).balance, 50);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM admin_account_operations")).n, 0);
  assert.equal(isAccountUnderMaintenance(2), false);
});

test("online/recent accounts, self merge and stale legacy identities are refused", async t => {
  const { db, service } = await setup(t);
  await assert.rejects(service.operate({ ...args, assertOffline() { throw new Error("account_online"); } }), /account_online/);
  await assert.rejects(service.operate({ ...args, sourceId: 1 }), /same_account/);
  await assert.rejects(service.operate({ ...args, actorId: 1 }), /cannot_target_self/);
  await db.run("UPDATE user_sessions SET last_seen_at=? WHERE user_id=2", Date.now());
  await assert.rejects(service.operate(args), /account_recently_active/);
  await db.run("INSERT INTO vocab_words VALUES('acct-b','legacy',1)");
  await assert.rejects(service.preview(1, 2), /legacy_progression_pending/);
});

test("empty-account fusion works and still deletes the source", async t => {
  const { db, service } = await setup(t);
  await db.run("DELETE FROM player_lifetime_stats");
  await service.operate(args);
  assert.equal((await db.get("SELECT roundsPlayed FROM player_lifetime_stats WHERE installId='1'")).roundsPlayed, 0);
});

test("admin rights are separate from moderators and explicit allowlists replace dev fallback", () => {
  const user = { id: 1, usernameDisplay: "Tigre" };
  assert.equal(isAdminAccount(null, { devAccountIds: new Set(["1"]) }, {}), false);
  assert.equal(isAdminAccount(user, { moderationAccountIds: new Set(["1"]) }, {}), false);
  assert.equal(isAdminAccount(user, { devAccountIds: new Set(["1"]) }, {}), true);
  assert.equal(isAdminAccount(user, { devAccountIds: new Set(["1"]) }, { GOBBLE_ADMIN_USER_IDS: "2" }), false);
  assert.equal(isAdminAccount(user, {}, { GOBBLE_ADMIN_ACCOUNTS: "tigre" }), true);
});

test("HTTP actions reject unauthenticated, unauthorized and cross-origin calls before touching accounts", async () => {
  const routes = new Map();
  let actor = null, operations = 0;
  registerAccountAdminRoutes({ get: (url, fn) => routes.set(url, fn), post: (url, fn) => routes.set(url, fn) }, {
    getAuth: async () => ({ user: actor }), isAdmin: user => user.id === 99,
    accounts: { operate: async () => { operations++; return { ok: true }; } }, assertOffline() {},
  });
  const req = { body: { targetId: 1, operationId: "operation-reset-0001" }, headers: {}, is: () => true, get: () => "localhost" };
  const response = { set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  const run = () => routes.get("/api/admin/accounts/reset-password")(req, response);
  await run(); assert.equal(response.code, 401);
  actor = { id: 1 }; await run(); assert.equal(response.code, 403);
  actor = { id: 99 }; req.headers.origin = "https://other.test"; await run(); assert.equal(response.code, 403);
  assert.equal(operations, 0);
  req.headers.origin = "http://localhost"; await run(); assert.equal(operations, 1);
});
