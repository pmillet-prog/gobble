const DEFAULT_BUSY_RETRIES = 30;
const DEFAULT_BUSY_RETRY_BASE_MS = 80;
const DEFAULT_QUEUE_WARN_MS = 1000;
const DEFAULT_TASK_WARN_MS = 3000;

let writeQueue = Promise.resolve();
let writeSeq = 0;

export function isSqliteBusyError(err) {
  const code = String(err?.code || "").toUpperCase();
  const msg = String(err?.message || "").toLowerCase();
  return code === "SQLITE_BUSY" || msg.includes("database is locked") || msg.includes("sqlite_busy");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSqliteBusyRetry(
  task,
  {
    retries = DEFAULT_BUSY_RETRIES,
    baseMs = DEFAULT_BUSY_RETRY_BASE_MS,
    label = "sqlite",
  } = {}
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (err) {
      if (!isSqliteBusyError(err) || attempt >= retries) {
        throw err;
      }
      const waitMs = baseMs * (attempt + 1);
      if (attempt === 0 || attempt === 4 || attempt === 9) {
        console.warn(`[sqlite] busy label=${label} attempt=${attempt + 1} waitMs=${waitMs}`);
      }
      await sleep(waitMs);
    }
  }
}

export function runSerializedSqliteWrite(
  task,
  {
    retries = DEFAULT_BUSY_RETRIES,
    baseMs = DEFAULT_BUSY_RETRY_BASE_MS,
    label = "sqlite-write",
    queueWarnMs = DEFAULT_QUEUE_WARN_MS,
    taskWarnMs = DEFAULT_TASK_WARN_MS,
  } = {}
) {
  const id = ++writeSeq;
  const queuedAt = Date.now();
  const execute = async () => {
    const waitMs = Date.now() - queuedAt;
    if (waitMs > queueWarnMs) {
      console.warn(`[sqlite] write queue wait label=${label} id=${id} waitMs=${waitMs}`);
    }
    const startedAt = Date.now();
    try {
      return await runSqliteBusyRetry(task, { retries, baseMs, label });
    } finally {
      const durationMs = Date.now() - startedAt;
      if (durationMs > taskWarnMs) {
        console.warn(`[sqlite] slow write label=${label} id=${id} durationMs=${durationMs}`);
      }
    }
  };
  const next = writeQueue.then(execute, execute);
  writeQueue = next.catch(() => {});
  return next;
}

export async function runSqliteImmediateTransaction(db, task, { label = "sqlite-transaction" } = {}) {
  if (!db) throw new Error(`${label}: missing db`);
  await db.exec("BEGIN IMMEDIATE");
  let committed = false;
  try {
    const result = await task();
    await db.exec("COMMIT");
    committed = true;
    return result;
  } catch (err) {
    if (!committed) {
      try {
        await db.exec("ROLLBACK");
      } catch (_) {}
    }
    throw err;
  }
}

