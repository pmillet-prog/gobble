import { mkdir } from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const DAY_MS = 86_400_000;
export const DEFAULT_CHAT_AUDIT_RETENTION_DAYS = 30;

export async function openChatAuditRepository(filename, {
  retentionDays = DEFAULT_CHAT_AUDIT_RETENTION_DAYS,
  now = Date.now,
} = {}) {
  retentionDays = Number(retentionDays);
  if (!Number.isInteger(retentionDays) || retentionDays < 0 || retentionDays > 3650) {
    throw new Error("invalid_chat_audit_retention");
  }
  await mkdir(path.dirname(filename), { recursive: true });
  const db = await open({ filename, driver: sqlite3.Database });
  try {
    await db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS chat_audit (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL, message_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('sent','edited','deleted')),
        at INTEGER NOT NULL, sent_at INTEGER NOT NULL,
        nick TEXT NOT NULL, user_id INTEGER, install_id TEXT,
        text TEXT NOT NULL, previous_text TEXT, submitted_text TEXT
      );
      CREATE INDEX IF NOT EXISTS chat_audit_room_time ON chat_audit(room_id,at);
      CREATE INDEX IF NOT EXISTS chat_audit_time ON chat_audit(at);`);
  } catch (error) {
    await db.close();
    throw error;
  }
  const cutoff = () => retentionDays ? now() - retentionDays * DAY_MS : 0;
  const prune = () => retentionDays
    ? db.run("DELETE FROM chat_audit WHERE at < ?", cutoff())
    : Promise.resolve();
  try { await prune(); }
  catch (error) { await db.close(); throw error; }
  const timer = setInterval(() => {
    prune().catch(error => console.error("[chat-audit] retention failed", error.code || error.message));
  }, 60 * 60 * 1000);
  timer.unref?.();

  return {
    retentionDays,
    async append({ action, roomId, message, previousText = null, submittedText = null, at = now() }) {
      await db.run(`INSERT INTO chat_audit
        (room_id,message_id,action,at,sent_at,nick,user_id,install_id,text,previous_text,submitted_text)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      roomId, message.id, action, at, message.t, message.nick || "Anonyme",
      message.userId || null, message.installId || null, message.text,
      previousText, submittedText && submittedText !== message.text ? submittedText : null);
    },
    async list({ roomId, from, to, before, query = "" } = {}) {
      const end = to == null ? now() : Number(to);
      const start = from == null ? end - 24 * 60 * 60 * 1000 : Number(from);
      const cursor = before == null ? Number.MAX_SAFE_INTEGER : Number(before);
      if (!roomId || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
          start < 0 || end < start || !Number.isSafeInteger(cursor) || cursor < 1 ||
          typeof query !== "string" || query.length > 100) throw new Error("invalid_chat_query");
      const search = query.trim();
      const rows = await db.all(`SELECT seq,room_id AS roomId,message_id AS messageId,
        action,at,sent_at AS sentAt,nick,user_id AS userId,install_id AS installId,
        text,previous_text AS previousText,submitted_text AS submittedText
        FROM chat_audit WHERE room_id=? AND at>=? AND at<=? AND seq<?
        ${search ? "AND (instr(lower(nick),lower(?))>0 OR instr(lower(text),lower(?))>0 OR instr(lower(COALESCE(previous_text,'')),lower(?))>0 OR instr(lower(COALESCE(submitted_text,'')),lower(?))>0)" : ""}
        ORDER BY seq DESC LIMIT 51`,
      roomId, Math.max(start, cutoff()), end, cursor, ...(search ? [search, search, search, search] : []));
      const entries = rows.slice(0, 50);
      return { entries, nextBefore: rows.length > 50 ? entries.at(-1).seq : null, retentionDays };
    },
    prune,
    async close() {
      clearInterval(timer);
      await db.close();
    },
  };
}
