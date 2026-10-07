function validatePlayerKey(playerKey) {
  if (typeof playerKey !== "string" || !playerKey || playerKey.length > 200) {
    throw new Error("invalid_target_quiz_player");
  }
}

function validateProgress(progress) {
  if (!progress || typeof progress.version !== "string" || !progress.version ||
      progress.version.length > 128 ||
      !Number.isSafeInteger(progress.routeIndex) || progress.routeIndex < 0 ||
      !Number.isSafeInteger(progress.questionIndex) || progress.questionIndex < 0) {
    throw new Error("invalid_target_quiz_progress");
  }
}

// The persistence worker owns this connection; no database I/O is done by the game loop.
export function createTargetQuizProgressRepository({ getDb, now = Date.now }) {
  let initialization = null;

  function init() {
    if (!initialization) {
      initialization = (async () => {
        const db = await getDb();
        await db.exec(`CREATE TABLE IF NOT EXISTS target_quiz_progress (
          player_key TEXT PRIMARY KEY,
          catalog_version TEXT NOT NULL,
          route_index INTEGER NOT NULL CHECK(route_index >= 0),
          question_index INTEGER NOT NULL CHECK(question_index >= 0),
          updated_at INTEGER NOT NULL
        )`);
        return db;
      })().catch(error => {
        initialization = null;
        throw error;
      });
    }
    return initialization;
  }

  return {
    init,
    async load(playerKey) {
      validatePlayerKey(playerKey);
      const db = await init();
      return await db.get(`SELECT catalog_version AS version, route_index AS routeIndex,
        question_index AS questionIndex FROM target_quiz_progress WHERE player_key = ?`, playerKey) || null;
    },
    async save(playerKey, progress) {
      validatePlayerKey(playerKey);
      validateProgress(progress);
      const db = await init();
      await db.run(`INSERT INTO target_quiz_progress
        (player_key, catalog_version, route_index, question_index, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(player_key) DO UPDATE SET
          catalog_version = excluded.catalog_version, route_index = excluded.route_index,
          question_index = excluded.question_index, updated_at = excluded.updated_at`,
      playerKey, progress.version, progress.routeIndex, progress.questionIndex, now());
      return { ...progress };
    },
  };
}
