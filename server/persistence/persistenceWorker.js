import { parentPort } from "worker_threads";

import {
  initPlayerProfileService,
  recordLiveHeadToHeadOutcomes,
  recordPlayerRoundStats,
} from "../stats/playerProfileService.js";

process.on("unhandledRejection", (reason) => {
  console.error("[persistence-worker] unhandled rejection", reason);
});

let readyPromise = null;

function ensureReady() {
  if (!readyPromise) {
    readyPromise = initPlayerProfileService();
  }
  return readyPromise;
}

async function handleJob(type, payload) {
  await ensureReady();
  if (type === "recordPlayerRoundStats") {
    return recordPlayerRoundStats(payload || {});
  }
  if (type === "recordLiveHeadToHeadOutcomes") {
    return recordLiveHeadToHeadOutcomes(payload || {});
  }
  if (type === "health") {
    return { ok: true, worker: "persistence" };
  }
  throw new Error(`unknown_persistence_job:${type}`);
}

function respond(message) {
  if (!parentPort) return;
  parentPort.postMessage(message);
}

if (parentPort) {
  parentPort.on("message", async (message) => {
    const { id, type, payload } = message || {};
    if (!id || !type) return;
    try {
      const result = await handleJob(type, payload);
      respond({ id, ok: true, result });
    } catch (err) {
      respond({
        id,
        ok: false,
        error: err?.message || String(err || "persistence_worker_error"),
      });
    }
  });
  void ensureReady().catch((err) => {
    console.warn("[persistence-worker] init failed", err?.message || err);
  });
}

