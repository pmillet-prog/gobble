import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createAvatarInventoryRepository } from "../avatars/avatarInventoryRepository.js";
import { loadCatalog } from "../avatars/avatarValidation.js";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";
import { initGobblarsHistory, readGobblarsHistory } from "./gobblarsHistory.js";

test("real avatar purchases and resets retain exact article names and costs in the history", async t => {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users VALUES (1),(2);
    CREATE TABLE gobblar_profiles (installId TEXT PRIMARY KEY, balance INTEGER, updatedAt INTEGER);
    INSERT INTO gobblar_profiles VALUES ('1',5000,0),('2',3000,0);
    CREATE TABLE gobblar_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, installId TEXT, ts INTEGER, delta INTEGER, reason TEXT, meta TEXT);`);
  for (const name of ["2026-09-19-avatar-unlocks", "2026-09-19-game-avatar-objectives", "2026-09-19-user-avatars", "2026-09-20-avatar-thumbnails"]) {
    await db.exec(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8"));
  }
  await initGobblarsHistory(db);
  const catalog = structuredClone(await loadCatalog());
  const nose = catalog.families.nose[0];
  const hair = catalog.families.hair.find(item => item.id === "quiff");
  assert.ok(nose && hair);
  const expectedItems = [
    { key: `nose:${nose.id}`, label: nose.label, amount: 500 },
    { key: "hair:quiff", label: hair.label, amount: 1000 },
  ];
  const inventory = createAvatarInventoryRepository({ getDb: async () => db,
    runWrite: runSerializedSqliteWrite, loadCatalog: async () => catalog });
  const purchase = await inventory.purchase(1, [{ family: "nose", id: nose.id }, { family: "hair", id: hair.id }]);
  assert.equal(purchase.ok, true);
  assert.equal(purchase.spent, 1500);
  assert.equal(purchase.inventory.balance, 3500);
  let history = await readGobblarsHistory(db, { installId: "1" });
  assert.equal(history.entries.length, 1);
  assert.equal(history.entries[0].kind, "avatar_unlock");
  assert.equal(history.entries[0].amount, -1500);
  assert.deepEqual(history.entries[0].items, expectedItems);

  // The reset carries purchase metadata forward even if the catalogue changes.
  nose.label = "Nouveau nom du nez";
  hair.label = "Nouveau nom de la coiffure";
  const quote = await inventory.refunds.quote(1);
  assert.equal(quote.amount, 1500);
  const refund = await inventory.refunds.refundAll(1, quote.token);
  assert.equal(refund.ok, true);
  assert.equal(refund.refunded, 1500);
  assert.equal(refund.inventory.balance, 5000);
  assert.equal(refund.avatarSnapshot.avatar, null);
  history = await readGobblarsHistory(db, { installId: "1" });
  assert.equal(history.entries.length, 2);
  assert.equal(history.entries[0].kind, "avatar_refund");
  assert.equal(history.entries[0].amount, 1500);
  assert.deepEqual(history.entries[0].items, expectedItems);
  assert.deepEqual(history.entries[1].items, expectedItems);
  assert.equal((await inventory.refunds.refundAll(1, quote.token)).error, "avatar_refund_changed");
  assert.equal((await readGobblarsHistory(db, { installId: "1" })).entries.length, 2);
  assert.deepEqual((await readGobblarsHistory(db, { installId: "2" })).entries, []);
  assert.equal((await inventory.get(2)).balance, 3000);
});

test("real theme purchases preserve nondefault prices and weekly team rewards are recorded exactly once", async t => {
  const temporaryRoot = path.resolve(tmpdir());
  const directory = await mkdtemp(path.join(temporaryRoot, "gobble-ledger-history-"));
  t.after(async () => {
    // Restrict recursive cleanup to the fresh directory created by this test.
    assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
    assert.ok(path.basename(directory).startsWith("gobble-ledger-history-"));
    await rm(directory, { recursive: true, force: true });
  });
  // The wallet service owns a module-level connection. Isolate it in a child
  // process whose data path is set before import; no live server is started.
  const script = `
    import assert from "node:assert/strict";
    const service = await import(process.argv[1]);
    await service.initGobblarsService({ applyGlobalGrant: false });
    const installId = "ledger-history-fixture";
    assert.equal((await service.addGobblars({ installId, amount: 3000, reason: "manual" })).ok, true);
    const starting = await service.getGobblarProfileReadOnly(installId);
    const startingEntryCount = (await service.getGobblarsHistory({ installId })).entries.length;
    const single = await service.applyThemeSelection({ installId, mode: "single", category: "font",
      draftTheme: { ...starting.themeApplied, font: "rounded" }, unlockCost: 137 });
    assert.equal(single.ok, true);
    assert.equal(single.spent, 137);
    const fullDraft = { ...single.themeApplied, tileColor: "ocean", background: "solid-night" };
    const full = await service.applyThemeSelection({ installId, mode: "full", draftTheme: fullDraft, unlockCost: 137 });
    assert.equal(full.ok, true);
    assert.equal(full.spent, 274);
    const repeated = await service.applyThemeSelection({ installId, mode: "full", draftTheme: fullDraft, unlockCost: 999 });
    assert.equal(repeated.spent, 0);
    const winner = await service.grantWeeklyWinnerGobblars({ installId, weekId: "2026-W40" });
    assert.equal(winner.awarded, true);
    const repeatedWinner = await service.grantWeeklyWinnerGobblars({ installId, weekId: "2026-W40" });
    assert.equal(repeatedWinner.awarded, false);
    const { entries } = await service.getGobblarsHistory({ installId });
    assert.equal(entries.length, startingEntryCount + 3);
    const themeSingle = entries.find(entry => entry.kind === "theme_unlock_single");
    assert.equal(themeSingle.amount, -137);
    assert.deepEqual(themeSingle.items, [{ key: "font:rounded", amount: 137 }]);
    const themeFull = entries.find(entry => entry.kind === "theme_unlock_full");
    assert.equal(themeFull.amount, -274);
    assert.deepEqual(themeFull.items, [{ key: "tileColor:ocean", amount: 137 }, { key: "background:solid-night", amount: 137 }]);
    const rewards = entries.filter(entry => entry.kind === "weekly_duel_winner");
    assert.equal(rewards.length, 1);
    assert.equal(rewards[0].amount, 100);
    assert.equal(rewards[0].weekId, "2026-W40");
    assert.equal((await service.getGobblarProfileReadOnly(installId)).balance, starting.balance - 411 + 100);
    assert.deepEqual((await service.getGobblarsHistory({ installId: "unrelated-account" })).entries, []);
    console.log("ledger producers verified");
  `;
  const { stdout } = await promisify(execFile)(process.execPath,
    ["--preserve-symlinks", "--preserve-symlinks-main", "--input-type=module", "--eval", script,
      new URL("./gobblarsService.js", import.meta.url).href],
    { env: { ...process.env, GOBBLE_DATA_DIR: directory }, windowsHide: true, timeout: 15000 });
  assert.match(stdout, /ledger producers verified/);
});
