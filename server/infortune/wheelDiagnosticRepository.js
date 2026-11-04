import { mkdir } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

export function createWheelDiagnosticRepository({ filename, now = Date.now }) {
  let pending;
  async function database() {
    if (!pending) pending = (async () => {
      const file = typeof filename === "function" ? filename() : filename;
      if (file !== ":memory:") await mkdir(path.dirname(file), { recursive: true });
      const db = await open({ filename: file, driver: sqlite3.Database });
      try {
        await db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
          CREATE TABLE IF NOT EXISTS wheel_diagnostics (
            seq INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL, user_id INTEGER, nick TEXT NOT NULL, report TEXT NOT NULL
          );`);
        return db;
      } catch (error) { await db.close(); throw error; }
    })().catch(error => { pending = null; throw error; });
    return pending;
  }
  return {
    async save(report, account) {
      const db = await database();
      // A retried POST after a lost response never duplicates or overwrites a report.
      const result = await db.run("INSERT OR IGNORE INTO wheel_diagnostics (session_id,created_at,user_id,nick,report) VALUES (?,?,?,?,?)",
        report.id, now(), account?.id || null, String(account?.usernameDisplay || account?.usernameNormalized || "Invité").slice(0, 100), JSON.stringify(report));
      if (result.changes) await db.run("DELETE FROM wheel_diagnostics WHERE seq NOT IN (SELECT seq FROM wheel_diagnostics ORDER BY seq DESC LIMIT 5000)");
      return { stored: !!result.changes };
    },
    async list(before = Number.MAX_SAFE_INTEGER) {
      if (!Number.isSafeInteger(before) || before < 1) throw new Error("invalid_cursor");
      const db = await database();
      const rows = await db.all("SELECT seq,created_at AS createdAt,user_id AS userId,nick,report FROM wheel_diagnostics WHERE seq < ? ORDER BY seq DESC LIMIT 26", before);
      const total = await db.get("SELECT COUNT(*) AS count FROM wheel_diagnostics");
      return { total: total.count, entries: rows.slice(0, 25).map(row => ({ ...row, report: JSON.parse(row.report) })),
        nextBefore: rows.length > 25 ? rows[24].seq : null };
    },
    async close() { if (pending) { const db = await pending; pending = null; await db.close(); } },
  };
}
