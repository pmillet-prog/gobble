import { getWeekStartTs, getNextResetTs } from "./parisWeek.js";

export function normalizeProgressBoardsRequest({ weekStartTs, nextResetTs, topN, historicalGobbles } = {}, now = Date.now()) {
  const start = Number.isFinite(weekStartTs) ? getWeekStartTs(weekStartTs) : getWeekStartTs(now);
  const end = Number.isFinite(nextResetTs) && nextResetTs > start
    ? nextResetTs : getNextResetTs(start);
  const limit = Math.min(200, Math.max(1, Math.round(Number(topN) || 50)));
  const historic = new Map();
  for (const row of Array.isArray(historicalGobbles) ? historicalGobbles : []) {
    if (Number.isSafeInteger(row?.userId) && row.userId > 0 && Number.isSafeInteger(row.gobbles) && row.gobbles > 0) {
      historic.set(row.userId, Math.max(row.gobbles, historic.get(row.userId) || 0));
    }
  }
  return { weekStartTs: start, nextResetTs: end, topN: limit,
    historicalGobbles: [...historic].map(([userId, gobbles]) => ({ userId, gobbles }))
      .sort((a, b) => b.gobbles - a.gobbles || a.userId - b.userId).slice(0, limit) };
}

// Called only on requested stats/recap reads, behind the worker's short cache.
// Existing objective events already provide authoritative, deduplicated QPUG
// history; there is no second counter or extra message for every correct answer.
export function createPlayerProgressBoardsRepository({ getDb }) {
  let ready;
  async function init() {
    if (!ready) ready = (async () => {
      const db = await getDb();
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_qpug_events_week
          ON avatar_objective_events (recorded_at, user_id) WHERE objective = 'lepers_correct_answers';
        CREATE INDEX IF NOT EXISTS idx_qpug_progress_ranking
          ON avatar_objective_progress (value DESC, user_id) WHERE objective = 'lepers_correct_answers';
        CREATE INDEX IF NOT EXISTS idx_target_quiz_points_ranking ON target_quiz_points (total DESC, user_id);
        CREATE INDEX IF NOT EXISTS idx_target_quiz_weekly_ranking ON target_quiz_weekly_stats (week_start, points DESC, user_id);
        CREATE INDEX IF NOT EXISTS idx_lifetime_gobbles_ranking ON player_lifetime_stats (gobbles DESC, installId);
        CREATE INDEX IF NOT EXISTS idx_lifetime_double_gobbles_ranking ON player_lifetime_stats (doubleGobbles DESC, installId);
      `);
      return db;
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  const identity = "u.id AS userId, 'install:' || u.id AS playerKey, u.username_display AS nick";
  async function read(rawRequest) {
    const request = normalizeProgressBoardsRequest(rawRequest);
    const db = await init();
    const { weekStartTs, nextResetTs, topN, historicalGobbles } = request;
    const [qpugAnswers, targetQuizPoints, allQpugAnswers, allTargetQuizPoints, gobbles, doubleGobbles, qpugEpoch, targetQuizEpoch, historicGobbles] = await Promise.all([
      db.all(`SELECT ${identity}, COUNT(*) AS correctCount
        FROM avatar_objective_events e JOIN users u ON u.id = e.user_id
        WHERE e.objective = 'lepers_correct_answers' AND e.recorded_at >= ? AND e.recorded_at < ?
        GROUP BY e.user_id ORDER BY correctCount DESC, u.id ASC LIMIT ?`, weekStartTs, nextResetTs, topN),
      db.all(`SELECT ${identity}, s.points FROM target_quiz_weekly_stats s JOIN users u ON u.id = s.user_id
        WHERE s.week_start = ? ORDER BY s.points DESC, s.user_id ASC LIMIT ?`, weekStartTs, topN),
      db.all(`SELECT ${identity}, p.value AS correctCount FROM avatar_objective_progress p JOIN users u ON u.id = p.user_id
        WHERE p.objective = 'lepers_correct_answers' AND p.value > 0 ORDER BY p.value DESC, p.user_id ASC LIMIT ?`, topN),
      db.all(`SELECT ${identity}, p.total AS points FROM target_quiz_points p JOIN users u ON u.id = p.user_id
        ORDER BY p.total DESC, p.user_id ASC LIMIT ?`, topN),
      db.all(`SELECT ${identity}, s.gobbles FROM player_lifetime_stats s JOIN users u ON s.installId = CAST(u.id AS TEXT)
        WHERE s.gobbles > 0 ORDER BY s.gobbles DESC, u.id ASC LIMIT ?`, topN),
      db.all(`SELECT ${identity}, s.doubleGobbles FROM player_lifetime_stats s JOIN users u ON s.installId = CAST(u.id AS TEXT)
        WHERE s.doubleGobbles > 0 ORDER BY s.doubleGobbles DESC, s.installId ASC LIMIT ?`, topN),
      db.get("SELECT started_at FROM avatar_objective_epochs WHERE objective = 'lepers_correct_answers'"),
      db.get("SELECT started_at FROM player_progress_tracking WHERE metric = 'targetQuizPoints'"),
      historicalGobbles.length ? db.all(`WITH historic(user_id, gobbles) AS (VALUES ${historicalGobbles.map(() => "(?, ?)").join(",")})
        SELECT ${identity}, MAX(COALESCE(s.gobbles, 0), h.gobbles) AS gobbles
        FROM historic h JOIN users u ON u.id = h.user_id
        LEFT JOIN player_lifetime_stats s ON s.installId = CAST(u.id AS TEXT)`,
      ...historicalGobbles.flatMap(row => [row.userId, row.gobbles])) : [],
    ]);
    const gobbleTotals = new Map();
    for (const row of [...gobbles, ...historicGobbles]) {
      if (!gobbleTotals.has(row.userId) || row.gobbles > gobbleTotals.get(row.userId).gobbles) gobbleTotals.set(row.userId, row);
    }
    const mergedGobbles = [...gobbleTotals.values()].sort((a, b) => b.gobbles - a.gobbles || a.userId - b.userId).slice(0, topN);
    return {
      boards: { qpugAnswers, targetQuizPoints },
      allTimeBoards: { qpugAnswers: allQpugAnswers, targetQuizPoints: allTargetQuizPoints, gobbles: mergedGobbles, doubleGobbles },
      trackingStartTs: { qpugAnswers: qpugEpoch?.started_at ?? null, targetQuizPoints: targetQuizEpoch?.started_at ?? null },
    };
  }
  return { init, read };
}
