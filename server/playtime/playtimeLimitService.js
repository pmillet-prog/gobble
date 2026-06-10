import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const PARIS_TIME_ZONE = "Europe/Paris";
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_LIMIT_MS = 12 * HOUR_MS;
const MIN_LIMIT_MS = 5 * MINUTE_MS;

let dataFilePath = "";
const limitsByUserId = new Map();

function normalizeUserId(userId) {
  const safe = Number(userId);
  return Number.isInteger(safe) && safe > 0 ? String(safe) : "";
}

function clampLimitMs(limitMs) {
  const safe = Math.round(Number(limitMs) || 0);
  if (!Number.isFinite(safe)) return 0;
  return Math.max(MIN_LIMIT_MS, Math.min(MAX_LIMIT_MS, safe));
}

function getParisDayId(at = Date.now()) {
  try {
    const parts = new Intl.DateTimeFormat("fr-CA", {
      timeZone: PARIS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(at));
    const get = (type) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch (_) {
    return new Date(at).toISOString().slice(0, 10);
  }
}

function normalizeEntry(raw, now = Date.now()) {
  const userId = normalizeUserId(raw?.userId);
  if (!userId) return null;
  const limitMs = clampLimitMs(raw?.limitMs);
  const dayId = String(raw?.dayId || getParisDayId(now));
  const usedMs = Math.max(0, Math.round(Number(raw?.usedMs) || 0));
  const createdAt = Math.max(0, Math.round(Number(raw?.createdAt) || now));
  const updatedAt = Math.max(createdAt, Math.round(Number(raw?.updatedAt) || now));
  const username = String(raw?.username || "").trim().slice(0, 80);
  return {
    userId,
    username,
    dayId,
    limitMs,
    usedMs: Math.min(usedMs, limitMs),
    createdAt,
    updatedAt,
  };
}

function isEntryForToday(entry, now = Date.now()) {
  const today = getParisDayId(now);
  if (!entry || entry.dayId !== today) return false;
  return getParisDayId(entry.createdAt) === today;
}

function toPublicStatus(entry, now = Date.now()) {
  if (!entry) {
    return {
      active: false,
      serverNow: now,
      dayId: getParisDayId(now),
      limitMs: 0,
      usedMs: 0,
      remainingMs: null,
      exhausted: false,
    };
  }
  if (!isEntryForToday(entry, now)) {
    return toPublicStatus(null, now);
  }
  const normalized = entry;
  const remainingMs = Math.max(0, normalized.limitMs - normalized.usedMs);
  return {
    active: true,
    userId: Number(normalized.userId),
    username: normalized.username || "",
    serverNow: now,
    dayId: normalized.dayId,
    limitMs: normalized.limitMs,
    usedMs: normalized.usedMs,
    remainingMs,
    exhausted: remainingMs <= 0,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
  };
}

function persist() {
  if (!dataFilePath) return;
  try {
    mkdirSync(path.dirname(dataFilePath), { recursive: true });
    const now = Date.now();
    const limits = Array.from(limitsByUserId.values()).filter((entry) =>
      isEntryForToday(entry, now)
    );
    writeFileSync(
      dataFilePath,
      JSON.stringify({ version: 1, updatedAt: Date.now(), limits }, null, 2),
      "utf8"
    );
  } catch (err) {
    console.warn("[playtime] save failed", err?.message || err);
  }
}

export function initPlaytimeLimitService({ dataDir } = {}) {
  dataFilePath = path.join(dataDir || path.join(process.cwd(), "data"), "playtime-limits.json");
  limitsByUserId.clear();
  try {
    const raw = readFileSync(dataFilePath, "utf8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.limits) ? parsed.limits : [];
    const now = Date.now();
    for (const rawEntry of list) {
      const entry = normalizeEntry(rawEntry, now);
      if (entry && isEntryForToday(entry, now)) {
        limitsByUserId.set(entry.userId, entry);
      }
    }
  } catch (_) {}
}

export function getPlaytimeLimitStatus(userId, now = Date.now()) {
  const key = normalizeUserId(userId);
  if (!key) return toPublicStatus(null, now);
  const entry = limitsByUserId.get(key);
  if (!entry) return toPublicStatus(null, now);
  if (!isEntryForToday(entry, now)) {
    limitsByUserId.delete(key);
    persist();
    return toPublicStatus(null, now);
  }
  return toPublicStatus(entry, now);
}

export function setPlaytimeLimit({ userId, username = "", limitMs }) {
  const key = normalizeUserId(userId);
  if (!key) return { ok: false, error: "invalid_user" };
  const now = Date.now();
  const existing = limitsByUserId.get(key);
  if (existing) {
    if (isEntryForToday(existing, now)) {
      return { ok: false, error: "already_active" };
    }
    limitsByUserId.delete(key);
    persist();
  }
  const entry = normalizeEntry(
    {
      userId: key,
      username,
      limitMs,
      dayId: getParisDayId(now),
      usedMs: 0,
      createdAt: now,
      updatedAt: now,
    },
    now
  );
  if (!entry) return { ok: false, error: "invalid_limit" };
  limitsByUserId.set(key, entry);
  persist();
  return { ok: true, status: toPublicStatus(entry, now) };
}

export function addPlaytimeUsage({ userId, deltaMs, username = "" }) {
  const key = normalizeUserId(userId);
  if (!key) return { ok: false, error: "invalid_user" };
  const existing = limitsByUserId.get(key);
  if (!existing) return { ok: true, status: toPublicStatus(null) };
  const now = Date.now();
  if (!isEntryForToday(existing, now)) {
    limitsByUserId.delete(key);
    persist();
    return { ok: true, status: toPublicStatus(null, now) };
  }
  const safeDelta = Math.max(0, Math.min(5 * MINUTE_MS, Math.round(Number(deltaMs) || 0)));
  const next = {
    ...existing,
    username: String(username || existing.username || "").trim().slice(0, 80),
    usedMs: Math.min(existing.limitMs, existing.usedMs + safeDelta),
    updatedAt: now,
  };
  limitsByUserId.set(key, next);
  persist();
  return { ok: true, status: toPublicStatus(next, now) };
}

export function clearPlaytimeLimit(userId) {
  const key = normalizeUserId(userId);
  if (!key) return { ok: false, error: "invalid_user" };
  const removed = limitsByUserId.delete(key);
  if (removed) persist();
  return { ok: true, removed };
}

export function listActivePlaytimeLimits() {
  const now = Date.now();
  return Array.from(limitsByUserId.values())
    .map((entry) => toPublicStatus(entry, now))
    .filter((entry) => entry.active)
    .sort((a, b) =>
      String(a.username || "").localeCompare(String(b.username || ""), "fr", {
        sensitivity: "base",
      })
    );
}

export function buildPlaytimeBlockedResponse(status) {
  return {
    ok: false,
    error: "playtime_limit_exhausted",
    message:
      "Ton contrôle de temps est arrivé à zéro. Le live sera de nouveau accessible demain.",
    playtimeLimit: status,
  };
}
