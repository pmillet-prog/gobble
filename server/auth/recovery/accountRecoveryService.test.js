import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createAccountRecoveryService } from "./accountRecoveryService.js";
import { runSerializedSqliteWrite } from "../../sqliteQueue.js";
import { isAccountUnderMaintenance } from "../../admin/accountMaintenance.js";

// authService imports weekly statistics: isolate that module's disk state too.
const isolatedData = await mkdtemp(path.join(tmpdir(), "gobble-recovery-test-"));
await writeFile(path.join(isolatedData, "weekly-stats.json"), "{}");
process.env.GOBBLE_DATA_DIR = isolatedData;
const { hashPassword, verifyPassword, validatePassword, normalizeUsername } = await import("../authService.js");
after(() => rm(isolatedData, { recursive: true, force: true }));

async function setup(t, overrides = {}) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  for (const file of ["2026-03-12-auth-accounts.sql", "2026-09-28-password-recovery.sql"]) {
    await db.exec(await readFile(new URL(`../../migrations/${file}`, import.meta.url), "utf8"));
  }
  const oldHash = await hashPassword("ancienne-passphrase");
  await db.run(`INSERT INTO users(id,username_display,username_normalized,password_hash,email,created_at,updated_at,must_reset_password)
    VALUES(1,'Coton','coton',?,'coton@example.test',1,1,1),(2,'Autre','autre',?,'coton@example.test',1,1,0),(3,'Sans mail','sans mail',?,NULL,1,1,0)`, oldHash, oldHash, oldHash);
  await db.exec("INSERT INTO user_sessions VALUES('session1',1,'hash1',1,1,9999999999999,NULL),('session2',2,'hash2',1,1,9999999999999,NULL)");
  let clock = 1_800_000_000_000;
  const messages = [], invalidations = [], logs = [];
  const service = createAccountRecoveryService({
    getDb: async () => db, runWrite: runSerializedSqliteWrite,
    hashPassword, verifyPassword, validatePassword, normalizeUsername,
    getMailConfig: () => ({ origin: "https://gobble.fr", from: "support@gobble.fr", supportTo: "pmillet@gmail.com" }),
    sendMail: async message => { messages.push(message); },
    clearAuthCache: ({ userId }) => invalidations.push(userId), now: () => clock, log: code => logs.push(code),
    ...overrides,
  });
  async function request(username = "Coton", ip = "test-ip") {
    const response = await service.requestReset({ username, ip });
    await service.waitForDeliveries();
    return response;
  }
  const token = (index = messages.length - 1) => messages[index].text.match(/#token=([a-f0-9]{64})/)[1];
  return { db, service, request, token, messages, invalidations, logs, advance: ms => { clock += ms; } };
}

test("existing email receives one-use reset, hashes only in DB, correct account and sessions changed", async t => {
  const s = await setup(t);
  assert.deepEqual(await s.request("  COTON "), { ok: true });
  assert.equal(s.messages[0].from, "support@gobble.fr");
  assert.deepEqual(s.messages[0].to, { address: "coton@example.test" });
  const token = s.token();
  const stored = await s.db.get("SELECT * FROM password_reset_tokens");
  assert.equal(stored.token_hash, createHash("sha256").update(token).digest("hex"));
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.equal(stored.expires_at - stored.created_at, 30 * 60_000);
  assert.equal(await verifyPassword("ancienne-passphrase", (await s.db.get("SELECT password_hash FROM users WHERE id=1")).password_hash), true);
  const disconnected = [];
  assert.deepEqual(await s.service.completeReset({ token, newPassword: "nouvelle-passphrase", ip: "test-ip", onReset: id => {
    assert.equal(isAccountUnderMaintenance(id), true); disconnected.push(id);
  } }), { ok: true });
  const user = await s.db.get("SELECT * FROM users WHERE id=1");
  assert.equal(await verifyPassword("nouvelle-passphrase", user.password_hash), true);
  assert.equal(await verifyPassword("ancienne-passphrase", user.password_hash), false);
  assert.equal(user.must_reset_password, 0);
  assert.equal((await s.db.get("SELECT invalidated_at FROM user_sessions WHERE user_id=1")).invalidated_at > 0, true);
  assert.equal((await s.db.get("SELECT invalidated_at FROM user_sessions WHERE user_id=2")).invalidated_at, null);
  assert.equal(await verifyPassword("ancienne-passphrase", (await s.db.get("SELECT password_hash FROM users WHERE id=2")).password_hash), true);
  assert.deepEqual(disconnected, [1]);
  assert.deepEqual(s.invalidations, [1, 1]);
  assert.equal(isAccountUnderMaintenance(1), false);
  await assert.rejects(s.service.completeReset({ token, newPassword: "autre", ip: "test-ip" }), /reset_link_invalid/);
});

test("unknown and email-less accounts return the same generic result without delivery", async t => {
  const s = await setup(t);
  assert.deepEqual(await s.request("inconnu"), await s.request("Sans mail"));
  assert.equal(s.messages.length, 0);
  assert.equal((await s.db.get("SELECT count(*) n FROM password_reset_tokens")).n, 0);
});

test("no SMTP latency is exposed by the request endpoint", async t => {
  let finishSend;
  const gate = new Promise(resolve => { finishSend = resolve; });
  const s = await setup(t, { sendMail: () => gate });
  assert.deepEqual(await s.service.requestReset({ username: "Coton", ip: "test-ip" }), { ok: true });
  finishSend();
  await s.service.waitForDeliveries();
});

test("expired links and links predating password/email changes are rejected", async t => {
  const s = await setup(t);
  await s.request();
  let token = s.token();
  s.advance(30 * 60_000);
  await assert.rejects(s.service.completeReset({ token, newPassword: "nouveau", ip: "test-ip" }), /reset_link_invalid/);
  await s.request(); token = s.token();
  await s.db.run("UPDATE users SET password_hash='admin-reset' WHERE id=1");
  await assert.rejects(s.service.completeReset({ token, newPassword: "nouveau", ip: "test-ip" }), /reset_link_invalid/);
  await s.request(); token = s.token();
  await s.db.run("UPDATE users SET email='changed@example.test' WHERE id=1");
  await assert.rejects(s.service.completeReset({ token, newPassword: "nouveau", ip: "test-ip" }), /reset_link_invalid/);
});

test("all outstanding links are revoked together and concurrent consumption has one winner", async t => {
  const s = await setup(t);
  await s.request(); const first = s.token();
  await s.request(); const second = s.token();
  const attempts = await Promise.allSettled([first, first].map(token => s.service.completeReset({ token, newPassword: "nouveau", ip: "test-ip" })));
  assert.equal(attempts.filter(item => item.status === "fulfilled").length, 1);
  await assert.rejects(s.service.completeReset({ token: second, newPassword: "nouveau", ip: "test-ip" }), /reset_link_invalid/);
});

test("SMTP failure removes the unusable token and does not log secrets", async t => {
  const s = await setup(t, { sendMail: async () => { throw new Error("private provider credential and email"); } });
  assert.deepEqual(await s.request(), { ok: true });
  assert.equal((await s.db.get("SELECT count(*) n FROM password_reset_tokens")).n, 0);
  assert.deepEqual(s.logs, ["reset_delivery_failed"]);
});

test("configuration failure is uniform, including unknown accounts", async t => {
  const s = await setup(t, { getMailConfig: () => { throw new Error("secret path"); } });
  for (const username of ["Coton", "inconnu"]) {
    await assert.rejects(s.service.requestReset({ username, ip: "test-ip" }), /^Error: mail_unavailable$/);
  }
});

test("limits bound account mail, shared mailbox, IP requests and survive a service recreation", async t => {
  const s = await setup(t);
  for (let i = 0; i < 4; i++) await s.request();
  assert.equal(s.messages.length, 3);
  for (let i = 0; i < 3; i++) await s.request("Autre", "second-ip");
  assert.equal(s.messages.length, 5);
  for (let i = 4; i < 10; i++) await s.request("inconnu");
  await assert.rejects(s.request("inconnu"), /recovery_rate_limited/);
  const restarted = createAccountRecoveryService({ getDb: async () => s.db, runWrite: runSerializedSqliteWrite, normalizeUsername });
  await assert.rejects(restarted.requestReset({ username: "Coton", ip: "test-ip" }), /recovery_rate_limited/);
  s.advance(60 * 60_000);
  await s.request();
  assert.equal(s.messages.length, 6);
});

test("support mail has a fixed recipient and optional reply address; never changes the account", async t => {
  const s = await setup(t);
  const body = { username: "Sans mail", message: "Je ne peux plus me connecter.", replyEmail: "reply@example.test", ip: "test-ip", to: "attacker@example.test" };
  assert.deepEqual(await s.service.submitSupport(body), { ok: true });
  assert.deepEqual(s.messages[0].to, { address: "pmillet@gmail.com" });
  assert.deepEqual(s.messages[0].replyTo, { address: "reply@example.test" });
  assert.match(s.messages[0].text, /n'a pas été vérifiée/);
  assert.equal((await s.db.get("SELECT email FROM users WHERE id=3")).email, null);
  await assert.rejects(s.service.submitSupport({ ...body, replyEmail: "bad@example.test\r\nBcc:attacker@example.test" }), /email_invalid/);
  await assert.rejects(s.service.submitSupport({ ...body, message: "court" }), /support_message_invalid/);
  await s.service.submitSupport({ ...body, replyEmail: "" });
  assert.equal(s.messages[1].replyTo, undefined);
  await s.service.submitSupport(body);
  await assert.rejects(s.service.submitSupport(body), /recovery_rate_limited/);
});

test("failed reset transaction leaves old password, sessions and link intact", async t => {
  const s = await setup(t);
  await s.request();
  await s.db.exec("CREATE TRIGGER fail_invalidate BEFORE UPDATE ON user_sessions BEGIN SELECT RAISE(ABORT,'test'); END");
  await assert.rejects(s.service.completeReset({ token: s.token(), newPassword: "nouveau", ip: "test-ip" }), /test/);
  assert.equal(await verifyPassword("ancienne-passphrase", (await s.db.get("SELECT password_hash FROM users WHERE id=1")).password_hash), true);
  assert.equal((await s.db.get("SELECT invalidated_at FROM user_sessions WHERE user_id=1")).invalidated_at, null);
  assert.equal((await s.db.get("SELECT count(*) n FROM password_reset_tokens")).n, 1);
  assert.equal(isAccountUnderMaintenance(1), false);
});
