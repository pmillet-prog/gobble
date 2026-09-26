import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createAvatarInventoryRepository } from "../avatars/avatarInventoryRepository.js";
import { createAvatarRepository } from "../avatars/avatarRepository.js";
import { registerAvatarRoutes } from "../avatars/registerAvatarRoutes.js";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";
import { createBlankAvatar } from "../../shared/avatarConfiguration.js";

const catalog = JSON.parse(await readFile(new URL("../../public/avatars/v1/catalog.json", import.meta.url), "utf8"));
const paidPart = { family: "nose", id: catalog.families.nose[0].id };
async function setup(t, options = {}) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users VALUES (1),(2);
    CREATE TABLE gobblar_profiles (installId TEXT PRIMARY KEY, balance INTEGER, updatedAt INTEGER);
    INSERT INTO gobblar_profiles VALUES ('1',20000,0),('2',5000,0);
    CREATE TABLE gobblar_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, installId TEXT, ts INTEGER, delta INTEGER, reason TEXT, meta TEXT);`);
  for (const name of ["2026-09-19-avatar-unlocks", "2026-09-19-game-avatar-objectives", "2026-09-19-user-avatars", "2026-09-20-avatar-thumbnails"]) {
    await db.exec(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8"));
  }
  const args = { getDb: async () => db, runWrite: runSerializedSqliteWrite, loadCatalog: async () => catalog };
  const inventory = createAvatarInventoryRepository(args), repository = createAvatarRepository(args);
  let maintenance = false;
  const routes = new Map(), saved = [], wallets = [];
  registerAvatarRoutes({ inventory, repository,
    router: Object.fromEntries(["get", "put", "post"].map(method => [method, (path, handler) => routes.set(`${method}:${path}`, handler)])),
    getAuthContext: async req => ({ user: req.identity ? { id: req.identity } : null }),
    requireAuth: (auth, res) => { if (auth.user) return true; res.status(401).json({ ok: false }); return false; },
    isMaintenanceModeActive: () => maintenance,
    onSaved: update => saved.push(update), onPurchase: id => wallets.push(id),
    thumbnails: options.thumbnails,
  });
  const request = async (method, path, data = {}, identity = 1) => {
    const res = { statusCode: 200, set() { return this; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await routes.get(`${method}:${path}`)({ identity, body: { userId: 1, ...data }, query: { userId: 1, ...data } }, res);
    return res;
  };
  return { db, args, inventory, repository, request, saved, wallets, setMaintenance: value => { maintenance = value; } };
}

test("refunds exact legacy grouped debits, preserves gifts/objectives, clears the saved PNG and broadcasts its new revision", async t => {
  const { db, inventory, repository, request, saved, wallets } = await setup(t);
  // Historical prices deliberately differ from today's free face + 1000 hair.
  await db.exec(`UPDATE gobblar_profiles SET balance=18563 WHERE installId='1';
    INSERT INTO avatar_unlocks VALUES (1,'base:homme',1),(1,'hair:quiff',1),
      (1,'headwear:crown',1),(1,'auras:donor_prismatic',1),(1,'accessories:tiger_plush',1);
    INSERT INTO gobblar_ledger (installId,ts,delta,reason,meta) VALUES
      ('1',1,-1437,'avatar_unlock','{"items":["base:homme","hair:quiff"]}'),
      ('1',2,-600,'theme_unlock','{}'),('1',3,3000,'avatar_starter','{}');`);
  await repository.save(1, createBlankAvatar(), 0, { png: Buffer.from("old PNG"), renderVersion: 1 });
  const quote = (await request("get", "/avatar/refund")).body.quote;
  assert.equal(quote.amount, 1437);
  assert.equal(quote.itemCount, 2);
  const result = await request("post", "/avatar/refund", { refundToken: quote.token, amount: 999999, items: ["headwear:crown"] });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.refunded, 1437, "client prices and item lists are ignored");
  assert.equal(result.body.inventory.balance, 20000);
  assert.deepEqual(result.body.inventory.owned, { "headwear:crown": true, "auras:donor_prismatic": true, "accessories:tiger_plush": true });
  assert.equal((await repository.get(1)).avatar, null);
  assert.equal((await repository.get(1)).revision, 2);
  assert.equal(await repository.getThumbnail(1), undefined);
  assert.deepEqual(saved, [{ userId: 1, revision: 2 }]);
  assert.deepEqual(wallets, [1]);
  assert.equal((await inventory.get(2)).balance, 5000);
  assert.equal((await inventory.refunds.quote(1)).amount, 0);
  const audit = await db.get("SELECT delta,meta FROM gobblar_ledger WHERE reason='avatar_refund'");
  assert.equal(audit.delta, 1437);
  assert.deepEqual(JSON.parse(audit.meta).purchaseIds, [1]);
  assert.equal((await request("put", "/avatar", { avatar: createBlankAvatar(), expectedRevision: 1 })).body.error, "avatar_conflict");
  assert.equal((await request("put", "/avatar", { avatar: createBlankAvatar(), expectedRevision: 2 })).statusCode, 200);
  assert.equal((await request("put", "/avatar", { avatar: { ...createBlankAvatar(), hair: "quiff" }, expectedRevision: 3 })).body.error, "avatar_locked");
});

test("double submits refund only once; a later purchase can be refunded once using its own confirmation", async t => {
  const { inventory, db, repository } = await setup(t);
  await inventory.purchase(1, [paidPart]);
  const first = await inventory.refunds.quote(1);
  const results = await Promise.all([inventory.refunds.refundAll(1, first.token), inventory.refunds.refundAll(1, first.token)]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal((await inventory.get(1)).balance, 20000);
  assert.equal((await repository.get(1)).revision, 1, "even a never-saved avatar invalidates pending revision-zero saves");
  await inventory.purchase(1, [paidPart]);
  assert.equal((await inventory.refunds.refundAll(1, first.token)).error, "avatar_refund_changed");
  const second = await inventory.refunds.quote(1);
  assert.notEqual(second.token, first.token);
  assert.equal(second.amount, 500);
  assert.equal((await inventory.refunds.refundAll(1, second.token)).refunded, 500);
  assert.equal((await inventory.get(1)).balance, 20000);
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM gobblar_ledger WHERE reason='avatar_refund'")).n, 2);
});

test("a purchase on another device invalidates the confirmation without modifying funds or unlocks", async t => {
  const { inventory } = await setup(t);
  await inventory.purchase(1, [paidPart]);
  const quote = await inventory.refunds.quote(1);
  await inventory.purchase(1, [{ family: "brows", id: catalog.families.brows[0].id }]);
  const result = await inventory.refunds.refundAll(1, quote.token);
  assert.equal(result.error, "avatar_refund_changed");
  assert.equal(result.quote.amount, 1000);
  assert.equal((await inventory.get(1)).balance, 19000);
  assert.equal(Object.keys((await inventory.get(1)).owned).length, 2);
});

test("any failure rolls back the credit, relocking, ledger entry and avatar reset together", async t => {
  const { db, inventory, repository } = await setup(t);
  await inventory.purchase(1, [paidPart]);
  await repository.save(1, createBlankAvatar(), 0, { png: Buffer.from("keep"), renderVersion: 1 });
  await db.exec("CREATE TRIGGER refuse_reset BEFORE UPDATE ON user_avatars BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  const quote = await inventory.refunds.quote(1);
  await assert.rejects(inventory.refunds.refundAll(1, quote.token));
  assert.equal((await inventory.get(1)).balance, 19500);
  assert.equal((await inventory.get(1)).owned[`nose:${paidPart.id}`], true);
  assert.equal((await inventory.refunds.quote(1)).token, quote.token);
  assert.equal((await repository.get(1)).revision, 1);
  assert.equal((await repository.getThumbnail(1)).png.toString(), "keep");
});

test("refund routes require the current account, a server quote and an open editor", async t => {
  const { inventory, request, setMaintenance, args } = await setup(t);
  await inventory.purchase(1, [paidPart]);
  const quote = await inventory.refunds.quote(1);
  for (const method of ["get", "post"]) {
    assert.equal((await request(method, "/avatar/refund", { refundToken: quote.token }, null)).statusCode, 401);
    assert.equal((await request(method, "/avatar/refund", { refundToken: quote.token }, 2)).statusCode, 409);
  }
  assert.equal((await request("post", "/avatar/refund", {})).statusCode, 400);
  setMaintenance(true);
  for (const method of ["get", "post"]) assert.equal((await request(method, "/avatar/refund", { refundToken: quote.token })).body.error, "maintenance_mode");
  let writable = true;
  const queued = createAvatarInventoryRepository({ ...args, runWrite: task => { writable = false; return runSerializedSqliteWrite(task); } });
  await assert.rejects(queued.refunds.refundAll(1, quote.token, { assertWritable: () => {
    if (!writable) throw Object.assign(new Error("maintenance_mode"), { code: "maintenance_mode" });
  } }), { code: "maintenance_mode" });
  assert.equal((await inventory.get(1)).balance, 19500);
});

test("a refund during PNG rendering prevents the old avatar from being saved again", async t => {
  let resolveRender, started;
  const rendering = new Promise(resolve => { started = resolve; });
  const { request, inventory, repository } = await setup(t, { thumbnails: { render: () => {
    started(); return new Promise(resolve => { resolveRender = resolve; });
  } } });
  await inventory.purchase(1, [paidPart]);
  const save = request("put", "/avatar", { avatar: createBlankAvatar(), expectedRevision: 0 });
  await rendering;
  await inventory.refunds.refundAll(1, (await inventory.refunds.quote(1)).token);
  resolveRender({ png: Buffer.from("stale"), renderVersion: 1 });
  assert.equal((await save).body.error, "avatar_conflict");
  assert.equal((await repository.get(1)).avatar, null);
  assert.equal(await repository.getThumbnail(1), undefined);
});

test("unusable historical receipts fail closed instead of estimating a price", async t => {
  const { db, inventory } = await setup(t);
  await inventory.purchase(1, [paidPart]);
  const quote = await inventory.refunds.quote(1);
  await db.run("UPDATE gobblar_ledger SET meta='broken' WHERE reason='avatar_unlock'");
  await assert.rejects(inventory.refunds.quote(1), { code: "avatar_refund_unavailable" });
  await assert.rejects(inventory.refunds.refundAll(1, quote.token), { code: "avatar_refund_unavailable" });
  assert.equal((await inventory.get(1)).balance, 19500);
  assert.equal((await inventory.get(1)).owned[`nose:${paidPart.id}`], true);
});
