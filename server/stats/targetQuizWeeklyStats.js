import { getWeekStartTs } from "./parisWeek.js";

// This small aggregate is written in the same transaction as final quiz points.
// Provisional answers and cancelled sessions never reach the weekly ranking.
export async function initTargetQuizWeeklyStats(db, now = Date.now()) {
  await db.exec(`CREATE TABLE IF NOT EXISTS target_quiz_weekly_stats (
    week_start INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (week_start, user_id)
  );
  CREATE TABLE IF NOT EXISTS player_progress_tracking (
    metric TEXT PRIMARY KEY, started_at INTEGER NOT NULL
  );`);
  await db.run("INSERT OR IGNORE INTO player_progress_tracking (metric, started_at) VALUES ('targetQuizPoints', ?)", now);
}

// The caller owns the SQLite transaction and its idempotent settlement guard.
export async function recordTargetQuizWeeklyPoints(db, { userId, points, occurredAt }) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(points) || !Number.isFinite(occurredAt)) {
    throw new Error("invalid_target_quiz_weekly_points");
  }
  await db.run(`INSERT INTO target_quiz_weekly_stats (week_start, user_id, points)
    SELECT ?, ?, ? WHERE ? >= (SELECT started_at FROM player_progress_tracking WHERE metric = 'targetQuizPoints')
    ON CONFLICT(week_start, user_id) DO UPDATE SET points = points + excluded.points`,
  getWeekStartTs(occurredAt), userId, points, occurredAt);
}
