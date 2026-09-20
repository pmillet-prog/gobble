import { SUPPORT_DONORS, DONOR_AVATAR_REWARD, normalizeDonorAccountName } from "../../shared/supportDonors.js";
import { runSqliteImmediateTransaction } from "../sqliteQueue.js";

export function createDonorAvatarRepository({ getDb, runWrite, donors = SUPPORT_DONORS }) {
  const checked = new Set();
  const byName = new Map(donors.map(donor => [normalizeDonorAccountName(donor.accountName || donor.name), donor]));
  let inFlight = Promise.resolve();
  async function reconcile(userIds) {
    const ids = [...new Set(userIds.map(Number))].filter(id => Number.isSafeInteger(id) && id > 0 && !checked.has(id));
    if (!ids.length) return;
    const db = await getDb();
    const accounts = await db.all(`SELECT id, username_normalized FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids);
    const candidates = accounts.map(account => ({ account, donor: byName.get(account.username_normalized) })).filter(row => row.donor);
    if (candidates.length) await runWrite(() => runSqliteImmediateTransaction(db, async () => {
      for (const { account, donor } of candidates) {
        const now = Date.now();
        await db.run("INSERT OR IGNORE INTO support_donor_accounts (donor_id, user_id, linked_at) VALUES (?, ?, ?)", donor.id, account.id, now);
        const owner = await db.get("SELECT user_id FROM support_donor_accounts WHERE donor_id = ?", donor.id);
        if (owner?.user_id !== account.id) continue;
        const granted = await db.run("INSERT OR IGNORE INTO avatar_unlocks (user_id, item_key, unlocked_at) VALUES (?, ?, ?)", account.id, DONOR_AVATAR_REWARD.key, now);
        if (granted.changes) await db.run("INSERT OR IGNORE INTO avatar_reward_notifications (user_id, item_key, objective, unlocked_at) VALUES (?, ?, ?, ?)", account.id, DONOR_AVATAR_REWARD.key, "donor", now);
      }
    }, { label: "donor-avatar" }));
    // Cache only existing accounts. A donor account created later is still found.
    if (checked.size + accounts.length > 4096) checked.clear();
    accounts.forEach(account => checked.add(account.id));
  }
  return {
    ensure(userIds) {
      const task = inFlight.then(() => reconcile(userIds));
      inFlight = task.catch(() => {});
      return task;
    },
  };
}
