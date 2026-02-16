import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = path.join(__dirname, "../data");
const DATA_DIR = process.env.GOBBLE_DATA_DIR
  ? path.resolve(process.env.GOBBLE_DATA_DIR)
  : DEFAULT_DATA_DIR;
const DATA_PATH = path.join(DATA_DIR, "admin-broadcast.json");

const MAX_ID_LEN = 80;
const MAX_TITLE_LEN = 140;
const MAX_BODY_LEN = 5000;
const MAX_CTA_LABEL_LEN = 40;
const MAX_CTA_URL_LEN = 500;

let state = {
  message: null,
  updatedAt: 0,
};
let loadPromise = null;

function sanitizeText(value, maxLen = 0) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  if (!Number.isFinite(maxLen) || maxLen <= 0) return text;
  return text.slice(0, maxLen);
}

function sanitizeId(value) {
  const text = sanitizeText(value, MAX_ID_LEN);
  if (!text) return "";
  const safe = text.replace(/[^a-zA-Z0-9:_-]/g, "-");
  return safe.slice(0, MAX_ID_LEN);
}

function sanitizeUrl(value) {
  const text = sanitizeText(value, MAX_CTA_URL_LEN);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return parsed.toString();
  } catch (_) {
    return "";
  }
}

function parseDateTs(value) {
  if (value == null || value === "") return null;
  const ts = Date.parse(String(value));
  if (!Number.isFinite(ts)) return NaN;
  return ts;
}

function serializeMessage(message) {
  if (!message || typeof message !== "object") return null;
  return {
    id: message.id || "",
    title: message.title || "",
    body: message.body || "",
    scope: message.scope || "lobby",
    ctaLabel: message.ctaLabel || "",
    ctaUrl: message.ctaUrl || "",
    dismissible: message.dismissible !== false,
    enabled: message.enabled !== false,
    startAt: Number.isFinite(message.startAtTs) ? new Date(message.startAtTs).toISOString() : null,
    endAt: Number.isFinite(message.endAtTs) ? new Date(message.endAtTs).toISOString() : null,
    createdAt: Number.isFinite(message.createdAt) ? new Date(message.createdAt).toISOString() : null,
    updatedAt: Number.isFinite(message.updatedAt) ? new Date(message.updatedAt).toISOString() : null,
  };
}

function isMessageActive(message, nowTs = Date.now()) {
  if (!message || typeof message !== "object") return false;
  if (message.enabled === false) return false;
  if (Number.isFinite(message.startAtTs) && nowTs < message.startAtTs) return false;
  if (Number.isFinite(message.endAtTs) && nowTs > message.endAtTs) return false;
  return true;
}

function normalizeLoadedState(payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const rawMessage = raw.message && typeof raw.message === "object" ? raw.message : null;
  const normalizedMessage = rawMessage
    ? {
        id: sanitizeId(rawMessage.id) || `msg-${Date.now()}`,
        title: sanitizeText(rawMessage.title, MAX_TITLE_LEN),
        body: sanitizeText(rawMessage.body, MAX_BODY_LEN),
        scope: rawMessage.scope === "lobby" ? "lobby" : "lobby",
        ctaLabel: sanitizeText(rawMessage.ctaLabel, MAX_CTA_LABEL_LEN),
        ctaUrl: sanitizeUrl(rawMessage.ctaUrl),
        dismissible: rawMessage.dismissible !== false,
        enabled: rawMessage.enabled !== false,
        startAtTs: Number.isFinite(rawMessage.startAtTs) ? rawMessage.startAtTs : null,
        endAtTs: Number.isFinite(rawMessage.endAtTs) ? rawMessage.endAtTs : null,
        createdAt: Number.isFinite(rawMessage.createdAt) ? rawMessage.createdAt : Date.now(),
        updatedAt: Number.isFinite(rawMessage.updatedAt) ? rawMessage.updatedAt : Date.now(),
      }
    : null;
  return {
    message: normalizedMessage,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
  };
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const cleaned = raw.length > 0 && raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    return JSON.parse(cleaned);
  } catch (_) {
    return null;
  }
}

async function atomicWriteJson(filePath, payload) {
  const json = JSON.stringify(payload, null, 2);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, json, "utf8");
  try {
    await fs.rename(tmpPath, filePath);
  } catch (_) {
    try {
      await fs.unlink(filePath);
    } catch (_) {}
    await fs.rename(tmpPath, filePath);
  }
}

async function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = (async () => {
      const payload = await readJson(DATA_PATH);
      state = normalizeLoadedState(payload);
      return state;
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}

async function saveState() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  state.updatedAt = Date.now();
  await atomicWriteJson(DATA_PATH, state);
}

export async function getBroadcastAdminState() {
  await ensureLoaded();
  const message = serializeMessage(state.message);
  return {
    message,
    active: !!(state.message && isMessageActive(state.message)),
    updatedAt: Number.isFinite(state.updatedAt) ? new Date(state.updatedAt).toISOString() : null,
  };
}

export async function getActiveBroadcast() {
  await ensureLoaded();
  if (!state.message || !isMessageActive(state.message)) return null;
  return serializeMessage(state.message);
}

export async function setBroadcastMessage(input = {}) {
  await ensureLoaded();
  const title = sanitizeText(input?.title, MAX_TITLE_LEN);
  const body = sanitizeText(input?.body, MAX_BODY_LEN);
  if (!title && !body) {
    return { ok: false, error: "missing_content" };
  }
  const startAtTs = parseDateTs(input?.startAt);
  const endAtTs = parseDateTs(input?.endAt);
  if (Number.isNaN(startAtTs) || Number.isNaN(endAtTs)) {
    return { ok: false, error: "invalid_date" };
  }
  if (
    Number.isFinite(startAtTs) &&
    Number.isFinite(endAtTs) &&
    endAtTs < startAtTs
  ) {
    return { ok: false, error: "invalid_range" };
  }

  const now = Date.now();
  const current = state.message && typeof state.message === "object" ? state.message : null;
  const next = {
    id: sanitizeId(input?.id) || current?.id || `msg-${now}`,
    title,
    body,
    scope: input?.scope === "lobby" ? "lobby" : "lobby",
    ctaLabel: sanitizeText(input?.ctaLabel, MAX_CTA_LABEL_LEN),
    ctaUrl: sanitizeUrl(input?.ctaUrl),
    dismissible: input?.dismissible !== false,
    enabled: input?.enabled !== false,
    startAtTs: Number.isFinite(startAtTs) ? startAtTs : null,
    endAtTs: Number.isFinite(endAtTs) ? endAtTs : null,
    createdAt: Number.isFinite(current?.createdAt) ? current.createdAt : now,
    updatedAt: now,
  };

  state.message = next;
  await saveState();
  return {
    ok: true,
    message: serializeMessage(next),
    active: isMessageActive(next),
  };
}

export async function clearBroadcastMessage() {
  await ensureLoaded();
  state.message = null;
  await saveState();
  return { ok: true };
}

