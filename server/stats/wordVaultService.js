import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { normalizeWord } from "../../shared/gameLogic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : path.join(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "gobble.db");

let db = null;
let initPromise = null;
let writeQueue = Promise.resolve();
const SQLITE_BUSY_MAX_RETRIES = 30;
const SQLITE_BUSY_RETRY_BASE_MS = 80;
const MAX_VAULT_WORD_LEN = 80;

function isSqliteBusyError(err) {
  const code = String(err?.code || "").toUpperCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code === "SQLITE_BUSY" ||
    msg.includes("database is locked") ||
    msg.includes("sqlite_busy")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithBusyRetry(task, retries = SQLITE_BUSY_MAX_RETRIES) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task();
    } catch (err) {
      if (!isSqliteBusyError(err) || attempt >= retries) {
        throw err;
      }
      const waitMs = SQLITE_BUSY_RETRY_BASE_MS * (attempt + 1);
      await sleep(waitMs);
    }
  }
}

function runSerializedWrite(task) {
  const execute = () => runWithBusyRetry(task);
  const next = writeQueue.then(execute, execute);
  writeQueue = next.catch(() => {});
  return next;
}

async function runInImmediateTransaction(task) {
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

function collapseWhitespace(raw) {
  return typeof raw === "string" ? raw.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

function sanitizeVaultWord(rawWord) {
  const word = collapseWhitespace(rawWord).slice(0, MAX_VAULT_WORD_LEN);
  if (!word) {
    return { ok: false, error: "word_required", word: "", wordKey: "" };
  }
  const wordKey = normalizeWord(word);
  if (!wordKey) {
    return { ok: false, error: "word_invalid", word: "", wordKey: "" };
  }
  return { ok: true, error: null, word, wordKey };
}

function normalizeUserId(userId) {
  const safeUserId = Number(userId);
  return Number.isInteger(safeUserId) && safeUserId > 0 ? safeUserId : 0;
}

function serializeVaultEntry(row) {
  return {
    word: collapseWhitespace(row?.word || ""),
    wordKey: String(row?.word_key || "").trim(),
    addedAt: Number(row?.added_at) || 0,
  };
}

async function ensureDb() {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      db = await open({ filename: DB_PATH, driver: sqlite3.Database });
      await db.exec("PRAGMA journal_mode = WAL;");
      await db.exec("PRAGMA busy_timeout = 15000;");
      await db.exec(`
        CREATE TABLE IF NOT EXISTS word_vault_entries (
          user_id INTEGER NOT NULL,
          word_key TEXT NOT NULL,
          word TEXT NOT NULL,
          added_at INTEGER NOT NULL,
          PRIMARY KEY(user_id, word_key)
        );
        CREATE INDEX IF NOT EXISTS idx_word_vault_entries_user_added_at
        ON word_vault_entries(user_id, added_at DESC);
      `);
      return db;
    })();
  }
  try {
    await initPromise;
  } catch (err) {
    console.warn("Word vault service init failed", err);
    db = null;
    initPromise = null;
    return null;
  }
  return db;
}

export async function initWordVaultService() {
  return await ensureDb();
}

export async function listWordVaultEntriesForUser(userId) {
  const safeUserId = normalizeUserId(userId);
  if (!safeUserId) return { ok: false, error: "auth_required", items: [] };
  const ready = await ensureDb();
  if (!ready) return { ok: false, error: "vault_unavailable", items: [] };
  try {
    const rows = await runWithBusyRetry(() =>
      db.all(
        `SELECT user_id, word_key, word, added_at
         FROM word_vault_entries
         WHERE user_id = ?
         ORDER BY added_at DESC, word_key ASC`,
        safeUserId
      )
    );
    return {
      ok: true,
      items: Array.isArray(rows)
        ? rows.map(serializeVaultEntry).filter((entry) => entry.word && entry.wordKey)
        : [],
    };
  } catch (err) {
    console.warn("Word vault list failed", err);
    return { ok: false, error: "vault_list_failed", items: [] };
  }
}

export async function addWordVaultEntryForUser(userId, rawWord) {
  const safeUserId = normalizeUserId(userId);
  if (!safeUserId) return { ok: false, error: "auth_required" };
  const sanitized = sanitizeVaultWord(rawWord);
  if (!sanitized.ok) {
    return { ok: false, error: sanitized.error };
  }
  const ready = await ensureDb();
  if (!ready) return { ok: false, error: "vault_unavailable" };
  const now = Date.now();
  try {
    const result = await runSerializedWrite(async () =>
      runInImmediateTransaction(async () => {
        const existing = await db.get(
          `SELECT user_id, word_key, word, added_at
           FROM word_vault_entries
           WHERE user_id = ? AND word_key = ?`,
          safeUserId,
          sanitized.wordKey
        );
        if (existing) {
          return {
            ok: true,
            alreadyExists: true,
            entry: serializeVaultEntry(existing),
          };
        }
        await db.run(
          `INSERT INTO word_vault_entries (user_id, word_key, word, added_at)
           VALUES (?, ?, ?, ?)`,
          safeUserId,
          sanitized.wordKey,
          sanitized.word,
          now
        );
        return {
          ok: true,
          alreadyExists: false,
          entry: {
            word: sanitized.word,
            wordKey: sanitized.wordKey,
            addedAt: now,
          },
        };
      })
    );
    return result;
  } catch (err) {
    console.warn("Word vault add failed", err);
    return { ok: false, error: isSqliteBusyError(err) ? "vault_busy" : "vault_add_failed" };
  }
}

export async function removeWordVaultEntryForUser(userId, rawWord) {
  const safeUserId = normalizeUserId(userId);
  if (!safeUserId) return { ok: false, error: "auth_required" };
  const sanitized = sanitizeVaultWord(rawWord);
  if (!sanitized.ok) {
    return { ok: false, error: sanitized.error };
  }
  const ready = await ensureDb();
  if (!ready) return { ok: false, error: "vault_unavailable" };
  try {
    const removed = await runSerializedWrite(async () =>
      runInImmediateTransaction(async () => {
        const result = await db.run(
          `DELETE FROM word_vault_entries
           WHERE user_id = ? AND word_key = ?`,
          safeUserId,
          sanitized.wordKey
        );
        return Number(result?.changes) > 0;
      })
    );
    return { ok: true, removed };
  } catch (err) {
    console.warn("Word vault remove failed", err);
    return { ok: false, error: "vault_remove_failed" };
  }
}
