import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.join(
  __dirname,
  "../migrations/2026-08-11-user-ui-seen.sql"
);

test("account UI baseline applies once to existing accounts only", async () => {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  try {
    await db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        username_display TEXT NOT NULL
      );
      INSERT INTO users (id, username_display) VALUES (1, 'Ancien compte');
    `);
    const migration = await fs.readFile(migrationPath, "utf8");
    await db.exec(migration);

    const existingMarkers = await db.all(
      "SELECT marker FROM user_ui_seen WHERE user_id = 1 ORDER BY marker"
    );
    assert.deepEqual(
      existingMarkers.map((entry) => entry.marker),
      [
        "duel-tutorial:duel-v1",
        "migration:account-ui-seen-baseline:v1",
        "patch-notes:2026-08-09",
        "tutorial:guided-results:v3",
        "tutorial:main:v1",
      ]
    );

    await db.run("INSERT INTO users (id, username_display) VALUES (2, 'Nouveau compte')");
    await db.exec(migration);
    const newAccountCount = await db.get(
      "SELECT COUNT(*) AS count FROM user_ui_seen WHERE user_id = 2"
    );
    assert.equal(newAccountCount.count, 0);
  } finally {
    await db.close();
  }
});
