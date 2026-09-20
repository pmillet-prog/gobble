import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createWeeklyAvatarAuras } from "../avatars/weeklyAvatarAuras.js";
import { createAvatarInventoryRepository } from "../avatars/avatarInventoryRepository.js";
import { validateAvatarConfiguration } from "../avatars/avatarValidation.js";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";
import { createBlankAvatar, normalizeAvatar } from "../../shared/avatarConfiguration.js";
import { getWeeklyAuraDeadline, applyWeeklyAuraAppearance } from "../../shared/avatarWeeklyAuras.js";
import { isAvatarPartUnlocked } from "../../shared/avatarUnlocks.js";

const WEEK = 7 * 86400000;
async function setup(t, podium = [{ rank: 1, playerKey: "install:1" }, { rank: 2, installId: "2" }, { rank: 3, installId: "3" }]) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  let time = Date.parse("2026-10-18T22:00:00Z");
  t.mock.method(Date, "now", () => time);
  let period = { weekStartTs: time, nextResetTs: time + WEEK + 3600000, podium }; // DST ends this week in Paris.
  await db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users VALUES (1),(2),(3),(4);
    CREATE TABLE gobblar_profiles (installId TEXT PRIMARY KEY, balance INTEGER, updatedAt INTEGER);
    CREATE TABLE gobblar_ledger (installId TEXT, ts INTEGER, delta INTEGER, reason TEXT, meta TEXT);
    INSERT INTO gobblar_profiles VALUES ('1',5000,0),('2',5000,0),('3',5000,0),('4',5000,0);`);
  for (const name of ["2026-09-19-avatar-unlocks.sql", "2026-09-19-game-avatar-objectives.sql", "2026-09-20-weekly-avatar-auras.sql"]) {
    await db.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  }
  await db.exec("INSERT INTO avatar_unlocks (user_id,item_key,unlocked_at) VALUES (1,'base:homme',0),(2,'base:homme',0),(3,'base:homme',0),(1,'auras:donor_prismatic',0)");
  const catalog = JSON.parse(await readFile(new URL("../../public/avatars/v1/catalog.json", import.meta.url)));
  let writes = 0, reads = 0;
  const updates = [], timers = new Map();
  const args = { getDb: async () => db, loadCatalog: async () => catalog, runWrite: task => { writes++; return runSerializedSqliteWrite(task); } };
  const auras = createWeeklyAvatarAuras({ ...args, now: () => time, setTimer: (fn, delay) => { timers.set(1, { fn, delay }); return 1; }, clearTimer: id => timers.delete(id) });
  const stop = auras.start({ getPeriod: () => { reads++; return period; }, onUpdate: value => updates.push(value) });
  t.after(stop);
  const inventory = createAvatarInventoryRepository({ ...args, weeklyAuras: auras });
  await auras.ensure();
  return { db, auras, inventory, updates, timers, reads: () => reads, writes: () => writes, time: () => time,
    setTime: value => { time = value; },
    next: async nextPodium => { time = period.nextResetTs; period = { weekStartTs: time, nextResetTs: time + WEEK, podium: nextPodium }; return auras.ensure(); } };
}

test("the previous podium grants three temporary auras, offline receipts, and one cached reconciliation", async t => {
  const h = await setup(t);
  assert.deepEqual((await h.auras.ensure()).grants, { 1: "weekly_gold", 2: "weekly_silver", 3: "weekly_bronze" });
  const before = h.writes();
  await Promise.all(Array.from({ length: 40 }, () => h.auras.ensure()));
  assert.equal(h.writes(), before);
  assert.equal(h.reads(), 1);
  assert.equal(h.timers.size, 1);
  assert.equal(h.timers.get(1).delay, WEEK + 3600000 + 25, "use the Paris reset supplied by rankings, including DST");
  const owned = await h.inventory.get(1);
  assert.equal(isAvatarPartUnlocked(owned, "auras", "weekly_gold"), true);
  assert.equal(owned.owned["auras:weekly_gold"], undefined, "never grant permanent ownership");
  assert.equal(owned.balance, 5000);
  const rewards = await h.inventory.objectives.pending(1);
  assert.equal(rewards[0].objective, "weekly_race");
  assert.ok(rewards[0].imageUrl.endsWith(".png"));
  assert.equal((await h.auras.pending(4)).length, 0);
  await h.inventory.objectives.acknowledge(1, [rewards[0].key]);
  assert.deepEqual(await h.auras.pending(1), []);
});

test("midnight renews the same rank, replaces another rank, removes a lost podium and its obsolete toast", async t => {
  const h = await setup(t);
  const gold = (await h.auras.pending(1))[0], silver = (await h.auras.pending(2))[0];
  await h.auras.acknowledge(1, [gold.key]);
  const avatar = { ...createBlankAvatar(), auras: "weekly_gold" };
  const visible = await h.inventory.appearance(1, avatar);
  assert.ok(visible.weeklyAura);
  const newWeek = await h.next([{ rank: 1, installId: "1" }, { rank: 2, installId: "3" }, { rank: 3, installId: "4" }]);
  assert.deepEqual(await h.auras.pending(1), [], "an uninterrupted renewal is not a new unlock");
  assert.equal(getWeeklyAuraDeadline(visible, newWeek), newWeek.expiresAt);
  assert.deepEqual(await h.auras.pending(2), [], "expired rewards cannot show late on the phone");
  assert.deepEqual(await h.auras.temporary(2), {});
  const third = await h.inventory.get(3);
  assert.equal(isAvatarPartUnlocked(third, "auras", "weekly_silver"), true);
  assert.equal(isAvatarPartUnlocked(third, "auras", "weekly_bronze"), false);
  assert.equal(isAvatarPartUnlocked(await h.inventory.get(1), "auras", "donor_prismatic"), true);
  const oldThird = { ...createBlankAvatar(), auras: "weekly_bronze" };
  const appearances = await h.inventory.filterAppearances({ 1: avatar, 3: oldThird });
  assert.equal(appearances[3].auras, "", "remove the expired aura without hiding the whole face");
  assert.equal(appearances[3].base, "homme");
  assert.equal(await h.inventory.canEquip(3, oldThird), false);
  assert.equal((await h.inventory.purchase(3, [{ family: "auras", id: "weekly_gold" }])).error, "avatar_objective_locked");
  await h.next([{ rank: 2, installId: "2" }]);
  const newSilver = (await h.auras.pending(2))[0];
  assert.notEqual(newSilver.key, silver.key);
  await h.auras.acknowledge(2, [silver.key]);
  assert.equal((await h.auras.pending(2)).length, 1, "a late old acknowledgment cannot swallow a new unlock");
  assert.equal((await h.db.get("SELECT COUNT(*) AS n FROM avatar_weekly_auras")).n, 1);
});

test("unknown accounts and nicknames cannot claim podium entitlements", async t => {
  const h = await setup(t, [{ rank: 1, installId: "999" }, { rank: 2, nick: "Tigre", playerKey: "nick:Tigre" }]);
  assert.deepEqual((await h.auras.ensure()).grants, {});
  const forged = { ...createBlankAvatar(), auras: "weekly_gold", weeklyAura: { userId: 1, id: "weekly_gold", expiresAt: h.time() + WEEK } };
  const normalized = await validateAvatarConfiguration(forged);
  assert.equal(normalized.weeklyAura, undefined, "the server discards client entitlement metadata");
  assert.equal(await h.inventory.canEquip(1, normalized), false);
  assert.equal(isAvatarPartUnlocked({ owned: { "auras:weekly_gold": true } }, "auras", "weekly_gold"), false);
});

test("a cached portrait expires locally even without a server response, with safe renewal on reconnect", () => {
  const initial = { ...createBlankAvatar(), auras: "weekly_gold" };
  const avatar = normalizeAvatar(applyWeeklyAuraAppearance(initial, { userId: 1, temporary: { "auras:weekly_gold": 2000 } }, 1000));
  assert.equal(getWeeklyAuraDeadline(avatar, null), 2000);
  assert.equal(getWeeklyAuraDeadline(avatar, { expiresAt: 3000, grants: { 1: "weekly_gold" } }), 3000);
  assert.equal(getWeeklyAuraDeadline(avatar, { expiresAt: 3000, grants: { 1: "weekly_silver" } }), 1);
  assert.equal(applyWeeklyAuraAppearance(initial, { userId: 1, temporary: { "auras:weekly_gold": 2000 } }, 2000).auras, "");
  assert.equal(getWeeklyAuraDeadline(initial, null), 0, "locked pieces remain freely previewable in the atelier");
});
