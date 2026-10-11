import { TROPHY_REWARDS, TROPHY_BY_ID } from "../../shared/trophyCatalog.js";
import { runSqliteImmediateTransaction } from "../sqliteQueue.js";
import { initAchievementSchema, getAchievementActivation, grantAchievement, recordAchievementProgress, publicAchievementAward } from "./achievementProgress.js";

const integer = value => Math.max(0, Math.trunc(Number(value) || 0));
const validUser = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

// Callers serialize writes on their worker queue. Each award and its notification
// share a commit; a retry, reconnect or second device cannot award it twice.
export function createAchievementCollectionRepository({ getDb, catalog = TROPHY_REWARDS, now = Date.now }) {
  let initialized = false;
  async function init() {
    const db = await getDb();
    if (!initialized) {
      await initAchievementSchema(db);
      initialized = true;
    }
    return db;
  }
  async function record({ userId: rawUser, events = [], progress = null, roundId = null, earnedAt = now(), sourceStartedAt = earnedAt } = {}) {
    if (!validUser(rawUser) || !Array.isArray(events) || events.length > 256) return [];
    const userId = Number(rawUser), db = await init();
    return runSqliteImmediateTransaction(db, async () => {
      const activation = await getAchievementActivation(db);
      if (activation === null || !Number.isFinite(earnedAt) || earnedAt < activation
        || !Number.isFinite(sourceStartedAt) || sourceStartedAt < activation || !await db.get("SELECT id FROM users WHERE id=?", userId)) return [];
      const awards = [];
      for (const event of events) {
        const definition = Object.hasOwn(TROPHY_BY_ID, event?.id) ? TROPHY_BY_ID[event.id] : null;
        if (!definition || definition.acquisition === "cumulative" || typeof event.eventKey !== "string"
          || !event.eventKey || event.eventKey.length > 240) continue;
        if (definition.repeat === "weekly" && earnedAt <= activation) continue;
        const granted = await grantAchievement(db, { userId, id: event.id, eventKey: event.eventKey, roundId, earnedAt });
        if (granted) awards.push(granted);
      }
      if (progress) awards.push(...await recordAchievementProgress(db, { userId, eventKey: progress.eventKey,
        changes: progress.changes, occurredAt: earnedAt, sourceStartedAt: progress.startedAt ?? earnedAt, roundId }));
      return awards;
    }, { label: "achievement-collection" });
  }
  async function snapshot(userId) {
    const db = await init();
    const rows = validUser(userId) ? await db.all("SELECT trophy_id,count FROM achievement_collection_v2 WHERE user_id=?", Number(userId)) : [];
    const counts = Object.fromEntries(catalog.map(item => [item.id,
      Math.min(item.unique ? 1 : Infinity, integer(rows.find(row => row.trophy_id === item.id)?.count))]));
    const configured = catalog.every(item => Number.isFinite(item.points) && item.points >= 0);
    return { counts, totalCount: Object.values(counts).reduce((sum, count) => sum + count, 0),
      points: configured ? catalog.reduce((sum, item) => sum + counts[item.id] * item.points, 0) : null };
  }
  async function bootstrap() {
    const db = await init();
    await db.run("INSERT OR IGNORE INTO achievement_activation_v2(id,started_at) VALUES(1,?)", now());
    return getAchievementActivation(db);
  }
  async function pending(userId) {
    const db = await init();
    return (await db.all("SELECT * FROM achievement_events_v2 WHERE user_id=? AND acknowledged_at IS NULL ORDER BY id LIMIT 64", Number(userId))).map(publicAchievementAward);
  }
  async function acknowledge(userId, eventIds) {
    if (!Array.isArray(eventIds) || eventIds.length > 64) return false;
    const ids = eventIds.map(value => /^achievement-v2:(\d+)$/.exec(String(value))?.[1]).filter(Boolean);
    if (!ids.length) return true;
    const db = await init();
    await db.run(`UPDATE achievement_events_v2 SET acknowledged_at=? WHERE user_id=? AND id IN (${ids.map(() => "?").join(",")}) AND acknowledged_at IS NULL`, now(), Number(userId), ...ids);
    return true;
  }
  async function roundAwards(roundId) {
    const db = await init();
    return (await db.all("SELECT * FROM achievement_events_v2 WHERE round_id=? ORDER BY id", String(roundId))).map(publicAchievementAward);
  }
  async function leaderboard(topN = 50) {
    if (!catalog.every(item => Number.isFinite(item.points) && item.points >= 0)) return null;
    const db = await init();
    const values = catalog.map(item => [item.id, item.points, item.unique ? 1 : 0]);
    return db.all(`WITH scores(trophy_id,points,unique_reward) AS (VALUES ${values.map(() => "(?,?,?)").join(",")})
      SELECT u.id AS userId,'install:'||u.id AS playerKey,u.username_display AS nick,
        SUM((CASE WHEN s.unique_reward THEN MIN(c.count,1) ELSE c.count END)*s.points) AS points,
        SUM(CASE WHEN s.unique_reward THEN MIN(c.count,1) ELSE c.count END) AS totalCount
      FROM achievement_collection_v2 c JOIN users u ON u.id=c.user_id JOIN scores s ON s.trophy_id=c.trophy_id
      GROUP BY u.id ORDER BY points DESC,totalCount DESC,u.id LIMIT ?`, ...values.flat(), Math.min(200, Math.max(1, integer(topN))));
  }
  return { init, bootstrap, record, snapshot, pending, acknowledge, roundAwards, leaderboard };
}
