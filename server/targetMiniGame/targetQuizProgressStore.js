import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { runSerializedSqliteWrite } from "../sqliteQueue.js";
import { createTargetQuizProgressRepository } from "./targetQuizProgressRepository.js";
import { createTargetQuizPointsRepository } from "./targetQuizPointsRepository.js";
import { createPlayerProgressBoardsRepository, normalizeProgressBoardsRequest } from "../stats/playerProgressBoardsRepository.js";
import { createShortLivedRequestCache } from "../shortLivedRequestCache.js";

const dataDir = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : fileURLToPath(new URL("../data/", import.meta.url));
let database = null;
let ready = null;
async function getDb() {
  if (!database) {
    await mkdir(dataDir, { recursive: true });
    database = await open({ filename: path.join(dataDir, "gobble.db"), driver: sqlite3.Database });
    await database.exec("PRAGMA busy_timeout = 5000");
  }
  return database;
}
const repository = createTargetQuizProgressRepository({ getDb });
const points = createTargetQuizPointsRepository({ getDb, cursors: repository });
const progressBoards = createPlayerProgressBoardsRepository({ getDb });
const progressBoardsCache = createShortLivedRequestCache({ ttlMs: 5000, maxEntries: 24 });

function ensureReady() {
  if (!ready) {
    ready = runSerializedSqliteWrite(() => points.init(), { label: "target-quiz-schema" })
      .catch(error => { ready = null; throw error; });
  }
  return ready;
}

// Imported only by the persistence worker. The live process never opens this DB.
export async function loadTargetQuizProgress({ playerKey }) {
  await ensureReady();
  return repository.load(playerKey);
}

export async function saveTargetQuizProgress({ playerKey, progress }) {
  await ensureReady();
  return runSerializedSqliteWrite(() => repository.save(playerKey, progress), { label: "target-quiz-progress" });
}

export async function loadTargetQuizPoints({ playerKey }) {
  await ensureReady();
  return runSerializedSqliteWrite(() => points.load(playerKey), { label: "target-quiz-points-read" });
}

export async function saveTargetQuizAnswer(payload) {
  await ensureReady();
  return runSerializedSqliteWrite(() => points.answer(payload), { label: "target-quiz-answer" });
}

export async function finishTargetQuizPoints(payload) {
  await ensureReady();
  return runSerializedSqliteWrite(() => points.finish(payload), { label: "target-quiz-finish" });
}

export async function getPlayerProgressBoards(payload) {
  const request = normalizeProgressBoardsRequest(payload);
  return progressBoardsCache.getOrLoad(JSON.stringify(request), async () => {
    await ensureReady();
    // Read after pending writes, never inside another session's transaction.
    return runSerializedSqliteWrite(() => progressBoards.read(request), { label: "player-progress-boards" });
  });
}
