import { runSqliteImmediateTransaction } from "../sqliteQueue.js";
import { recordAchievementProgress } from "./achievementProgress.js";
import { normalizeGotusProgress, GOTUS_GOBBLARS_REWARD } from "../../shared/gotusProgress.js";

// Only server-confirmed live wins enter this repository. The source event,
// counters, wallet receipt and trophy share one durable transaction.
export function createGotusStatsRepository({ getDb, now = Date.now }) {
  let ready;
  async function init() {
    if (!ready) ready = (async () => {
      const db = await getDb();
      await db.exec(`CREATE TABLE IF NOT EXISTS gotus_wins (
        user_id INTEGER NOT NULL, room_id TEXT NOT NULL, round_id TEXT NOT NULL,
        won_at INTEGER NOT NULL, attempts_used INTEGER NOT NULL, receipt TEXT,
        PRIMARY KEY(user_id, room_id, round_id)
      );
      CREATE INDEX IF NOT EXISTS idx_gotus_wins_week ON gotus_wins(won_at, user_id);
      CREATE TABLE IF NOT EXISTS gotus_totals (
        user_id INTEGER PRIMARY KEY, wins INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_gotus_totals_ranking ON gotus_totals(wins DESC, user_id);
      CREATE TABLE IF NOT EXISTS player_progress_tracking (
        metric TEXT PRIMARY KEY, started_at INTEGER NOT NULL
      );`);
      await db.run("INSERT OR IGNORE INTO player_progress_tracking(metric,started_at) VALUES('gotusWins',?)", now());
      return db;
    })().catch(error => { ready = null; throw error; });
    return ready;
  }

  async function profile(userId) {
    if (!Number.isSafeInteger(userId) || userId <= 0) return normalizeGotusProgress(0);
    const db = await init();
    const row = await db.get("SELECT wins FROM gotus_totals WHERE user_id=?", userId);
    return normalizeGotusProgress(row?.wins);
  }

  async function recordWin({ userId, roomId, roundId, wonAt = now(), attemptsUsed, training } = {}) {
    if (training !== false) return { ok: true, recorded: false, excluded: true, achievementAwards: [] };
    const room = String(roomId || "").trim();
    const round = String(roundId || "").trim();
    const eventKey = `gotus:${JSON.stringify([room, round])}`;
    if (!Number.isSafeInteger(userId) || userId <= 0 || !room || !round || eventKey.length > 240 ||
        !Number.isFinite(wonAt) || wonAt < 0 || !Number.isSafeInteger(attemptsUsed) || attemptsUsed <= 0) {
      throw new Error("invalid_gotus_win");
    }
    const db = await init();
    return runSqliteImmediateTransaction(db, async () => {
      if (!await db.get("SELECT id FROM users WHERE id=?", userId)) return { ok: false, error: "unknown_player" };
      const previous = await db.get("SELECT receipt FROM gotus_wins WHERE user_id=? AND room_id=? AND round_id=?", userId, room, round);
      if (previous) return { ...JSON.parse(previous.receipt), recorded: false, duplicate: true };
      const before = await profile(userId);
      await db.run("INSERT INTO gotus_wins(user_id,room_id,round_id,won_at,attempts_used) VALUES(?,?,?,?,?)",
        userId, room, round, wonAt, attemptsUsed);
      const next = await db.get(`INSERT INTO gotus_totals(user_id,wins,updated_at) VALUES(?,1,?)
        ON CONFLICT(user_id) DO UPDATE SET wins=wins+1,updated_at=MAX(updated_at,excluded.updated_at) RETURNING wins`, userId, wonAt);
      const after = normalizeGotusProgress(next.wins);
      let reward = null;
      if (after.cycles > before.cycles) {
        await db.run(`INSERT INTO gobblar_profiles(installId,balance,updatedAt) VALUES(?,?,?)
          ON CONFLICT(installId) DO UPDATE SET balance=balance+excluded.balance,updatedAt=MAX(updatedAt,excluded.updatedAt)`,
        String(userId), GOTUS_GOBBLARS_REWARD, wonAt);
        const { balance } = await db.get("SELECT balance FROM gobblar_profiles WHERE installId=?", String(userId));
        const entry = await db.run("INSERT INTO gobblar_ledger(installId,ts,delta,reason,meta) VALUES(?,?,?,?,?)",
          String(userId), wonAt, GOTUS_GOBBLARS_REWARD, "gotus_milestone",
          JSON.stringify({ roomId: room, roundId: round, cycle: after.cycles, target: after.target, totalWins: after.totalWins }));
        reward = { amount: GOTUS_GOBBLARS_REWARD, balance, receipt: `gotus:${entry.lastID}` };
      }
      const achievementAwards = await recordAchievementProgress(db, {
        userId, eventKey, changes: { gotus: 1 }, occurredAt: wonAt, roundId: `${room}#${round}`,
      });
      const result = { ok: true, recorded: true, duplicate: false, progression: { before, after, reward }, achievementAwards };
      await db.run("UPDATE gotus_wins SET receipt=? WHERE user_id=? AND room_id=? AND round_id=?",
        JSON.stringify(result), userId, room, round);
      return result;
    }, { label: "gotus-win" });
  }

  async function boards({ weekStartTs, nextResetTs, topN }) {
    const db = await init();
    const identity = "u.id AS userId, 'install:' || u.id AS playerKey, u.username_display AS nick";
    const [weekly, allTime, epoch] = await Promise.all([
      db.all(`SELECT ${identity},COUNT(*) AS wins FROM gotus_wins w JOIN users u ON u.id=w.user_id
        WHERE w.won_at>=? AND w.won_at<? GROUP BY w.user_id ORDER BY wins DESC,u.id ASC LIMIT ?`, weekStartTs, nextResetTs, topN),
      db.all(`SELECT ${identity},t.wins FROM gotus_totals t JOIN users u ON u.id=t.user_id
        WHERE t.wins>0 ORDER BY t.wins DESC,t.user_id ASC LIMIT ?`, topN),
      db.get("SELECT started_at FROM player_progress_tracking WHERE metric='gotusWins'"),
    ]);
    return { boards: { gotusWins: weekly }, allTimeBoards: { gotusWins: allTime }, trackingStartTs: { gotusWins: epoch?.started_at ?? null } };
  }

  return { init, recordWin, profile, boards };
}
