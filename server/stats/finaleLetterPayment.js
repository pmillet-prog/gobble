export const FINALE_PAYMENT_SCHEMA = `CREATE TABLE IF NOT EXISTS gobblar_finale_purchases (
  installId TEXT NOT NULL, purchaseKey TEXT NOT NULL, cost INTEGER NOT NULL,
  state TEXT NOT NULL, updatedAt INTEGER NOT NULL, PRIMARY KEY (installId, purchaseKey)
);`;

// Called inside the wallet's serialized SQLite IMMEDIATE transaction. The receipt
// survives a lost worker reply, and cancellation also blocks an out-of-order debit.
export async function applyFinaleLetterPayment({ db, readProfile, updateProfile, ledger, now = Date.now },
  { installId, purchaseKey, cost, deadlineAt, cancel = false, meta = null } = {}) {
  if (!installId || typeof purchaseKey !== 'string' || !purchaseKey || purchaseKey.length > 300
    || !Number.isSafeInteger(cost) || cost < 5 || !Number.isFinite(deadlineAt)) return { ok: false, error: 'invalid_payment' };
  const existing = await db.get('SELECT cost, state FROM gobblar_finale_purchases WHERE installId = ? AND purchaseKey = ?', installId, purchaseKey);
  if (existing && existing.cost !== cost) return { ok: false, error: 'price_changed' };
  const profile = await readProfile(installId);
  if (!profile) return { ok: false, error: 'unavailable' };
  const ts = now();
  if (cancel) {
    let balance = profile.balance;
    if (existing?.state === 'paid') {
      balance += cost;
      await updateProfile(installId, { ...profile, balance, now: ts });
      await ledger(installId, cost, 'infortune_letter_refund', meta, ts);
    }
    await db.run(`INSERT INTO gobblar_finale_purchases VALUES (?, ?, ?, 'cancelled', ?)
      ON CONFLICT(installId, purchaseKey) DO UPDATE SET state = 'cancelled', updatedAt = excluded.updatedAt`, installId, purchaseKey, cost, ts);
    return { ok: true, balance, cancelled: true };
  }
  if (existing?.state === 'cancelled') return { ok: false, error: 'expired', balance: profile.balance };
  if (existing?.state === 'paid') return { ok: true, cost, balance: profile.balance, duplicate: true };
  if (ts >= deadlineAt) return { ok: false, error: 'expired', balance: profile.balance };
  if (profile.balance < cost) return { ok: false, error: 'insufficient_funds', balance: profile.balance };
  const balance = profile.balance - cost;
  await updateProfile(installId, { ...profile, balance, now: ts });
  await ledger(installId, -cost, 'infortune_letter', meta, ts);
  await db.run("INSERT INTO gobblar_finale_purchases VALUES (?, ?, ?, 'paid', ?)", installId, purchaseKey, cost, ts);
  return { ok: true, cost, balance };
}
