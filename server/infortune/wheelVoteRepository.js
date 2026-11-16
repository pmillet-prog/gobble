import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { WHEEL_VOTE_ID, normalizeWheelVote } from '../../shared/wheelVote.js';

export function createWheelVoteRepository({ filename, now = Date.now }) {
  let pending;
  async function database() {
    if (!pending) pending = (async () => {
      const file = typeof filename === 'function' ? filename() : filename;
      if (file !== ':memory:') await mkdir(path.dirname(file), { recursive: true });
      const db = await open({ filename: file, driver: sqlite3.Database });
      try {
        await db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
          CREATE TABLE IF NOT EXISTS wheel_votes (
            poll_id TEXT NOT NULL, user_id INTEGER NOT NULL, nick TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('voted','skipped')), choices TEXT NOT NULL, suggestion TEXT NOT NULL,
            created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
            PRIMARY KEY (poll_id, user_id)
          );`);
        return db;
      } catch (error) { await db.close(); throw error; }
    })().catch(error => { pending = null; throw error; });
    return pending;
  }
  const decode = row => row ? { ...row, choices: JSON.parse(row.choices) } : null;
  const columns = 'user_id AS userId,nick,status,choices,suggestion,created_at AS createdAt,updated_at AS updatedAt';
  return {
    async read(userId) {
      return decode(await (await database()).get(`SELECT ${columns} FROM wheel_votes WHERE poll_id=? AND user_id=?`, WHEEL_VOTE_ID, userId));
    },
    async save(account, value) {
      const vote = normalizeWheelVote(value), time = now();
      if (!Number.isSafeInteger(account?.id) || account.id < 1) throw new Error('invalid_account');
      // One atomic upsert per account: edits and request retries never add a voter.
      await (await database()).run(`INSERT INTO wheel_votes (poll_id,user_id,nick,status,choices,suggestion,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(poll_id,user_id) DO UPDATE SET
        nick=excluded.nick,status=excluded.status,choices=excluded.choices,suggestion=excluded.suggestion,updated_at=excluded.updated_at`,
      WHEEL_VOTE_ID, account.id, String(account.usernameDisplay || account.usernameNormalized || 'Joueur').slice(0, 100),
      vote.status, JSON.stringify(vote.choices), vote.suggestion, time, time);
      return this.read(account.id);
    },
    async list() {
      const rows = await (await database()).all(`SELECT ${columns} FROM wheel_votes WHERE poll_id=?`, WHEEL_VOTE_ID);
      return rows.map(decode).sort((a, b) => a.nick.localeCompare(b.nick, 'fr', { sensitivity: 'base' }) || a.userId - b.userId);
    },
    async close() { if (pending) { const db = await pending; pending = null; await db.close(); } },
  };
}
