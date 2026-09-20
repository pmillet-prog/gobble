import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createDonorAvatarRepository } from "../avatars/donorAvatarRepository.js";
import { createAvatarObjectivesRepository } from "../avatars/avatarObjectivesRepository.js";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";
import { SUPPORT_DONORS, DONOR_AVATAR_REWARD, normalizeDonorAccountName } from "../../shared/supportDonors.js";
import { getAvatarUnlockRule, isAvatarPartUnlocked } from "../../shared/avatarUnlocks.js";

async function setup(t, donors = SUPPORT_DONORS) {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY, username_normalized TEXT UNIQUE);
    CREATE TABLE avatar_unlocks (user_id INTEGER REFERENCES users(id), item_key TEXT, unlocked_at INTEGER, PRIMARY KEY(user_id,item_key));
    CREATE TABLE avatar_reward_notifications (user_id INTEGER, item_key TEXT, objective TEXT, unlocked_at INTEGER, acknowledged_at INTEGER, PRIMARY KEY(user_id,item_key));
    INSERT INTO users VALUES (1,'isa1958'),(2,'voggle'),(3,'test');`);
  await db.exec(await readFile(new URL("../migrations/2026-09-20-donor-avatars.sql", import.meta.url), "utf8"));
  const options = { getDb: async () => db, runWrite: task => runSerializedSqliteWrite(task) };
  return { db, options, repo: createDonorAvatarRepository({ ...options, donors }) };
}

test("donors are linked to real account IDs and receive one free aura and notification", async t => {
  const { db, repo, options } = await setup(t);
  await Promise.all([repo.ensure([1, 2, 3]), repo.ensure([1, 2]), repo.ensure([999])]);
  assert.deepEqual(await db.all("SELECT user_id, item_key FROM avatar_unlocks ORDER BY user_id"), [
    { user_id: 1, item_key: DONOR_AVATAR_REWARD.key }, { user_id: 2, item_key: DONOR_AVATAR_REWARD.key },
  ]);
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM avatar_reward_notifications")).count, 2);
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM users")).count, 3, "missing production accounts are not created locally");
  const rewards = createAvatarObjectivesRepository({ ...options, loadCatalog: async () => ({ families: { auras: [{ id: "donor_prismatic", file: "aura.png" }] } }) });
  const pending = await rewards.pending(1);
  assert.equal(pending[0].objective, "donor");
  assert.equal(pending[0].imageUrl, "/avatars/v1/aura.png");
  await rewards.acknowledge(1, [DONOR_AVATAR_REWARD.key]);
  await repo.ensure([1]);
  assert.deepEqual(await rewards.pending(1), []);
  assert.equal(getAvatarUnlockRule("auras", "donor_prismatic").pending, undefined);
  assert.equal(isAvatarPartUnlocked({ owned: {} }, "auras", "donor_prismatic"), false);
});

test("adding a donor to the shared list is sufficient on the next deployment", async t => {
  const { db, options, repo } = await setup(t);
  await repo.ensure([3]);
  const updated = createDonorAvatarRepository({ ...options, donors: [...SUPPORT_DONORS, { id: "new-donor", name: "New supporter", accountName: " TEST " }] });
  await updated.ensure([3]);
  assert.equal((await db.get("SELECT user_id FROM support_donor_accounts WHERE donor_id='new-donor'")).user_id, 3);
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM avatar_unlocks WHERE user_id=3")).count, 1);
});

test("a renamed donor retains ownership and the old name cannot claim a second aura", async t => {
  const { db, options, repo } = await setup(t);
  await repo.ensure([1]);
  await db.run("UPDATE users SET username_normalized='new-isa' WHERE id=1");
  await db.run("INSERT INTO users VALUES (4,'isa1958')");
  await createDonorAvatarRepository(options).ensure([1, 4]);
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM avatar_unlocks WHERE user_id=1")).count, 1);
  assert.equal((await db.get("SELECT COUNT(*) AS count FROM avatar_unlocks WHERE user_id=4")).count, 0);
});

test("an account absent during reconciliation can be linked after its creation", async t => {
  const { db, repo } = await setup(t);
  await repo.ensure([9]);
  await db.run("INSERT INTO users VALUES (9,'beerman')");
  await repo.ensure([9]);
  assert.equal((await db.get("SELECT user_id FROM support_donor_accounts WHERE donor_id='beerman'")).user_id, 9);
  assert.equal(normalizeDonorAccountName("  Isa1958  "), "isa1958");
});
