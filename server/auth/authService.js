import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { promisify } from "util";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import {
  runSerializedSqliteWrite,
  runSqliteImmediateTransaction,
} from "../sqliteQueue.js";

const scrypt = promisify(scryptCallback);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : path.join(__dirname, "../data");
const DB_PATH = path.join(DATA_DIR, "gobble.db");
const MIGRATIONS_DIR = path.join(__dirname, "../migrations");
const WEEKLY_STATS_PATH = path.join(DATA_DIR, "weekly-stats.json");

const USERNAME_MIN_LEN = 3;
const USERNAME_MAX_LEN = 25;
const PASSWORD_MIN_LEN = 3;
const SESSION_TOUCH_MIN_MS = 5 * 60 * 1000;
const SESSION_LOOKUP_CACHE_TTL_MS = 3 * 1000;
const SESSION_LOOKUP_CACHE_MAX_ENTRIES = 1000;

let db = null;
let initPromise = null;
const sessionTouchCache = new Map();
const sessionLookupCache = new Map();
const sessionLookupPromises = new Map();
let sessionLookupGeneration = 0;

function nowTs() {
  return Date.now();
}

function runAuthWrite(task) {
  return runSerializedSqliteWrite(task, {
    retries: 30,
    baseMs: 80,
    label: "auth",
  });
}

function runAuthStatement(ready, sql, ...params) {
  return runAuthWrite(() => ready.run(sql, ...params));
}

function scheduleSessionTouch(ready, sessionId, previousLastSeenAt, timestamp) {
  const safeSessionId = String(sessionId || "").trim();
  if (!safeSessionId) return;
  const previous = Math.max(
    Number(previousLastSeenAt) || 0,
    Number(sessionTouchCache.get(safeSessionId)) || 0
  );
  if (timestamp - previous < SESSION_TOUCH_MIN_MS) return;
  sessionTouchCache.set(safeSessionId, timestamp);
  void runAuthWrite(() =>
    ready.run(
      `UPDATE user_sessions
       SET last_seen_at = ?
       WHERE id = ?`,
      timestamp,
      safeSessionId
    )
  ).catch(() => {});
}

function pruneSessionLookupCache(now = nowTs()) {
  for (const [tokenHash, entry] of sessionLookupCache.entries()) {
    if (!entry || Number(entry.expiresAt) <= now) {
      sessionLookupCache.delete(tokenHash);
    }
  }
  while (sessionLookupCache.size > SESSION_LOOKUP_CACHE_MAX_ENTRIES) {
    const oldestKey = sessionLookupCache.keys().next().value;
    if (oldestKey === undefined) break;
    sessionLookupCache.delete(oldestKey);
  }
}

function clearSessionLookupCache({ tokenHash = "", userId = null } = {}) {
  sessionLookupGeneration += 1;
  sessionLookupPromises.clear();
  const safeTokenHash = String(tokenHash || "").trim();
  if (safeTokenHash) {
    sessionLookupCache.delete(safeTokenHash);
  }
  const safeUserId = Number(userId);
  if (Number.isInteger(safeUserId) && safeUserId > 0) {
    for (const [cachedTokenHash, entry] of sessionLookupCache.entries()) {
      if (Number(entry?.auth?.user?.id) === safeUserId) {
        sessionLookupCache.delete(cachedTokenHash);
      }
    }
  }
}

function createPrimaryInstallId() {
  return `acct-${randomBytes(16).toString("hex")}`;
}

function sha256Hex(raw) {
  return createHash("sha256").update(String(raw || "")).digest("hex");
}

function normalizeUnicode(raw) {
  return typeof raw === "string" ? raw.normalize("NFKC") : "";
}

function collapseWhitespace(raw) {
  return normalizeUnicode(raw).replace(/\s+/g, " ").trim();
}

export function normalizeUsername(raw) {
  const collapsed = collapseWhitespace(raw);
  if (!collapsed) return "";
  return collapsed.toLocaleLowerCase("fr-FR");
}

export function sanitizeUsernameDisplay(raw, { allowShort = false } = {}) {
  const collapsed = collapseWhitespace(raw);
  if (!collapsed) return { ok: false, error: "username_required", value: "" };
  if (!allowShort && collapsed.length < USERNAME_MIN_LEN) {
    return { ok: false, error: "username_too_short", value: "" };
  }
  if (collapsed.length > USERNAME_MAX_LEN) {
    return { ok: false, error: "username_too_long", value: "" };
  }
  if (/[\u0000-\u001f\u007f]/u.test(collapsed)) {
    return { ok: false, error: "username_invalid", value: "" };
  }
  return { ok: true, error: null, value: collapsed };
}

export function sanitizeEmail(raw) {
  const value = normalizeUnicode(String(raw || "")).trim().toLowerCase();
  if (!value) return { ok: true, error: null, value: null };
  if (value.length > 254) return { ok: false, error: "email_invalid", value: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
    return { ok: false, error: "email_invalid", value: null };
  }
  return { ok: true, error: null, value };
}

export function validatePassword(raw) {
  const value = typeof raw === "string" ? raw : "";
  if (!value) return { ok: false, error: "password_required" };
  if (value.length < PASSWORD_MIN_LEN) {
    return { ok: false, error: "password_too_short" };
  }
  if (value.length > 200) {
    return { ok: false, error: "password_too_long" };
  }
  return { ok: true, error: null };
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

export async function verifyPassword(password, passwordHash) {
  const raw = String(passwordHash || "");
  const [scheme, salt, storedHex] = raw.split("$");
  if (scheme !== "scrypt" || !salt || !storedHex) return false;
  const derived = await scrypt(String(password || ""), salt, 64);
  const left = Buffer.from(storedHex, "hex");
  const right = Buffer.from(derived);
  if (left.length !== right.length) return false;
  try {
    return timingSafeEqual(left, right);
  } catch (_) {
    return false;
  }
}

function serializeUser(row) {
  if (!row) return null;
  const userId = Number(row.id ?? row.user_id);
  return {
    id: Number.isInteger(userId) && userId > 0 ? userId : null,
    usernameDisplay: row.username_display,
    usernameNormalized: row.username_normalized,
    email: row.email || null,
    createdAt: Number(row.created_at) || null,
    updatedAt: Number(row.updated_at) || null,
    lastLoginAt: Number(row.last_login_at) || null,
    primaryInstallId: typeof row.primary_install_id === "string" ? row.primary_install_id.trim() : "",
    isLegacyConverted: !!row.is_legacy_converted,
    mustResetPassword: !!row.must_reset_password,
  };
}

async function ensureDb() {
  if (db) return db;
  if (!initPromise) {
    initPromise = (async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const handle = await open({ filename: DB_PATH, driver: sqlite3.Database });
      const migrationNames = (await fs.readdir(MIGRATIONS_DIR))
        .filter((name) => name.endsWith(".sql"))
        .sort();
      db = handle;
      await runAuthWrite(async () => {
        await handle.exec("PRAGMA journal_mode = WAL;");
        await handle.exec("PRAGMA busy_timeout = 5000;");
        await handle.exec("PRAGMA foreign_keys = ON;");
        for (const migrationName of migrationNames) {
          const sql = await fs.readFile(path.join(MIGRATIONS_DIR, migrationName), "utf8");
          await handle.exec(sql);
        }
      });
      return handle;
    })();
  }
  try {
    await initPromise;
  } catch (err) {
    db = null;
    initPromise = null;
    throw err;
  }
  return db;
}

function extractInstallIdFromPlayerKey(playerKey) {
  if (typeof playerKey !== "string") return "";
  if (!playerKey.startsWith("install:")) return "";
  return playerKey.slice("install:".length).trim();
}

function collectWeeklyProfilesFromWeekObject(weekObj, sink) {
  if (!weekObj || typeof weekObj !== "object") return;
  const boardKeys = [
    "medals",
    "mostWordsInGame",
    "totalScore",
    "bestWord",
    "longestWord",
    "bestRoundScore",
    "bestTimeTargetLong",
    "bestTimeTargetScore",
    "vocab",
    "mostGobbles",
  ];
  for (const boardKey of boardKeys) {
    const board = weekObj[boardKey];
    if (!board || typeof board !== "object") continue;
    for (const entry of Object.values(board)) {
      const installId = extractInstallIdFromPlayerKey(entry?.playerKey);
      const usernameDisplay = collapseWhitespace(entry?.nick || "").slice(0, USERNAME_MAX_LEN);
      if (!installId || !usernameDisplay) continue;
      const updatedAt =
        (Number.isFinite(entry?.achievedAt) && entry.achievedAt) ||
        (Number.isFinite(entry?.updatedAt) && entry.updatedAt) ||
        (Number.isFinite(weekObj?.weekStartTs) && weekObj.weekStartTs) ||
        nowTs();
      const previous = sink.get(installId);
      if (!previous || updatedAt >= previous.updatedAt) {
        sink.set(installId, {
          installId,
          usernameDisplay,
          updatedAt,
          source: "weekly_stats",
        });
      }
    }
  }
}

async function readWeeklyLegacyProfiles() {
  const sink = new Map();
  try {
    const raw = await fs.readFile(WEEKLY_STATS_PATH, "utf8");
    const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const parsed = JSON.parse(cleaned);
    collectWeeklyProfilesFromWeekObject(parsed, sink);
    if (parsed?.history && typeof parsed.history === "object") {
      for (const week of Object.values(parsed.history)) {
        collectWeeklyProfilesFromWeekObject(week, sink);
      }
    }
  } catch (_) {}
  return sink;
}

async function readVocabularyLegacyProfiles() {
  const ready = await ensureDb();
  const sink = new Map();
  try {
    const rows = await ready.all(
      `SELECT installId, nick, updatedAt
       FROM vocab_profiles
       WHERE installId IS NOT NULL AND nick IS NOT NULL`
    );
    for (const row of rows || []) {
      const installId = String(row?.installId || "").trim();
      const usernameDisplay = collapseWhitespace(row?.nick || "").slice(0, USERNAME_MAX_LEN);
      if (!installId || !usernameDisplay) continue;
      sink.set(installId, {
        installId,
        usernameDisplay,
        updatedAt: Number(row?.updatedAt) || nowTs(),
        source: "vocab_profiles",
      });
    }
  } catch (_) {}
  return sink;
}

async function upsertLegacyReservation(profile, { claimedUserId = null } = {}) {
  const ready = await ensureDb();
  const installId = String(profile?.installId || "").trim();
  const displayResult = sanitizeUsernameDisplay(profile?.usernameDisplay, { allowShort: true });
  if (!installId || !displayResult.ok) return null;
  const usernameDisplay = displayResult.value;
  const usernameNormalized = normalizeUsername(usernameDisplay);
  const timestamp = Number(profile?.updatedAt) || nowTs();
  const existingByInstall = await ready.get(
    `SELECT *
     FROM legacy_username_reservations
     WHERE install_id = ?`,
    installId
  );
  if (existingByInstall) {
    try {
      await runAuthStatement(
        ready,
        `UPDATE legacy_username_reservations
         SET username_display = ?, username_normalized = ?, source = ?, updated_at = ?,
             claimed_user_id = COALESCE(claimed_user_id, ?)
         WHERE install_id = ?`,
        usernameDisplay,
        usernameNormalized,
        profile?.source || existingByInstall.source || "legacy",
        timestamp,
        claimedUserId,
        installId
      );
    } catch (_) {
      return existingByInstall;
    }
    return await ready.get(
      `SELECT *
       FROM legacy_username_reservations
       WHERE install_id = ?`,
      installId
    );
  }
  const existingByUsername = await ready.get(
    `SELECT *
     FROM legacy_username_reservations
     WHERE username_normalized = ?`,
    usernameNormalized
  );
  if (existingByUsername && existingByUsername.install_id !== installId) {
    return existingByUsername;
  }
  try {
    await runAuthStatement(
      ready,
      `INSERT INTO legacy_username_reservations
       (install_id, username_display, username_normalized, source, created_at, updated_at, claimed_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      installId,
      usernameDisplay,
      usernameNormalized,
      profile?.source || "legacy",
      timestamp,
      timestamp,
      claimedUserId
    );
  } catch (_) {
    return await ready.get(
      `SELECT *
       FROM legacy_username_reservations
       WHERE username_normalized = ? OR install_id = ?`,
      usernameNormalized,
      installId
    );
  }
  return await ready.get(
    `SELECT *
     FROM legacy_username_reservations
     WHERE install_id = ?`,
    installId
  );
}

export async function syncLegacyReservations() {
  const ready = await ensureDb();
  const merged = new Map();
  const [weeklyProfiles, vocabProfiles] = await Promise.all([
    readWeeklyLegacyProfiles(),
    readVocabularyLegacyProfiles(),
  ]);

  for (const sourceMap of [weeklyProfiles, vocabProfiles]) {
    for (const [installId, profile] of sourceMap.entries()) {
      const previous = merged.get(installId);
      if (!previous || (Number(profile.updatedAt) || 0) >= (Number(previous.updatedAt) || 0)) {
        merged.set(installId, profile);
      }
    }
  }

  const users = await ready.all(
    `SELECT id, primary_install_id, username_display, username_normalized
     FROM users`
  );
  const claimedByInstallId = new Map();
  for (const row of users || []) {
    const installId = String(row?.primary_install_id || "").trim();
    if (!installId) continue;
    claimedByInstallId.set(installId, {
      userId: Number(row.id),
      usernameDisplay: row.username_display,
      usernameNormalized: row.username_normalized,
    });
  }

  for (const profile of merged.values()) {
    const claimed = claimedByInstallId.get(profile.installId);
    await upsertLegacyReservation(profile, { claimedUserId: claimed?.userId || null });
  }

  for (const [installId, claimed] of claimedByInstallId.entries()) {
    await upsertLegacyReservation(
      {
        installId,
        usernameDisplay: claimed.usernameDisplay,
        updatedAt: nowTs(),
        source: "claimed_user",
      },
      { claimedUserId: claimed.userId }
    );
  }
}

export async function initAuthService() {
  await ensureDb();
}

export async function findUserById(userId) {
  const ready = await ensureDb();
  const row = await ready.get(
    `SELECT *
     FROM users
     WHERE id = ?`,
    Number(userId)
  );
  return serializeUser(row);
}

export async function findUserByUsername(rawUsername) {
  const ready = await ensureDb();
  const usernameNormalized = normalizeUsername(rawUsername);
  if (!usernameNormalized) return null;
  const row = await ready.get(
    `SELECT *
     FROM users
     WHERE username_normalized = ?`,
    usernameNormalized
  );
  return serializeUser(row);
}

export async function findUserByInstallId(rawInstallId, resolvedInstallId = "") {
  const ready = await ensureDb();
  const raw = String(rawInstallId || "").trim();
  const resolved = String(resolvedInstallId || "").trim();
  if (!raw && !resolved) return null;
  const row = await ready.get(
    `SELECT u.*
     FROM users u
     WHERE u.primary_install_id IN (?, ?)
     LIMIT 1`,
    raw,
    resolved
  );
  return serializeUser(row);
}

export async function listUsersByDeviceInstallId(rawInstallId, resolvedInstallId = "") {
  const ready = await ensureDb();
  const candidates = [];
  const raw = String(rawInstallId || "").trim();
  const resolved = String(resolvedInstallId || "").trim();
  if (raw) candidates.push(raw);
  if (resolved && resolved !== raw) candidates.push(resolved);
  if (!candidates.length) return [];

  const placeholders = candidates.map(() => "?").join(", ");
  const rows = await ready.all(
    `SELECT DISTINCT u.*
     FROM users u
     LEFT JOIN user_devices ud ON ud.user_id = u.id
     WHERE u.primary_install_id IN (${placeholders})
        OR ud.install_id IN (${placeholders})
     ORDER BY u.last_login_at DESC, u.updated_at DESC, u.created_at DESC`,
    ...candidates,
    ...candidates
  );
  return Array.isArray(rows) ? rows.map((row) => serializeUser(row)).filter(Boolean) : [];
}

export async function listDevicesForUser(userId) {
  const ready = await ensureDb();
  const rows = await ready.all(
    `SELECT install_id AS installId, created_at AS createdAt, last_seen_at AS lastSeenAt
     FROM user_devices
     WHERE user_id = ?
     ORDER BY created_at ASC`,
    Number(userId)
  );
  return Array.isArray(rows) ? rows : [];
}

export async function getUserIdentityMigrationSignature(userId) {
  const ready = await ensureDb();
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) return "";
  const row = await ready.get(
    `SELECT migration_signature
     FROM user_identity_migrations
     WHERE user_id = ?`,
    safeUserId
  );
  return typeof row?.migration_signature === "string" ? row.migration_signature : "";
}

export async function setUserIdentityMigrationSignature(userId, migrationSignature) {
  const ready = await ensureDb();
  const safeUserId = Number(userId);
  const safeSignature = String(migrationSignature || "").trim();
  if (!Number.isInteger(safeUserId) || safeUserId <= 0 || !safeSignature) return false;
  await runAuthStatement(
    ready,
    `INSERT INTO user_identity_migrations (user_id, migration_signature, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id)
     DO UPDATE SET migration_signature = excluded.migration_signature, updated_at = excluded.updated_at`,
    safeUserId,
    safeSignature,
    nowTs()
  );
  return true;
}

export async function findLegacyReservationByInstallId(rawInstallId) {
  const ready = await ensureDb();
  const installId = String(rawInstallId || "").trim();
  if (!installId) return null;
  let row = await ready.get(
    `SELECT *
     FROM legacy_username_reservations
     WHERE install_id = ?`,
    installId
  );
  if (row) return row;

  const vocab = await ready.get(
    `SELECT installId, nick, updatedAt
     FROM vocab_profiles
     WHERE installId = ?`,
    installId
  ).catch(() => null);

  const weeklyProfiles = await readWeeklyLegacyProfiles();
  const weekly = weeklyProfiles.get(installId) || null;
  const profile = vocab?.nick
    ? {
        installId,
        usernameDisplay: vocab.nick,
        updatedAt: Number(vocab.updatedAt) || nowTs(),
        source: "vocab_profiles",
      }
    : weekly;
  if (!profile) return null;
  row = await upsertLegacyReservation(profile);
  return row || null;
}

export async function findLegacyReservationByUsername(rawUsername) {
  const ready = await ensureDb();
  const usernameNormalized = normalizeUsername(rawUsername);
  if (!usernameNormalized) return null;
  return await ready.get(
    `SELECT *
     FROM legacy_username_reservations
     WHERE username_normalized = ?`,
    usernameNormalized
  );
}

export async function isUsernameTakenOrReserved(rawUsername) {
  const ready = await ensureDb();
  const usernameNormalized = normalizeUsername(rawUsername);
  if (!usernameNormalized) return { taken: false, reserved: false, user: null, reservation: null };
  const [userRow, reservationRow] = await Promise.all([
    ready.get(
      `SELECT *
       FROM users
       WHERE username_normalized = ?`,
      usernameNormalized
    ),
    ready.get(
      `SELECT *
       FROM legacy_username_reservations
       WHERE username_normalized = ?`,
      usernameNormalized
    ),
  ]);
  return {
    taken: !!userRow,
    reserved: !!(reservationRow && !reservationRow.claimed_user_id),
    user: serializeUser(userRow),
    reservation: reservationRow || null,
  };
}

async function setPrimaryInstallId(userId, installId) {
  const ready = await ensureDb();
  if (!installId) return;
  await runAuthStatement(
    ready,
    `UPDATE users
     SET primary_install_id = COALESCE(primary_install_id, ?), updated_at = ?
     WHERE id = ?`,
    installId,
    nowTs(),
    Number(userId)
  );
}

export async function ensureUserPrimaryInstallId(userId) {
  const ready = await ensureDb();
  const row = await ready.get(
    `SELECT primary_install_id
     FROM users
     WHERE id = ?`,
    Number(userId)
  );
  const current = String(row?.primary_install_id || "").trim();
  if (current) return current;
  const generated = createPrimaryInstallId();
  await setPrimaryInstallId(userId, generated);
  return generated;
}

export async function touchUserLastLogin(userId) {
  const ready = await ensureDb();
  const timestamp = nowTs();
  await runAuthStatement(
    ready,
    `UPDATE users
     SET last_login_at = ?, updated_at = ?
     WHERE id = ?`,
    timestamp,
    timestamp,
    Number(userId)
  );
}

export async function linkDeviceToUser(userId, installId) {
  const ready = await ensureDb();
  const safeUserId = Number(userId);
  const safeInstallId = String(installId || "").trim();
  if (!safeUserId || !safeInstallId) return false;
  const timestamp = nowTs();
  await runAuthStatement(
    ready,
    `INSERT INTO user_devices (user_id, install_id, created_at, last_seen_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, install_id)
     DO UPDATE SET last_seen_at = excluded.last_seen_at`,
    safeUserId,
    safeInstallId,
    timestamp,
    timestamp
  );
  return true;
}

export async function ensureDeviceAvailableForUser(userId, rawInstallId, resolvedInstallId = "") {
  const linkedUser = await findUserByInstallId(rawInstallId, resolvedInstallId);
  if (!linkedUser) return true;
  return Number(linkedUser.id) === Number(userId);
}

export async function createUser({
  usernameDisplay,
  password,
  email = null,
  primaryInstallId = null,
  isLegacyConverted = false,
  claimedReservationId = null,
  allowedReservationId = null,
  allowShortUsername = false,
}) {
  const ready = await ensureDb();
  const displayResult = sanitizeUsernameDisplay(usernameDisplay, {
    allowShort: allowShortUsername,
  });
  if (!displayResult.ok) {
    return { ok: false, error: displayResult.error };
  }
  const passwordResult = validatePassword(password);
  if (!passwordResult.ok) {
    return { ok: false, error: passwordResult.error };
  }
  const emailResult = sanitizeEmail(email);
  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error };
  }

  const usernameNormalized = normalizeUsername(displayResult.value);
  const availability = await isUsernameTakenOrReserved(displayResult.value);
  const ownsAllowedReservation =
    availability.reservation &&
    Number(availability.reservation.id) === Number(allowedReservationId || claimedReservationId || 0);
  if (availability.taken || (availability.reserved && !ownsAllowedReservation)) {
    return {
      ok: false,
      error: availability.reserved ? "username_reserved" : "username_taken",
      reservation: availability.reservation,
    };
  }

  const primary = String(primaryInstallId || "").trim() || null;
  const effectivePrimary = primary || createPrimaryInstallId();
  const timestamp = nowTs();
  const passwordHash = await hashPassword(password);

  try {
    const userId = await runAuthWrite(() =>
      runSqliteImmediateTransaction(
        ready,
        async () => {
          const insert = await ready.run(
            `INSERT INTO users
             (username_display, username_normalized, password_hash, email, primary_install_id,
              created_at, updated_at, last_login_at, is_legacy_converted, must_reset_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, 0)`,
            displayResult.value,
            usernameNormalized,
            passwordHash,
            emailResult.value,
            effectivePrimary,
            timestamp,
            timestamp,
            isLegacyConverted ? 1 : 0
          );
          const createdUserId = Number(insert?.lastID);
          if (primary) {
            await ready.run(
              `INSERT INTO user_devices (user_id, install_id, created_at, last_seen_at)
               VALUES (?, ?, ?, ?)`,
              createdUserId,
              primary,
              timestamp,
              timestamp
            );
          }
          if (claimedReservationId) {
            await ready.run(
              `UPDATE legacy_username_reservations
               SET claimed_user_id = ?, updated_at = ?
               WHERE id = ?`,
              createdUserId,
              timestamp,
              Number(claimedReservationId)
            );
          }
          return createdUserId;
        },
        { label: "auth-create-user" }
      )
    );
    const user = await findUserById(userId);
    return { ok: true, user };
  } catch (err) {
    const message = String(err?.message || "").toLowerCase();
    if (message.includes("user_devices.install_id") || message.includes("users.primary_install_id")) {
      return { ok: false, error: "device_linked_to_other_account" };
    }
    if (message.includes("unique")) {
      return { ok: false, error: "username_taken" };
    }
    throw err;
  }
}

export async function claimLegacyUser({
  installId,
  password,
  email = null,
}) {
  const ready = await ensureDb();
  const reservation = await findLegacyReservationByInstallId(installId);
  if (!reservation) {
    return { ok: false, error: "legacy_profile_not_found" };
  }
  if (reservation.claimed_user_id) {
    return { ok: false, error: "legacy_profile_already_claimed" };
  }
  const userResult = await createUser({
    usernameDisplay: reservation.username_display,
    password,
    email,
    primaryInstallId: reservation.install_id,
    isLegacyConverted: true,
    claimedReservationId: reservation.id,
    allowedReservationId: reservation.id,
    allowShortUsername: true,
  });
  if (!userResult.ok) return userResult;
  return {
    ok: true,
    user: userResult.user,
    reservation,
  };
}

export async function updatePassword({
  userId,
  newPassword,
  clearMustResetPassword = true,
}) {
  const ready = await ensureDb();
  const passwordResult = validatePassword(newPassword);
  if (!passwordResult.ok) {
    return { ok: false, error: passwordResult.error };
  }
  const passwordHash = await hashPassword(newPassword);
  const timestamp = nowTs();
  await runAuthStatement(
    ready,
    `UPDATE users
     SET password_hash = ?, updated_at = ?, must_reset_password = ?
     WHERE id = ?`,
    passwordHash,
    timestamp,
    clearMustResetPassword ? 0 : 1,
    Number(userId)
  );
  clearSessionLookupCache({ userId });
  return { ok: true };
}

export async function markMustResetPassword(userId, { invalidateSessions = true } = {}) {
  const ready = await ensureDb();
  const timestamp = nowTs();
  await runAuthStatement(
    ready,
    `UPDATE users
     SET must_reset_password = 1, updated_at = ?
     WHERE id = ?`,
    timestamp,
    Number(userId)
  );
  if (invalidateSessions) {
    await runAuthStatement(
      ready,
      `UPDATE user_sessions
       SET invalidated_at = COALESCE(invalidated_at, ?)
       WHERE user_id = ? AND invalidated_at IS NULL`,
      timestamp,
      Number(userId)
    );
  }
  clearSessionLookupCache({ userId });
  return { ok: true };
}

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const AUTH_SESSION_TTL_MS = SESSION_TTL_MS;

const SOCKET_TICKET_TTL_MS = 60 * 1000;
const socketTickets = new Map();

function pruneExpiredSocketTickets() {
  const now = nowTs();
  for (const [ticket, entry] of socketTickets.entries()) {
    if (!entry || Number(entry.expiresAt) <= now) {
      socketTickets.delete(ticket);
    }
  }
}

export async function issueSocketTicket(userId) {
  const safeUserId = Number(userId);
  if (!Number.isInteger(safeUserId) || safeUserId <= 0) return "";
  pruneExpiredSocketTickets();
  const ticket = randomBytes(24).toString("hex");
  socketTickets.set(ticket, {
    userId: safeUserId,
    expiresAt: nowTs() + SOCKET_TICKET_TTL_MS,
  });
  return ticket;
}

export async function consumeSocketTicket(rawTicket) {
  pruneExpiredSocketTickets();
  const ticket = String(rawTicket || "").trim();
  if (!ticket) return null;
  const entry = socketTickets.get(ticket);
  socketTickets.delete(ticket);
  if (!entry || Number(entry.expiresAt) <= nowTs()) return null;
  return await findUserById(entry.userId);
}

export async function createSession(userId) {
  const ready = await ensureDb();
  const token = randomBytes(32).toString("hex");
  const sessionId = randomBytes(16).toString("hex");
  const tokenHash = sha256Hex(token);
  const timestamp = nowTs();
  const expiresAt = timestamp + SESSION_TTL_MS;
  await runAuthStatement(
    ready,
    `INSERT INTO user_sessions
     (id, user_id, token_hash, created_at, last_seen_at, expires_at, invalidated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    sessionId,
    Number(userId),
    tokenHash,
    timestamp,
    timestamp,
    expiresAt
  );
  return { sessionId, token, expiresAt };
}

export async function getSessionByToken(token) {
  const safeToken = String(token || "").trim();
  if (!safeToken) return null;
  const tokenHash = sha256Hex(safeToken);
  const timestamp = nowTs();
  const cached = sessionLookupCache.get(tokenHash);
  if (
    cached?.auth &&
    Number(cached.expiresAt) > timestamp &&
    Number(cached.auth?.session?.expiresAt) > timestamp
  ) {
    if (db) {
      scheduleSessionTouch(
        db,
        cached.auth.session.id,
        Number(cached.auth.session.lastSeenAt) || 0,
        timestamp
      );
    }
    return cached.auth;
  }
  if (cached) sessionLookupCache.delete(tokenHash);

  const inFlight = sessionLookupPromises.get(tokenHash);
  if (inFlight) return await inFlight;

  const lookupGeneration = sessionLookupGeneration;
  const lookupPromise = (async () => {
    const ready = await ensureDb();
    const row = await ready.get(
      `SELECT
          s.id AS session_id,
          s.user_id AS session_user_id,
          s.created_at AS session_created_at,
          s.last_seen_at AS session_last_seen_at,
          s.expires_at AS session_expires_at,
          u.id AS user_id,
          u.username_display,
          u.username_normalized,
          u.password_hash,
          u.email,
          u.primary_install_id,
          u.created_at,
          u.updated_at,
          u.last_login_at,
          u.is_legacy_converted,
          u.must_reset_password
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?
         AND s.invalidated_at IS NULL
         AND s.expires_at > ?
       LIMIT 1`,
      tokenHash,
      timestamp
    );
    if (!row) return null;
    scheduleSessionTouch(ready, row.session_id, Number(row.session_last_seen_at) || 0, timestamp);
    const auth = {
      session: {
        id: row.session_id,
        userId: Number(row.session_user_id),
        createdAt: Number(row.session_created_at) || null,
        lastSeenAt: Number(row.session_last_seen_at) || null,
        expiresAt: Number(row.session_expires_at) || null,
      },
      user: serializeUser(row),
    };
    if (lookupGeneration === sessionLookupGeneration) {
      sessionLookupCache.delete(tokenHash);
      sessionLookupCache.set(tokenHash, {
        auth,
        expiresAt: nowTs() + SESSION_LOOKUP_CACHE_TTL_MS,
      });
      pruneSessionLookupCache();
    }
    return auth;
  })().finally(() => {
    if (sessionLookupPromises.get(tokenHash) === lookupPromise) {
      sessionLookupPromises.delete(tokenHash);
    }
  });

  sessionLookupPromises.set(tokenHash, lookupPromise);
  return await lookupPromise;
}

export async function invalidateSessionByToken(token) {
  const ready = await ensureDb();
  const safeToken = String(token || "").trim();
  if (!safeToken) return false;
  const timestamp = nowTs();
  const tokenHash = sha256Hex(safeToken);
  const result = await runAuthStatement(
    ready,
    `UPDATE user_sessions
     SET invalidated_at = COALESCE(invalidated_at, ?)
     WHERE token_hash = ? AND invalidated_at IS NULL`,
    timestamp,
    tokenHash
  );
  clearSessionLookupCache({ tokenHash });
  return Number(result?.changes) > 0;
}

export async function invalidateSessionsForUser(userId, { exceptSessionId = null } = {}) {
  const ready = await ensureDb();
  const timestamp = nowTs();
  if (exceptSessionId) {
    await runAuthStatement(
      ready,
      `UPDATE user_sessions
       SET invalidated_at = COALESCE(invalidated_at, ?)
       WHERE user_id = ? AND invalidated_at IS NULL AND id <> ?`,
      timestamp,
      Number(userId),
      String(exceptSessionId)
    );
    clearSessionLookupCache({ userId });
    return true;
  }
  await runAuthStatement(
    ready,
    `UPDATE user_sessions
     SET invalidated_at = COALESCE(invalidated_at, ?)
     WHERE user_id = ? AND invalidated_at IS NULL`,
    timestamp,
    Number(userId)
  );
  clearSessionLookupCache({ userId });
  return true;
}

export async function authenticateUser(rawUsername, password) {
  const ready = await ensureDb();
  const usernameNormalized = normalizeUsername(rawUsername);
  if (!usernameNormalized) return { ok: false, error: "invalid_credentials" };
  const row = await ready.get(
    `SELECT *
     FROM users
     WHERE username_normalized = ?`,
    usernameNormalized
  );
  if (!row) return { ok: false, error: "invalid_credentials" };
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return { ok: false, error: "invalid_credentials" };
  const user = serializeUser(row);
  await touchUserLastLogin(user.id);
  return { ok: true, user: await findUserById(user.id) };
}

export async function verifyUserPassword(userId, password) {
  const ready = await ensureDb();
  const row = await ready.get(
    `SELECT password_hash
     FROM users
     WHERE id = ?`,
    Number(userId)
  );
  if (!row?.password_hash) return false;
  return await verifyPassword(password, row.password_hash);
}

export async function findUserForAdmin({ userId = null, username = "" } = {}) {
  if (Number(userId) > 0) {
    return await findUserById(Number(userId));
  }
  if (username) {
    return await findUserByUsername(username);
  }
  return null;
}
