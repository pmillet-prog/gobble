import path from "node:path";
import { readFile } from "node:fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createAvatarThumbnailRenderer } from "../avatars/avatarThumbnailRenderer.js";
import { rebuildAvatarRenderAssets } from "../avatars/rebuildAvatarRenderAssets.js";

const args = process.argv.slice(2), database = args.find(value => value.startsWith("--db="))?.slice(5);
const apply = args.includes("--apply"), migrate = args.includes("--migrate");
const backup = args.find(value => value.startsWith("--backup="))?.slice(9);
if (!database || args.some(value => !["--apply", "--migrate"].includes(value) && !value.startsWith("--db=") && !value.startsWith("--backup="))
    || ((migrate || backup) && !apply) || (migrate && !backup)) {
  console.error('Usage: node server/scripts/rebuild-avatar-render-assets.mjs --db="path/to/gobble.db" [--apply [--migrate --backup="path/to/new-backup.db"]]');
  process.exitCode = 1;
} else {
  const db = await open({ filename: path.resolve(database), driver: sqlite3.Database,
    mode: apply ? sqlite3.OPEN_READWRITE : sqlite3.OPEN_READONLY });
  let renderer;
  try {
    await db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    if (backup) {
      // SQLite produces a consistent snapshot including committed WAL pages.
      // VACUUM INTO refuses to overwrite an existing backup.
      const backupPath = path.resolve(backup);
      await db.run("VACUUM INTO ?", backupPath);
      console.log(JSON.stringify({ backup: backupPath }));
    }
    if (migrate) {
      const sql = await readFile(new URL("../migrations/2026-11-03-avatar-render-assets.sql", import.meta.url), "utf8");
      await db.exec(`BEGIN IMMEDIATE; ${sql} COMMIT;`);
    }
    const schema = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_avatar_renders'");
    if (!schema) throw new Error("Appliquer la migration 2026-11-03-avatar-render-assets.sql avant ce rattrapage.");
    if (apply) renderer = createAvatarThumbnailRenderer();
    const report = await rebuildAvatarRenderAssets({ db, renderer, apply,
      onProgress: value => {
        if (value.error) console.error(JSON.stringify(value));
        else if (value.selected % 10 === 0) console.log(JSON.stringify({ progress: value }));
      } });
    console.log(JSON.stringify({ apply, ...report }, null, 2));
    if (report.failed) process.exitCode = 1;
  } finally { renderer?.dispose(); await db.close(); }
}
