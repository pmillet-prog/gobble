import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createRunDirectory } from "../tests/helpers/createRunDirectory.js";
import { runSerializedSqliteWrite, runSqliteImmediateTransaction } from "../sqliteQueue.js";

test("vault additions commit ahead of the results backlog, remain idempotent and can be removed", async () => {
  const run = await createRunDirectory("word-vault-queue");
  const previous = process.env.GOBBLE_DATA_DIR;
  process.env.GOBBLE_DATA_DIR = run.directory;
  let db, background, release, pending = [];
  try {
    const vault = await import("./wordVaultService.js");
    db = await vault.initWordVaultService();
    assert.ok(db);
    background = await open({ filename: path.join(run.directory, "gobble.db"), driver: sqlite3.Database });
    await background.exec("CREATE TABLE round_writes (id INTEGER PRIMARY KEY)");
    let started;
    const entered = new Promise(resolve => { started = resolve; });
    const hold = new Promise(resolve => { release = resolve; });
    const active = runSerializedSqliteWrite(() => runSqliteImmediateTransaction(background, async () => {
      await background.run("INSERT INTO round_writes VALUES (0)");
      started(); await hold;
    }));
    pending.push(active);
    await entered;
    const observed = [];
    for (let id = 1; id <= 20; id++) pending.push(runSerializedSqliteWrite(async () => {
      observed.push(!!await background.get("SELECT word FROM word_vault_entries WHERE user_id = 12"));
      await background.run("INSERT INTO round_writes VALUES (?)", id);
    }));
    const added = vault.addWordVaultEntryForUser(12, "Énigme");
    pending.push(added);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await db.get("SELECT word FROM word_vault_entries WHERE user_id = 12"), undefined);
    release();
    const first = await added;
    await Promise.all(pending);
    assert.equal(first.ok, true);
    assert.equal(first.alreadyExists, false);
    assert.ok(observed.every(Boolean), "the add is committed before any queued result job starts");
    const retry = await vault.addWordVaultEntryForUser(12, "énigme");
    assert.equal(retry.alreadyExists, true);
    assert.deepEqual(retry.entry, first.entry);
    assert.equal((await vault.listWordVaultEntriesForUser(12)).items.length, 1);
    assert.deepEqual(await vault.removeWordVaultEntryForUser(12, "Énigme"), { ok: true, removed: true });
    assert.equal((await vault.listWordVaultEntriesForUser(12)).items.length, 0);
  } finally {
    release?.();
    await Promise.allSettled(pending);
    await background?.close();
    await db?.close();
    if (previous === undefined) delete process.env.GOBBLE_DATA_DIR;
    else process.env.GOBBLE_DATA_DIR = previous;
    await run.cleanup();
  }
});
