import { advanceTargetQuizPoints, normalizeTargetQuizPoints, TARGET_QUIZ_POINTS_GOAL, TARGET_QUIZ_GOBBLARS_REWARD } from "../../shared/targetQuizPoints.js";
import { runSqliteImmediateTransaction } from "../sqliteQueue.js";

// Called inside the worker's serialized write queue, on the cursor connection.
// Answers stay provisional until the round ends: a knockout can cancel the
// whole session without reclaiming gobblars that a player could already spend.
export function createTargetQuizPointsRepository({ getDb, cursors, now = Date.now }) {
  let ready;
  async function init() {
    if (!ready) ready = (async () => {
      const db = await getDb();
      await cursors.init();
      await db.exec(`CREATE TABLE IF NOT EXISTS target_quiz_points (
        user_id INTEGER PRIMARY KEY,
        total INTEGER NOT NULL DEFAULT 0,
        points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0 AND points < 10000),
        cycles INTEGER NOT NULL DEFAULT 0,
        last_token TEXT,
        last_result TEXT,
        updated_at INTEGER NOT NULL
      )`);
      await db.exec(`CREATE TABLE IF NOT EXISTS target_quiz_pending (
        user_id INTEGER PRIMARY KEY, round_id TEXT NOT NULL, ends_at INTEGER NOT NULL,
        status TEXT NOT NULL, progression TEXT NOT NULL, last_token TEXT, last_result TEXT
      )`);
      return db;
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  function userId(playerKey) {
    const match = /^user:([1-9]\d*)$/.exec(playerKey || "");
    return match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : null;
  }
  async function load(playerKey) {
    const id = userId(playerKey);
    if (!id) return null; // No rewards in the developer simulation or guest cursor.
    const db = await init();
    const pending = await db.get("SELECT * FROM target_quiz_pending WHERE user_id = ?", id);
    // Recover an orphaned session after a process interruption. Normal endings
    // are settled by the game service, including requests queued at the buzzer.
    if (pending?.status === "pending" && pending.ends_at + 60_000 <= now()) {
      await finish({ playerKey, roundId: pending.round_id });
    }
    return normalizeTargetQuizPoints(await db.get("SELECT total, points, cycles FROM target_quiz_points WHERE user_id = ?", id));
  }
  async function answer({ playerKey, progress, questionToken, delta, roundId, endsAt }) {
    const id = userId(playerKey);
    if (!id) { await cursors.save(playerKey, progress); return null; }
    if (typeof questionToken !== "string" || !questionToken || questionToken.length > 128 ||
        ![-75, 100, 125, 150, 175, 200].includes(delta) || !roundId || !Number.isFinite(endsAt)) throw new Error("invalid_target_quiz_award");
    const db = await init();
    return runSqliteImmediateTransaction(db, async () => {
      const pending = await db.get("SELECT * FROM target_quiz_pending WHERE user_id = ?", id);
      if (pending?.round_id === String(roundId) && pending.status !== "pending") throw new Error("target_quiz_round_finished");
      if (pending?.round_id === String(roundId) && pending.last_token === questionToken) return JSON.parse(pending.last_result);
      if (pending?.round_id !== String(roundId) && pending?.status === "pending") throw new Error("target_quiz_session_unsettled");
      const saved = normalizeTargetQuizPoints(await db.get("SELECT * FROM target_quiz_points WHERE user_id = ?", id));
      const session = pending?.round_id === String(roundId) ? JSON.parse(pending.progression)
        : { before: saved, after: saved, steps: [], rewards: [] };
      const result = advanceTargetQuizPoints(session.after, delta);
      const progression = { ...session, after: result.after, steps: [...session.steps, delta] };
      const receipt = { before: result.before, after: result.after, reward: null };
      await cursors.save(playerKey, progress);
      await db.run(`INSERT INTO target_quiz_pending (user_id, round_id, ends_at, status, progression, last_token, last_result)
        VALUES (?, ?, ?, 'pending', ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
        round_id = excluded.round_id, ends_at = excluded.ends_at, status = excluded.status,
        progression = excluded.progression, last_token = excluded.last_token, last_result = excluded.last_result`,
      id, String(roundId), endsAt, JSON.stringify(progression), questionToken, JSON.stringify(receipt));
      return receipt;
    }, { label: "target-quiz-answer" });
  }
  async function finish({ playerKey, roundId, cancelled = false }) {
    const id = userId(playerKey);
    if (!id) return null;
    const db = await init();
    return runSqliteImmediateTransaction(db, async () => {
      const row = await db.get("SELECT * FROM target_quiz_pending WHERE user_id = ?", id);
      if (!row || row.round_id !== String(roundId)) return null;
      const progression = JSON.parse(row.progression);
      if (row.status !== "pending") {
        if (cancelled && row.status !== "cancelled") throw new Error("target_quiz_round_finished");
        return progression;
      }
      const at = now();
      if (cancelled) {
        progression.after = progression.before;
        progression.steps = [];
      } else {
        const amount = (progression.after.cycles - progression.before.cycles) * TARGET_QUIZ_GOBBLARS_REWARD;
        if (amount) {
          await db.run(`INSERT INTO gobblar_profiles (installId, balance, updatedAt) VALUES (?, ?, ?)
            ON CONFLICT(installId) DO UPDATE SET balance = balance + excluded.balance, updatedAt = excluded.updatedAt`, String(id), amount, at);
          const { balance } = await db.get("SELECT balance FROM gobblar_profiles WHERE installId = ?", String(id));
          const entry = await db.run("INSERT INTO gobblar_ledger (installId, ts, delta, reason, meta) VALUES (?, ?, ?, ?, ?)",
            String(id), at, amount, "target_quiz_milestone", JSON.stringify({ roundId, cycle: progression.after.cycles, target: TARGET_QUIZ_POINTS_GOAL }));
          // One receipt per threshold lets the recap display each +50 toast.
          for (let index = 0; index < amount / TARGET_QUIZ_GOBBLARS_REWARD; index += 1) progression.rewards.push({ amount: TARGET_QUIZ_GOBBLARS_REWARD, balance, receipt: `target-quiz:${entry.lastID}:${index}` });
        }
        await db.run(`INSERT INTO target_quiz_points (user_id, total, points, cycles, updated_at)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
          total = excluded.total, points = excluded.points, cycles = excluded.cycles, updated_at = excluded.updated_at`,
        id, progression.after.total, progression.after.points, progression.after.cycles, at);
      }
      await db.run("UPDATE target_quiz_pending SET status = ?, progression = ? WHERE user_id = ?", cancelled ? "cancelled" : "finished", JSON.stringify(progression), id);
      return progression;
    }, { label: "target-quiz-finish" });
  }
  return { init, load, answer, finish };
}
