import { mkdir, open as openFile } from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { CONNECTION_AUDIT_LABELS, CONNECTION_AUDIT_RETENTION_DAYS } from '../../shared/connectionAudit.js';
import { normalizeConnectionIp } from './connectionClientIp.js';

const RETENTION_MS = CONNECTION_AUDIT_RETENTION_DAYS * 86400000;

export function createConnectionAuditRepository({ filename, now = Date.now }) {
  let pending, queue = Promise.resolve(), closed = false;
  function database() {
    if (!pending) pending = (async () => {
      const file = typeof filename === 'function' ? filename() : filename;
      if (file !== ':memory:') {
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        const handle = await openFile(file, 'a', 0o600);
        await handle.close();
      }
      const db = await open({ filename: file, driver: sqlite3.Database });
      try {
        await db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000; PRAGMA secure_delete=ON;
          CREATE TABLE IF NOT EXISTS connection_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL, nick TEXT NOT NULL, install_id TEXT NOT NULL,
            ip TEXT NOT NULL, ip_source TEXT NOT NULL, kind TEXT NOT NULL, observed_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS connection_events_user ON connection_events(user_id,id DESC);
          CREATE INDEX IF NOT EXISTS connection_events_dedupe ON connection_events(user_id,install_id,ip,kind,observed_at);
          CREATE INDEX IF NOT EXISTS connection_events_time ON connection_events(observed_at);`);
        return db;
      } catch (error) { await db.close(); throw error; }
    })().catch(error => { pending = null; throw error; });
    return pending;
  }
  function serialize(task) {
    if (closed) return Promise.reject(new Error('connection_audit_closed'));
    const next = queue.then(task);
    queue = next.catch(() => {});
    return next;
  }
  return {
    record({ userId, nick, installId = '', ip = '', ipSource = 'peer', kind }) {
      if (!Number.isSafeInteger(userId) || userId < 1 || !Object.hasOwn(CONNECTION_AUDIT_LABELS, kind))
        return Promise.reject(new Error('invalid_connection_event'));
      const at = now();
      return serialize(async () => {
        const db = await database();
        // Status retries do not fill the journal; new accounts, IPs, device IDs
        // and explicit logins remain separate, even in the same second.
        if (kind === 'session' && await db.get(`SELECT 1 FROM connection_events
          WHERE user_id=? AND install_id=? AND ip=? AND kind='session' AND observed_at>? LIMIT 1`,
        userId, String(installId).slice(0, 160), normalizeConnectionIp(ip), at - 60000)) return;
        await db.run(`INSERT INTO connection_events(user_id,nick,install_id,ip,ip_source,kind,observed_at)
          VALUES(?,?,?,?,?,?,?)`, userId, String(nick || '').slice(0, 100), String(installId).slice(0, 160),
        normalizeConnectionIp(ip), ipSource === 'forwarded' ? 'forwarded' : 'peer', kind, at);
      });
    },
    list(userId, before = null) {
      if (!Number.isSafeInteger(userId) || userId < 1 || (before !== null && (!Number.isSafeInteger(before) || before < 1)))
        return Promise.reject(new Error('invalid_account'));
      return serialize(async () => {
        const db = await database();
        const rows = await db.all(`SELECT id,user_id AS userId,nick,install_id AS installId,ip,ip_source AS ipSource,kind,observed_at AS observedAt
          FROM connection_events WHERE user_id=? AND observed_at>? AND (? IS NULL OR id<?)
          ORDER BY id DESC LIMIT 51`, userId, now() - RETENTION_MS, before, before);
        const entries = rows.slice(0, 50);
        return { entries, nextBefore: rows.length > 50 ? entries.at(-1).id : null, retentionDays: CONNECTION_AUDIT_RETENTION_DAYS };
      });
    },
    purge() {
      return serialize(async () => {
        const db = await database();
        await db.run('DELETE FROM connection_events WHERE observed_at<=?', now() - RETENTION_MS);
        await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      });
    },
    async close() {
      closed = true;
      await queue;
      if (pending) await (await pending).close();
    },
  };
}
