import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { createAvatarThumbnailRenderer } from "../avatars/avatarThumbnailRenderer.js";
import { rebuildAvatarThumbnails } from "../avatars/rebuildAvatarThumbnails.js";

const args = process.argv.slice(2), database = args.find(value => value.startsWith("--db="))?.slice(5);
if (!database || args.some(value => value !== "--apply" && !value.startsWith("--db="))) {
  console.error('Usage: node server/scripts/rebuild-avatar-thumbnails.mjs --db="path/to/auth.sqlite" [--apply]');
  process.exitCode = 1;
} else {
  const apply = args.includes("--apply");
  const db = await open({ filename: path.resolve(database), driver: sqlite3.Database,
    mode: apply ? sqlite3.OPEN_READWRITE : sqlite3.OPEN_READONLY });
  let renderer;
  try {
    await db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    if (apply) renderer = createAvatarThumbnailRenderer();
    const report = await rebuildAvatarThumbnails({ db, renderer, apply,
      onProgress: value => { if (value.error) console.error(JSON.stringify(value)); } });
    console.log(JSON.stringify({ apply, ...report }, null, 2));
    if (report.failed) process.exitCode = 1;
  } finally { renderer?.dispose(); await db.close(); }
}
