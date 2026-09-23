import { createHash } from "node:crypto";
import { runSqliteImmediateTransaction } from "../sqliteQueue.js";

// Legacy grouped purchases already record their exact debit and item keys.
// Never reconstruct a refund using today's catalogue prices.
async function readRefund(db, userId) {
  const purchases = await db.all(`SELECT rowid AS id, delta, meta FROM gobblar_ledger
    WHERE installId = ? AND reason = 'avatar_unlock' AND rowid > COALESCE(
      (SELECT MAX(rowid) FROM gobblar_ledger WHERE installId = ? AND reason = 'avatar_refund'), 0)
    ORDER BY rowid`, String(userId), String(userId));
  const keys = new Set();
  let amount = 0;
  for (const purchase of purchases) {
    let items;
    try { items = JSON.parse(purchase.meta)?.items; } catch { /* Fail closed below. */ }
    if (!Number.isSafeInteger(purchase.delta) || purchase.delta >= 0 || !Array.isArray(items)
      || !items.length || items.some(key => typeof key !== "string" || !/^[^:]+:[^:]+$/.test(key))) {
      throw Object.assign(new Error("avatar_refund_unavailable"), { code: "avatar_refund_unavailable" });
    }
    amount -= purchase.delta;
    items.forEach(key => keys.add(key));
  }
  if (!Number.isSafeInteger(amount)) throw new Error("avatar_refund_overflow");
  return {
    keys: [...keys], purchaseIds: purchases.map(row => row.id),
    quote: { amount, itemCount: keys.size, token: amount
      ? createHash("sha256").update(JSON.stringify([userId, purchases])).digest("hex") : null },
  };
}

export function createAvatarRefundRepository({ getDb, runWrite, readInventory, prepare }) {
  return {
    async quote(userId) { return (await readRefund(await getDb(), userId)).quote; },
    async refundAll(userId, token, { assertWritable = () => {} } = {}) {
      assertWritable();
      await prepare(userId);
      const db = await getDb();
      return runWrite(() => runSqliteImmediateTransaction(db, async () => {
        assertWritable();
        const { quote, keys, purchaseIds } = await readRefund(db, userId);
        // Also protects retries/double clicks and purchases made on another device
        // since the confirmation was displayed.
        if (!quote.amount || quote.token !== token) return { ok: false, error: "avatar_refund_changed", quote };
        const now = Date.now();
        const credit = await db.run(`UPDATE gobblar_profiles SET balance = balance + ?, updatedAt = ?
          WHERE installId = ?`, quote.amount, now, String(userId));
        if (credit.changes !== 1) throw new Error("avatar_wallet_unavailable");
        for (const key of keys) await db.run("DELETE FROM avatar_unlocks WHERE user_id = ? AND item_key = ?", userId, key);
        await db.run("INSERT INTO gobblar_ledger (installId, ts, delta, reason, meta) VALUES (?, ?, ?, ?, ?)",
          String(userId), now, quote.amount, "avatar_refund", JSON.stringify({ items: keys, purchaseIds }));
        // A tombstone, rather than a deleted row, invalidates drafts on every
        // device, including a first save that is still rendering its thumbnail.
        await db.run(`INSERT INTO user_avatars (user_id, configuration, revision, updated_at)
          VALUES (?, 'null', 1, ?) ON CONFLICT(user_id) DO UPDATE SET configuration = 'null',
          revision = revision + 1, updated_at = excluded.updated_at`, userId, now);
        await db.run("DELETE FROM user_avatar_thumbnails WHERE user_id = ?", userId);
        const { revision } = await db.get("SELECT revision FROM user_avatars WHERE user_id = ?", userId);
        return { ok: true, refunded: quote.amount, inventory: await readInventory(db, userId),
          avatarSnapshot: { userId, avatar: null, revision, updatedAt: now, unlocksRequired: true } };
      }, { label: "avatar-refund" }));
    },
  };
}
