import assert from "node:assert/strict";
import test from "node:test";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { insertAuthSession } from "./insertAuthSession.js";

test("a login verified before a reset cannot create a session afterwards", async t => {
  const db = await open({ filename: ":memory:", driver: sqlite3.Database });
  t.after(() => db.close());
  await db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,password_hash TEXT); CREATE TABLE user_sessions(id TEXT,user_id INTEGER,token_hash TEXT,created_at INTEGER,last_seen_at INTEGER,expires_at INTEGER,invalidated_at INTEGER); INSERT INTO users VALUES(1,'old-hash')");
  const session = { sessionId: "session", userId: 1, tokenHash: "token-hash", timestamp: 1, expiresAt: 100, expectedPasswordHash: "old-hash" };
  await db.run("UPDATE users SET password_hash='new-hash' WHERE id=1");
  await assert.rejects(insertAuthSession(db, session), /credentials_changed/);
  assert.equal((await db.get("SELECT count(*) n FROM user_sessions")).n, 0);
  await insertAuthSession(db, { ...session, expectedPasswordHash: "new-hash" });
  assert.equal((await db.get("SELECT count(*) n FROM user_sessions")).n, 1);
  await db.run("DELETE FROM users WHERE id=1");
  await assert.rejects(insertAuthSession(db, { ...session, expectedPasswordHash: null }), /credentials_changed/);
});
