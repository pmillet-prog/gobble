import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

test("actual account creation runs the migrations and persists a single welcome credit", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gobble-starter-registration-"));
  try {
    const script = `
      import assert from 'node:assert/strict';
      import sqlite3 from 'sqlite3';
      import { open } from 'sqlite';
      import path from 'node:path';
      const { createUser, initAuthService, avatarStarterGrant } = await import('./auth/authService.js');
      await Promise.all([initAuthService(), initAuthService()]);
      const created = await createUser({ usernameDisplay: 'TestStarterGrant', password: 'Local-test-only-123!' });
      assert.equal(created.ok, true, JSON.stringify(created));
      const userId = created.user.id;
      const db = await open({ filename: path.join(process.env.GOBBLE_DATA_DIR, 'gobble.db'), driver: sqlite3.Database });
      assert.equal((await db.get('SELECT balance FROM gobblar_profiles WHERE installId=?', String(userId))).balance, 3000);
      assert.match((await avatarStarterGrant.pending(userId)).label, /Bienvenue/);
      await initAuthService();
      const duplicate = await createUser({ usernameDisplay: 'TestStarterGrant', password: 'Local-test-only-123!' });
      assert.equal(duplicate.ok, false);
      assert.equal((await db.get('SELECT COUNT(*) AS n FROM gobblar_starter_grants')).n, 1);
      assert.equal((await db.get('SELECT COUNT(*) AS n FROM gobblar_ledger WHERE reason=?', 'avatar_starter')).n, 1);
      await db.close();
      console.log('registration grant verified');
    `;
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], {
      cwd: new URL("../", import.meta.url), env: { ...process.env, GOBBLE_DATA_DIR: directory }, timeout: 30000,
    });
    assert.match(stdout, /registration grant verified/);
  } finally {
    // Remove only the isolated directory returned by mkdtemp, never a data directory.
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("gobble-starter-registration-"));
    await rm(directory, { recursive: true, force: true });
  }
});
