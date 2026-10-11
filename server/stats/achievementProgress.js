import { TROPHY_BY_ID, getTrophyRewards } from "../../shared/trophyCatalog.js";

export const ACHIEVEMENT_METRICS = Object.freeze({
  mini_gold_5000: "gold", gobbles_10000: "singleGobbles", julien_1000: "julien", foukro_500000: "foukro",
  marathon_10000: "rounds", total_score_10000000: "score", double_gobbles_1000: "doubleGobbles",
  targets_1000: "targets", medals_5000: "medals", words_100000: "words",
});
const allowedMetrics = new Set(Object.values(ACHIEVEMENT_METRICS));
export const publicAchievementRoundId = value => value ? String(value).slice(String(value).indexOf("#") + 1) : null;
export const publicAchievementAward = row => ({ id: row.trophy_id, eventId: `achievement-v2:${row.id}`, userId: row.user_id,
  count: row.total_count, delta: row.delta, roundId: publicAchievementRoundId(row.round_id), earnedAt: row.earned_at });

export async function initAchievementSchema(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS achievement_activation_v2 (id INTEGER PRIMARY KEY CHECK(id=1), started_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS achievement_collection_v2 (
      user_id INTEGER NOT NULL,trophy_id TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,trophy_id));
    CREATE TABLE IF NOT EXISTS achievement_events_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,trophy_id TEXT NOT NULL,event_key TEXT NOT NULL,
      delta INTEGER NOT NULL,total_count INTEGER NOT NULL,round_id TEXT,earned_at INTEGER NOT NULL,acknowledged_at INTEGER,
      UNIQUE(user_id,trophy_id,event_key));
    CREATE INDEX IF NOT EXISTS idx_achievement_v2_pending ON achievement_events_v2(user_id,acknowledged_at,id);
    CREATE INDEX IF NOT EXISTS idx_achievement_v2_round ON achievement_events_v2(round_id,user_id);
    CREATE TABLE IF NOT EXISTS achievement_progress_v2 (
      user_id INTEGER NOT NULL,metric TEXT NOT NULL,value INTEGER NOT NULL DEFAULT 0,peak INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id,metric));
    CREATE TABLE IF NOT EXISTS achievement_progress_events_v2 (
      user_id INTEGER NOT NULL,event_key TEXT NOT NULL,occurred_at INTEGER NOT NULL,PRIMARY KEY(user_id,event_key));`);
}
export async function getAchievementActivation(db) {
  if (!await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='achievement_activation_v2'")) return null;
  return (await db.get("SELECT started_at FROM achievement_activation_v2 WHERE id=1"))?.started_at ?? null;
}
// Source transaction owns counter, trophy and notification together.
export async function grantAchievement(db, { userId, id, eventKey, delta = 1, roundId, earnedAt }) {
  const definition = Object.hasOwn(TROPHY_BY_ID, id) ? TROPHY_BY_ID[id] : null;
  if (!definition || !Number.isSafeInteger(delta) || delta <= 0) return null;
  if (await db.get("SELECT id FROM achievement_events_v2 WHERE user_id=? AND trophy_id=? AND event_key=?", userId, id, eventKey)) return null;
  if (definition.unique) {
    const previous = await db.get("SELECT count FROM achievement_collection_v2 WHERE user_id=? AND trophy_id=?", userId, id);
    if (previous?.count >= 1) return null;
    delta = 1;
  }
  const next = await db.get(`INSERT INTO achievement_collection_v2(user_id,trophy_id,count) VALUES(?,?,?)
    ON CONFLICT(user_id,trophy_id) DO UPDATE SET count=count+excluded.count RETURNING count`, userId, id, delta);
  const inserted = await db.run(`INSERT INTO achievement_events_v2
    (user_id,trophy_id,event_key,delta,total_count,round_id,earned_at) VALUES(?,?,?,?,?,?,?)`,
  userId, id, eventKey, delta, next.count, roundId || null, earnedAt);
  return publicAchievementAward({ id: inserted.lastID,user_id: userId,trophy_id: id,total_count: next.count,
    delta,round_id: roundId,earned_at: earnedAt });
}
export async function recordAchievementProgress(db, { userId, eventKey, changes = {}, occurredAt = Date.now(), sourceStartedAt = occurredAt, roundId = null }) {
  const activation = await getAchievementActivation(db);
  if (activation === null || !Number.isSafeInteger(userId) || userId <= 0 || !eventKey || eventKey.length > 240
    || !Number.isFinite(occurredAt) || occurredAt < activation || !Number.isFinite(sourceStartedAt) || sourceStartedAt < activation) return [];
  if (!await db.get("SELECT id FROM users WHERE id=?", userId)) return [];
  const entries = Object.entries(changes).filter(([metric, value]) => allowedMetrics.has(metric)
    && Number.isSafeInteger(value) && value !== 0 && (metric === "foukro" || value > 0));
  if (!entries.length) return [];
  const accepted = await db.run("INSERT OR IGNORE INTO achievement_progress_events_v2(user_id,event_key,occurred_at) VALUES(?,?,?)", userId, eventKey, occurredAt);
  if (!accepted.changes) return [];
  const values = new Map();
  for (const [metric, delta] of entries) {
    const next = await db.get(`INSERT INTO achievement_progress_v2(user_id,metric,value,peak) VALUES(?,?,?,?)
      ON CONFLICT(user_id,metric) DO UPDATE SET value=value+excluded.value,peak=MAX(peak,value+excluded.value) RETURNING peak`,
    userId, metric, delta, Math.max(0, delta));
    values.set(metric, next.peak);
  }
  const awards = [];
  for (const [id, metric] of Object.entries(ACHIEVEMENT_METRICS)) {
    if (!values.has(metric)) continue;
    for (const definition of getTrophyRewards(id)) {
      const count = definition.unique ? (values.get(metric) >= definition.threshold ? 1 : 0)
        : Math.floor(values.get(metric) / definition.threshold);
      const previous = (await db.get("SELECT count FROM achievement_collection_v2 WHERE user_id=? AND trophy_id=?", userId, definition.id))?.count || 0;
      if (count <= previous) continue;
      const award = await grantAchievement(db, { userId,id: definition.id,eventKey: `milestone:${count}`,delta: count - previous,roundId,earnedAt: occurredAt });
      if (award) awards.push(award);
    }
  }
  return awards;
}
