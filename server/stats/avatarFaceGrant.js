import { runSqliteImmediateTransaction } from "../sqliteQueue.js";

export const AVATAR_FACE_GRANT_KEY = "avatar-free-faces-2026-09-23";
export const AVATAR_FACE_GRANT_AMOUNT = 500;

export function createAvatarFaceGrant({ getDb, runWrite, now = Date.now }) {
  let initialized = false, inFlight = null;
  async function initialize() {
    if (initialized) return;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const db = await getDb();
      await runWrite(() => runSqliteImmediateTransaction(db, async () => {
        if (await db.get("SELECT 1 FROM gobblar_account_grant_campaigns WHERE campaign_key = ?", AVATAR_FACE_GRANT_KEY)) return;
        const timestamp = now();
        // Snapshot every existing account, including inactive players and those without an avatar or wallet.
        await db.run(`INSERT INTO gobblar_account_grants (campaign_key, user_id, amount, granted_at)
          SELECT ?, id, ?, ? FROM users`, AVATAR_FACE_GRANT_KEY, AVATAR_FACE_GRANT_AMOUNT, timestamp);
        await db.run(`INSERT INTO gobblar_profiles (installId, balance, updatedAt)
          SELECT CAST(user_id AS TEXT), amount, granted_at FROM gobblar_account_grants WHERE campaign_key = ?
          ON CONFLICT(installId) DO UPDATE SET balance = gobblar_profiles.balance + excluded.balance, updatedAt = excluded.updatedAt`, AVATAR_FACE_GRANT_KEY);
        await db.run(`INSERT INTO gobblar_ledger (installId, ts, delta, reason, meta)
          SELECT CAST(user_id AS TEXT), granted_at, amount, 'avatar_face_gift', ?
          FROM gobblar_account_grants WHERE campaign_key = ?`, JSON.stringify({ campaign: AVATAR_FACE_GRANT_KEY }), AVATAR_FACE_GRANT_KEY);
        await db.run("INSERT INTO gobblar_account_grant_campaigns (campaign_key, started_at) VALUES (?, ?)", AVATAR_FACE_GRANT_KEY, timestamp);
      }, { label: "avatar-face-gift" }));
      initialized = true;
    })();
    try { await inFlight; } finally { inFlight = null; }
  }
  return {
    initialize,
    async pending(userId) {
      await initialize();
      const row = await (await getDb()).get(`SELECT amount, granted_at FROM gobblar_account_grants
        WHERE campaign_key = ? AND user_id = ? AND acknowledged_at IS NULL`, AVATAR_FACE_GRANT_KEY, userId);
      return row ? { key: AVATAR_FACE_GRANT_KEY, amount: row.amount, grantedAt: row.granted_at,
        label: "Le choix du sexe et du visage devient gratuit : 500 gobblars offerts à tous les joueurs !" } : null;
    },
    async acknowledge(userId, key) {
      if (key !== AVATAR_FACE_GRANT_KEY) return false;
      const db = await getDb();
      await runWrite(() => db.run(`UPDATE gobblar_account_grants SET acknowledged_at = COALESCE(acknowledged_at, ?)
        WHERE campaign_key = ? AND user_id = ?`, now(), AVATAR_FACE_GRANT_KEY, userId));
      return true;
    },
  };
}
