import { runSqliteImmediateTransaction } from "../sqliteQueue.js";
import { AVATAR_OBJECTIVES } from "../../shared/avatarObjectives.js";
import { avatarUnlockKey } from "../../shared/avatarUnlocks.js";
import { DONOR_AVATAR_REWARD } from "../../shared/supportDonors.js";

export function createAvatarObjectivesRepository({ getDb, runWrite, loadCatalog }) {
  async function describe(row) {
    const reward = row.objective === "donor" ? DONOR_AVATAR_REWARD : AVATAR_OBJECTIVES[row.objective];
    const part = (await loadCatalog()).families[reward.family]?.find(part => part.id === reward.id);
    return { key: row.item_key, objective: row.objective, family: reward.family, id: reward.id,
      label: reward.label, imageUrl: part ? `/avatars/v1/${part.layers?.thumbnail || part.file}` : "",
      target: reward.target, unit: reward.unit, unlockedAt: row.unlocked_at };
  }
  return {
    async recordBatch(events) {
      if (!Array.isArray(events) || events.length > 128) throw new Error("invalid_avatar_progress_batch");
      const valid = events.filter(event => Number.isSafeInteger(event?.userId) && event.userId > 0
        && Object.hasOwn(AVATAR_OBJECTIVES, event.objective) && typeof event.eventKey === "string"
        && event.eventKey.length > 0 && event.eventKey.length <= 180 && Number.isFinite(event.occurredAt));
      if (!valid.length) return { recorded: 0, rewards: [] };
      const db = await getDb();
      const result = await runWrite(() => runSqliteImmediateTransaction(db, async () => {
        let recorded = 0;
        const rewards = [];
        for (const event of valid) {
          const { userId, objective, eventKey, occurredAt } = event;
          const accepted = await db.run(`INSERT OR IGNORE INTO avatar_objective_events (user_id, objective, event_key, recorded_at)
            SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
            AND ? >= (SELECT started_at FROM avatar_objective_epochs WHERE objective = ?)`,
          userId, objective, eventKey, occurredAt, userId, occurredAt, objective);
          if (!accepted.changes) continue;
          recorded++;
          const progress = await db.get(`INSERT INTO avatar_objective_progress (user_id, objective, value) VALUES (?, ?, 1)
            ON CONFLICT(user_id, objective) DO UPDATE SET value = value + 1 RETURNING value`, userId, objective);
          const reward = AVATAR_OBJECTIVES[objective];
          if (progress.value < reward.target) continue;
          const key = avatarUnlockKey(reward.family, reward.id);
          const grant = await db.run("INSERT OR IGNORE INTO avatar_unlocks (user_id, item_key, unlocked_at) VALUES (?, ?, ?)", userId, key, occurredAt);
          if (!grant.changes) continue;
          await db.run("INSERT OR IGNORE INTO avatar_reward_notifications (user_id, item_key, objective, unlocked_at) VALUES (?, ?, ?, ?)", userId, key, objective, occurredAt);
          rewards.push({ userId, item_key: key, objective, unlocked_at: occurredAt });
        }
        return { recorded, rewards };
      }, { label: "avatar-objectives" }));
      return { recorded: result.recorded, rewards: await Promise.all(result.rewards.map(async row => ({ userId: row.userId, reward: await describe(row) }))) };
    },
    async pending(userId) {
      const rows = await (await getDb()).all("SELECT item_key, objective, unlocked_at FROM avatar_reward_notifications WHERE user_id = ? AND acknowledged_at IS NULL ORDER BY unlocked_at LIMIT 32", userId);
      return Promise.all(rows.filter(row => row.objective === "donor" || Object.hasOwn(AVATAR_OBJECTIVES, row.objective)).map(describe));
    },
    async acknowledge(userId, keys) {
      if (!Array.isArray(keys) || !keys.length || keys.length > 32 || keys.some(key => typeof key !== "string" || key.length > 100)) return false;
      const db = await getDb();
      await runWrite(() => db.run(`UPDATE avatar_reward_notifications SET acknowledged_at = ? WHERE user_id = ? AND item_key IN (${keys.map(() => "?").join(",")}) AND acknowledged_at IS NULL`, Date.now(), userId, ...keys));
      return true;
    },
  };
}
