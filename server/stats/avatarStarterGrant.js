import { runSqliteImmediateTransaction } from "../sqliteQueue.js";

export const STARTER_GRANT_AMOUNT = 3000;
export const STARTER_GRANT_KEY = "avatar-starter-2026-09";
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

// Existing profiles display the historical weekly round count. Lifetime counters
// can cover a longer period, so keep the larger count, without adding overlap.
export function countStarterGrantRounds(weekly, user, legacyIds = [], lifetime = new Map()) {
  const ids = [...new Set([String(user.id), user.primary_install_id, ...legacyIds].filter(Boolean))];
  const weeks = new Map();
  for (const [key, week] of Object.entries(weekly?.history || {})) weeks.set(String(week.weekStartTs ?? key), week);
  if (weekly?.totalScore) weeks.set(String(weekly.weekStartTs ?? "current"), weekly);
  let rounds = 0;
  const count = raw => {
    const value = Number(raw ?? 0);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("starter_grant_invalid_round_count");
    return value;
  };
  for (const week of weeks.values()) {
    const canonical = week.totalScore?.[`install:${user.id}`];
    rounds += canonical ? count(canonical.roundsPlayed)
      : ids.slice(1).reduce((sum, id) => sum + count(week.totalScore?.[`install:${id}`]?.roundsPlayed), 0);
  }
  return Math.max(rounds, ...ids.map(id => count(lifetime.get(id))));
}

// Called inside the caller's transaction for both the rollout and registrations.
export async function recordStarterGrant(db, userId, { now = Date.now(), eligibility = "new_account", rounds = 0, lastActive = now } = {}) {
  const inserted = await db.run(`INSERT OR IGNORE INTO gobblar_starter_grants
    (user_id, amount, granted_at, eligibility, rounds_played, last_active_at) VALUES (?, ?, ?, ?, ?, ?)`,
  userId, STARTER_GRANT_AMOUNT, now, eligibility, rounds, lastActive);
  if (!inserted.changes) return false;
  await db.run(`INSERT INTO gobblar_profiles (installId, balance, updatedAt) VALUES (?, ?, ?)
    ON CONFLICT(installId) DO UPDATE SET balance = gobblar_profiles.balance + excluded.balance, updatedAt = excluded.updatedAt`,
  String(userId), STARTER_GRANT_AMOUNT, now);
  await db.run("INSERT INTO gobblar_ledger (installId, ts, delta, reason, meta) VALUES (?, ?, ?, ?, ?)",
    String(userId), now, STARTER_GRANT_AMOUNT, "avatar_starter", JSON.stringify({ campaign: STARTER_GRANT_KEY, eligibility, roundsPlayed: rounds }));
  return true;
}

export function createAvatarStarterGrant({ getDb, runWrite, loadWeeklyStats, now = Date.now }) {
  let initialized = false, inFlight = null;
  async function initialize() {
    if (initialized) return;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const db = await getDb();
      if (await db.get("SELECT 1 FROM gobblar_starter_campaigns WHERE campaign_key = ?", STARTER_GRANT_KEY)) { initialized = true; return; }
      const weekly = await loadWeeklyStats();
      if (!weekly || typeof weekly !== "object" || Array.isArray(weekly)) throw new Error("starter_grant_stats_unavailable");
      await runWrite(() => runSqliteImmediateTransaction(db, async () => {
        if (await db.get("SELECT 1 FROM gobblar_starter_campaigns WHERE campaign_key = ?", STARTER_GRANT_KEY)) return;
        const timestamp = now(), cutoff = timestamp - RECENT_MS;
        const users = await db.all(`SELECT u.id, u.primary_install_id,
          MAX(COALESCE(u.last_login_at, 0), COALESCE(s.last_seen, 0), COALESCE(d.last_seen, 0)) AS last_active
          FROM users u
          LEFT JOIN (SELECT user_id, MAX(last_seen_at) AS last_seen FROM user_sessions GROUP BY user_id) s ON s.user_id = u.id
          LEFT JOIN (SELECT user_id, MAX(last_seen_at) AS last_seen FROM user_devices GROUP BY user_id) d ON d.user_id = u.id`);
        const legacy = await db.all("SELECT claimed_user_id AS userId, install_id AS installId FROM legacy_username_reservations WHERE claimed_user_id IS NOT NULL");
        const aliases = new Map();
        for (const row of legacy) { if (!aliases.has(row.userId)) aliases.set(row.userId, []); aliases.get(row.userId).push(row.installId); }
        const hasLifetime = await db.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'player_lifetime_stats'");
        const lifetime = new Map((hasLifetime ? await db.all("SELECT installId, roundsPlayed FROM player_lifetime_stats") : []).map(row => [row.installId, row.roundsPlayed]));
        for (const user of users) {
          if (user.last_active < cutoff || user.last_active > timestamp) continue;
          const rounds = countStarterGrantRounds(weekly, user, aliases.get(user.id), lifetime);
          if (rounds < 2000) await recordStarterGrant(db, user.id, { now: timestamp, eligibility: "recent_under_2000", rounds, lastActive: user.last_active });
        }
        await db.run("INSERT INTO gobblar_starter_campaigns (campaign_key, started_at) VALUES (?, ?)", STARTER_GRANT_KEY, timestamp);
      }, { label: "avatar-starter-grant" }));
      initialized = true;
    })();
    try { await inFlight; } finally { inFlight = null; }
  }
  return {
    initialize,
    async pending(userId) {
      await initialize();
      const row = await (await getDb()).get("SELECT amount, granted_at, eligibility FROM gobblar_starter_grants WHERE user_id = ? AND acknowledged_at IS NULL", userId);
      return row ? { key: STARTER_GRANT_KEY, amount: row.amount, grantedAt: row.granted_at,
        label: row.eligibility === "new_account" ? "Bienvenue ! 3 000 gobblars offerts pour créer ton avatar." : "3 000 gobblars offerts pour créer ton avatar !" } : null;
    },
    async acknowledge(userId, key) {
      if (key !== STARTER_GRANT_KEY) return false;
      const db = await getDb();
      await runWrite(() => db.run("UPDATE gobblar_starter_grants SET acknowledged_at = COALESCE(acknowledged_at, ?) WHERE user_id = ?", now(), userId));
      return true;
    },
  };
}
