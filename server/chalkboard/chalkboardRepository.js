import { mkdir } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function openChalkboardRepository(filename) {
  await mkdir(path.dirname(filename), { recursive: true });
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS chalkboard_meta (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chalkboard_entries (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chalkboard_exports (
      id TEXT PRIMARY KEY, week_id TEXT NOT NULL, snapshot TEXT NOT NULL,
      created_at INTEGER NOT NULL, requested_by TEXT, png_path TEXT,
      sent_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, error TEXT
    );
    CREATE INDEX IF NOT EXISTS chalkboard_exports_pending ON chalkboard_exports(next_attempt_at,created_at) WHERE sent_at IS NULL;
    CREATE INDEX IF NOT EXISTS chalkboard_archives_week ON chalkboard_exports(week_id DESC) WHERE requested_by IS NULL AND png_path IS NOT NULL;`);

  async function load() {
    const meta = await db.get("SELECT json FROM chalkboard_meta WHERE id=1");
    if (!meta) return null;
    const state = JSON.parse(meta.json);
    const entries = (await db.all("SELECT json FROM chalkboard_entries")).map(row => JSON.parse(row.json)).sort((a, b) => a.z - b.z);
    return { ...state, boards: { free: entries } };
  }

  const snapshotForExport = state => ({ board: "free", weekId: state.weekId, revision: state.revision,
    interventions: state.boards.free.map(({ ownerId, authorSeal, ...entry }) => entry) });

  async function enqueue(state, id, createdAt, requestedBy = null) {
    await db.run("INSERT OR IGNORE INTO chalkboard_exports (id,week_id,snapshot,created_at,requested_by) VALUES (?,?,?,?,?)", id, state.weekId, JSON.stringify(snapshotForExport(state)), createdAt, requestedBy);
    return { id, weekId: state.weekId };
  }

  async function save(before, after, now) {
    const previous = new Map((before?.boards.free || []).map(entry => [entry.id, entry]));
    const current = new Map(after.boards.free.map(entry => [entry.id, entry]));
    await db.exec("BEGIN IMMEDIATE");
    try {
      // Archive and reset commit together. Even if mail delivery or the
      // process fails, the outgoing board remains available in the outbox.
      if (before && before.weekId !== after.weekId) await enqueue(before, `weekly-${before.weekId}`, now);
      for (const id of previous.keys()) if (!current.has(id)) await db.run("DELETE FROM chalkboard_entries WHERE id=?", id);
      for (const [id, entry] of current) if (previous.get(id) !== entry) await db.run("INSERT OR REPLACE INTO chalkboard_entries(id,json) VALUES (?,?)", id, JSON.stringify(entry));
      const { boards, ...meta } = after;
      await db.run("INSERT OR REPLACE INTO chalkboard_meta(id,json) VALUES(1,?)", JSON.stringify(meta));
      await db.exec("COMMIT");
    } catch (error) { await db.exec("ROLLBACK"); throw error; }
  }

  return {
    load, save, enqueue,
    nextExport: now => db.get("SELECT * FROM chalkboard_exports WHERE sent_at IS NULL AND next_attempt_at<=? ORDER BY created_at LIMIT 1", now),
    setPng: (id, filename) => db.run("UPDATE chalkboard_exports SET png_path=? WHERE id=?", filename, id),
    markSent: (id, now) => db.run("UPDATE chalkboard_exports SET sent_at=?, error=NULL WHERE id=?", now, id),
    markFailed: (id, now, attempts, error) => db.run("UPDATE chalkboard_exports SET attempts=?,next_attempt_at=?,error=? WHERE id=?", attempts, now + Math.min(3600000, 60000 * 2 ** Math.min(attempts - 1, 6)), error, id),
    exportStatus: id => db.get("SELECT id,week_id,created_at,png_path,sent_at,attempts,error FROM chalkboard_exports WHERE id=?", id),
    listArchives: (before = "9999-99-99", limit = 31) => db.all("SELECT week_id,created_at FROM chalkboard_exports WHERE requested_by IS NULL AND id = 'weekly-' || week_id AND png_path IS NOT NULL AND week_id < ? ORDER BY week_id DESC LIMIT ?", before, limit),
    getArchive: weekId => db.get("SELECT png_path FROM chalkboard_exports WHERE id=? AND week_id=? AND requested_by IS NULL AND png_path IS NOT NULL", `weekly-${weekId}`, weekId),
    close: () => db.close(),
  };
}
