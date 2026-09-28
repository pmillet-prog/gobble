// The password can change while scrypt verification or device attachment awaits.
// Check the credential used to log in atomically with the session insertion.
export async function insertAuthSession(db, { sessionId, userId, tokenHash, timestamp, expiresAt, expectedPasswordHash = null }) {
  const result = await db.run(`INSERT INTO user_sessions
    (id, user_id, token_hash, created_at, last_seen_at, expires_at, invalidated_at)
    SELECT ?, id, ?, ?, ?, ?, NULL FROM users
    WHERE id = ? AND (? IS NULL OR password_hash = ?)`,
    sessionId, tokenHash, timestamp, timestamp, expiresAt, Number(userId), expectedPasswordHash, expectedPasswordHash);
  if (result.changes !== 1) throw new Error("credentials_changed");
}
