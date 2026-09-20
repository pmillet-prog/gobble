import { runSqliteImmediateTransaction } from "../sqliteQueue.js";
import { WEEKLY_AVATAR_AURAS, getWeeklyAvatarAura } from "../../shared/avatarWeeklyAuras.js";

// One reconciliation per week, shared by every inventory/profile request.
// Identity comes from the ranked account ID, never from a nickname.
export function createWeeklyAvatarAuras({ getDb, runWrite, loadCatalog, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let source, onChange = () => {}, current = null, inFlight = null, timer = null, running = false;
  async function reconcile(period) {
    const db = await getDb();
    const candidates = new Map();
    for (const entry of period.podium || []) {
      const raw = entry.userId ?? entry.installId ?? String(entry.playerKey || "").replace(/^install:/, "");
      const userId = Number(raw), aura = WEEKLY_AVATAR_AURAS.find(aura => aura.rank === entry.rank);
      if (Number.isSafeInteger(userId) && userId > 0 && aura && !candidates.has(userId)) candidates.set(userId, aura.id);
    }
    const grants = await runWrite(() => runSqliteImmediateTransaction(db, async () => {
      const ids = [...candidates.keys()];
      const accounts = ids.length ? await db.all(`SELECT id FROM users WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids) : [];
      const previous = new Map((await db.all("SELECT * FROM avatar_weekly_auras")).map(row => [row.user_id, row]));
      await db.run("DELETE FROM avatar_weekly_auras");
      for (const { id } of accounts) {
        const aura = candidates.get(id), old = previous.get(id);
        const renewed = old?.aura_id === aura && old.expires_at >= period.weekStartTs;
        await db.run(`INSERT INTO avatar_weekly_auras
          (user_id, aura_id, week_start, expires_at, notification_key, unlocked_at, acknowledged_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id, aura, period.weekStartTs, period.nextResetTs,
        renewed ? old.notification_key : `auras:${aura}@${period.weekStartTs}`,
        renewed ? old.unlocked_at : period.weekStartTs, renewed ? old.acknowledged_at : null);
      }
      return Object.fromEntries(accounts.map(({ id }) => [id, candidates.get(id)]));
    }, { label: "weekly-avatar-auras" }));
    current = { weekStartTs: period.weekStartTs, expiresAt: period.nextResetTs, grants };
    onChange(current);
    return current;
  }
  async function ensure() {
    if (!source) return null;
    if (current?.expiresAt > now()) return current;
    if (inFlight) return inFlight;
    const period = source();
    if (!Number.isFinite(period?.weekStartTs) || !(period?.nextResetTs > now())) throw new Error("weekly_avatar_period_unavailable");
    inFlight = reconcile(period);
    try { return await inFlight; } finally { inFlight = null; }
  }
  async function tick() {
    try { await ensure(); }
    catch (error) { console.warn("[avatar] weekly awards unavailable", error?.message); }
    if (running) {
      const delay = current?.expiresAt > now() ? current.expiresAt - now() + 25 : 60000;
      timer = setTimer(tick, delay);
      timer?.unref?.();
    }
  }
  return {
    ensure,
    start({ getPeriod, onUpdate = () => {} }) {
      source = getPeriod; onChange = onUpdate; running = true;
      void tick();
      return () => { running = false; clearTimer(timer); };
    },
    async temporary(userId) {
      const snapshot = await ensure(), id = snapshot?.grants[userId];
      return id && snapshot.expiresAt > now() ? { [`auras:${id}`]: snapshot.expiresAt } : {};
    },
    async pending(userId) {
      await ensure();
      const row = await (await getDb()).get("SELECT * FROM avatar_weekly_auras WHERE user_id = ? AND expires_at > ? AND acknowledged_at IS NULL", userId, now());
      if (!row) return [];
      const aura = getWeeklyAvatarAura(row.aura_id);
      const part = (await loadCatalog()).families.auras.find(part => part.id === aura.id);
      return [{ ...aura, key: row.notification_key, itemKey: `auras:${aura.id}`, family: "auras", objective: "weekly_race",
        imageUrl: `/avatars/v1/${part.layers?.thumbnail || part.file}`, unlockedAt: row.unlocked_at, expiresAt: row.expires_at }];
    },
    async acknowledge(userId, keys) {
      if (!keys.length) return;
      await runWrite(async () => (await getDb()).run(`UPDATE avatar_weekly_auras SET acknowledged_at = ?
        WHERE user_id = ? AND notification_key IN (${keys.map(() => "?").join(",")}) AND acknowledged_at IS NULL`, now(), userId, ...keys));
    },
  };
}
