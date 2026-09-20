import { runSqliteImmediateTransaction } from "../sqliteQueue.js";
import { avatarUnlockKey, getAvatarUnlockRule, getLockedAvatarParts, isAvatarPartUnlocked } from "../../shared/avatarUnlocks.js";
import { createAvatarObjectivesRepository } from "./avatarObjectivesRepository.js";
import { applyWeeklyAuraAppearance } from "../../shared/avatarWeeklyAuras.js";

export function createAvatarInventoryRepository({ getDb, runWrite, loadCatalog, ensureDonorEntitlements = async () => {}, weeklyAuras = null }) {
  const objectives = createAvatarObjectivesRepository({ getDb, runWrite, loadCatalog });
  async function read(db, userId) {
    const [items, progress, epoch, wallet, temporary] = await Promise.all([
      db.all("SELECT item_key FROM avatar_unlocks WHERE user_id = ?", userId),
      db.all("SELECT objective, value FROM avatar_objective_progress WHERE user_id = ?", userId),
      db.get("SELECT started_at FROM avatar_objective_epochs WHERE objective = 'mini_tournament_wins'"),
      db.get("SELECT balance FROM gobblar_profiles WHERE installId = ?", String(userId)),
      weeklyAuras?.temporary(userId) || {},
    ]);
    const stats = Object.fromEntries(progress.map(row => [row.objective, row.value]));
    return { userId, owned: Object.fromEntries(items.map(item => [item.item_key, true])), temporary,
      balance: Number(wallet?.balance) || 0, miniTournamentWins: stats.mini_tournament_wins || 0,
      lepersCorrectAnswers: stats.lepers_correct_answers || 0, objectiveStartedAt: epoch.started_at };
  }
  return {
    weeklyAuras,
    objectives: weeklyAuras ? { ...objectives,
      async pending(userId) { return [...await objectives.pending(userId), ...await weeklyAuras.pending(userId)]; },
      async acknowledge(userId, keys) {
        const ok = await objectives.acknowledge(userId, keys);
        if (ok) await weeklyAuras.acknowledge(userId, keys);
        return ok;
      },
    } : objectives,
    ensureEntitlements: userId => ensureDonorEntitlements([userId]),
    async get(userId) { await ensureDonorEntitlements([userId]); return read(await getDb(), userId); },
    async canEquip(userId, avatar, inventory) {
      await ensureDonorEntitlements([userId]);
      return !getLockedAvatarParts(avatar, await loadCatalog(), inventory || await read(await getDb(), userId)).length;
    },
    async appearance(userId, avatar, inventory) {
      if (!avatar) return null;
      await ensureDonorEntitlements([userId]);
      const owned = inventory || await read(await getDb(), userId);
      const visible = applyWeeklyAuraAppearance(avatar, owned);
      return getLockedAvatarParts(visible, await loadCatalog(), owned).length ? null : visible;
    },
    async filterAppearances(avatars) {
      const ids = Object.keys(avatars).map(Number);
      if (!ids.length) return {};
      await ensureDonorEntitlements(ids);
      const db = await getDb(), placeholders = ids.map(() => "?").join(",");
      const [items, wins, catalog, weekly] = await Promise.all([
        db.all(`SELECT user_id, item_key FROM avatar_unlocks WHERE user_id IN (${placeholders})`, ...ids),
        db.all(`SELECT user_id, value AS count FROM avatar_objective_progress WHERE objective = 'mini_tournament_wins' AND user_id IN (${placeholders})`, ...ids),
        loadCatalog(),
        weeklyAuras?.ensure(),
      ]);
      const owners = new Map(ids.map(id => [id, { userId: id, owned: {}, miniTournamentWins: 0,
        temporary: weekly?.grants[id] ? { [`auras:${weekly.grants[id]}`]: weekly.expiresAt } : {} }]));
      items.forEach(item => { owners.get(item.user_id).owned[item.item_key] = true; });
      wins.forEach(row => { owners.get(row.user_id).miniTournamentWins = row.count; });
      return Object.fromEntries(ids.flatMap(id => {
        const visible = applyWeeklyAuraAppearance(avatars[id], owners.get(id));
        return getLockedAvatarParts(visible, catalog, owners.get(id)).length ? [] : [[id, visible]];
      }));
    },
    async purchase(userId, requestedItems, { assertWritable = () => {} } = {}) {
      assertWritable();
      await ensureDonorEntitlements([userId]);
      await weeklyAuras?.ensure(); // Never reconcile while holding the wallet write transaction.
      const catalog = await loadCatalog();
      if (!Array.isArray(requestedItems) || !requestedItems.length || requestedItems.length > 16) return { ok: false, error: "avatar_invalid" };
      const items = new Map();
      for (const item of requestedItems) {
        const { family, id } = item || {};
        if (typeof family !== "string" || typeof id !== "string" || (family !== "base" && !Object.hasOwn(catalog.families, family))) return { ok: false, error: "avatar_invalid" };
        const part = family === "base" ? (["homme", "femme"].includes(id) ? { id } : null)
          : catalog.families[family]?.find(part => part.id === id && (family !== "mouths" || id.endsWith("_neutral")));
        if (!part) return { ok: false, error: "avatar_invalid" };
        const rule = getAvatarUnlockRule(family, id, part);
        items.set(avatarUnlockKey(family, id), { family, id, part, rule });
      }
      const db = await getDb();
      return runWrite(() => runSqliteImmediateTransaction(db, async () => {
        const inventory = await read(db, userId);
        assertWritable();
        const missing = [...items.values()].filter(item => !isAvatarPartUnlocked(inventory, item.family, item.id, item.part));
        if (missing.some(item => item.rule.type !== "gobblars")) return { ok: false, error: "avatar_objective_locked", inventory };
        const spent = missing.reduce((sum, item) => sum + item.rule.price, 0);
        if (spent > inventory.balance) return { ok: false, error: "insufficient_funds", required: spent, inventory };
        if (spent) {
          const now = Date.now();
          const debit = await db.run("UPDATE gobblar_profiles SET balance = balance - ?, updatedAt = ? WHERE installId = ? AND balance >= ?", spent, now, String(userId), spent);
          if (debit.changes !== 1) throw new Error("avatar_wallet_unavailable");
          for (const item of missing) await db.run("INSERT INTO avatar_unlocks (user_id, item_key, unlocked_at) VALUES (?, ?, ?)", userId, avatarUnlockKey(item.family, item.id), now);
          await db.run("INSERT INTO gobblar_ledger (installId, ts, delta, reason, meta) VALUES (?, ?, ?, ?, ?)", String(userId), now, -spent, "avatar_unlock", JSON.stringify({ items: missing.map(item => avatarUnlockKey(item.family, item.id)) }));
        }
        return { ok: true, spent, inventory: await read(db, userId) };
      }, { label: "avatar-unlock" }));
    },
    async recordTournamentWin({ userId, tournamentKey, wonAt = Date.now() }) {
      const result = await objectives.recordBatch([{ userId, eventKey: tournamentKey, occurredAt: wonAt, objective: "mini_tournament_wins" }]);
      return result.recorded === 1;
    },
  };
}
