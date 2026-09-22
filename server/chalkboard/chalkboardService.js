import { constants as cryptoConstants, publicEncrypt, randomUUID } from "crypto";
import { CHALKBOARD_BOARD, normalizeChalkboardFont } from "../../shared/chalkboardRules.js";
import { CHALKBOARD_LIMITS, chalkboardDraftFits } from "../../shared/chalkboardLimits.js";
import { chalkboardFontCatalog } from "./chalkboardFontCatalog.js";
import { getChalkboardTextHeight, normalizeChalkboardLineBreaks, normalizeChalkboardTextColor } from "../../shared/chalkboardText.js";
import { erasuresFitBudget, normalizeChalkboardErasure } from "../../shared/chalkboardErasure.js";
import { prepareChalkboardCleanup, prepareChalkboardErasures } from "./chalkboardErasure.js";

export const CHALKBOARD_BOARDS = Object.freeze([CHALKBOARD_BOARD]);
export const CHALKBOARD_WORLD = Object.freeze({ width: 24000, height: 1000 });

const BOARD_ALIASES = new Set([CHALKBOARD_BOARD, "feedback"]);
const MAX_POINTS_PER_STROKE = CHALKBOARD_LIMITS.maxStrokePoints;
const MAX_TEXT_LENGTH = 280;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const MAX_UNDO_ENTRIES = 64;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundCoordinate(value, max) {
  return Math.round(clamp(finiteNumber(value), 0, max) * 10) / 10;
}

function getParisDateParts(nowMs) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

export function getChalkboardWeekId(nowMs = Date.now()) {
  const { year, month, day } = getParisDateParts(nowMs);
  const localDate = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);
  return localDate.toISOString().slice(0, 10);
}

function normalizeBoard(value) {
  const board = String(value || "").trim().toLowerCase();
  return BOARD_ALIASES.has(board) ? CHALKBOARD_BOARD : "";
}

function normalizeAngle(value) {
  const fullTurn = Math.PI * 2;
  let angle = finiteNumber(value, 0) % fullTurn;
  if (angle > Math.PI) angle -= fullTurn;
  if (angle < -Math.PI) angle += fullTurn;
  return Math.round(angle * 10000) / 10000;
}

function normalizeStroke(raw, index) {
  const points = Array.isArray(raw?.points)
    ? raw.points.slice(0, MAX_POINTS_PER_STROKE).map((point) => ({
        x: roundCoordinate(point?.x, CHALKBOARD_WORLD.width),
        y: roundCoordinate(point?.y, CHALKBOARD_WORLD.height),
        p: Math.round(clamp(finiteNumber(point?.p, 0.5), 0, 1) * 100) / 100,
      }))
    : [];
  if (points.length < 2) return null;
  return {
    type: "stroke",
    id: String(raw?.id || `stroke-${index}`).slice(0, 80),
    seed: Math.trunc(finiteNumber(raw?.seed, index + 1)) >>> 0,
    color: COLOR_PATTERN.test(String(raw?.color || ""))
      ? String(raw.color).toLowerCase()
      : "#f4f0df",
    size: Math.round(clamp(finiteNumber(raw?.size, 10), 2, 42) * 10) / 10,
    points,
  };
}

function normalizeText(raw, index, fontIds) {
  const text = String(raw?.text || "").toLocaleUpperCase("fr-FR").normalize("NFD")
    .replace(/\p{M}/gu, "").replace(/Œ/g, "OE").replace(/Æ/g, "AE")
    .replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
  if (!text) return null;
  return {
    type: "text",
    id: String(raw?.id || `text-${index}`).slice(0, 80),
    seed: Math.trunc(finiteNumber(raw?.seed, index + 1)) >>> 0,
    text,
    ...(Array.isArray(raw?.lineBreaks) ? { lineBreaks: normalizeChalkboardLineBreaks(text, raw.lineBreaks) } : {}),
    ...(Array.isArray(raw?.paragraphBreaks) ? { paragraphBreaks: normalizeChalkboardLineBreaks(text, raw.paragraphBreaks) } : {}),
    font: normalizeChalkboardFont(raw?.font, fontIds),
    color: normalizeChalkboardTextColor(raw?.color),
    cx: roundCoordinate(raw?.cx, CHALKBOARD_WORLD.width),
    cy: roundCoordinate(raw?.cy, CHALKBOARD_WORLD.height),
    width: Math.round(clamp(finiteNumber(raw?.width, 120), 18, 1600) * 10) / 10,
    fontSize: Math.round(clamp(finiteNumber(raw?.fontSize, 64), 24, 150) * 10) / 10,
    scale: Math.round(clamp(finiteNumber(raw?.scale, 1), 0.3, 4) * 1000) / 1000,
    angle: normalizeAngle(raw?.angle),
  };
}

function getElementBounds(element) {
  if (element.type === "stroke") {
    const radius = element.size * 1.6;
    let minX = CHALKBOARD_WORLD.width;
    let minY = CHALKBOARD_WORLD.height;
    let maxX = 0;
    let maxY = 0;
    for (const point of element.points) {
      minX = Math.min(minX, point.x - radius);
      minY = Math.min(minY, point.y - radius);
      maxX = Math.max(maxX, point.x + radius);
      maxY = Math.max(maxY, point.y + radius);
    }
    return { minX, minY, maxX, maxY };
  }
  const halfWidth = (element.width * element.scale) / 2;
  const halfHeight = (getChalkboardTextHeight(element) * element.scale) / 2;
  const cos = Math.abs(Math.cos(element.angle));
  const sin = Math.abs(Math.sin(element.angle));
  const extentX = halfWidth * cos + halfHeight * sin + 10;
  const extentY = halfWidth * sin + halfHeight * cos + 10;
  return {
    minX: element.cx - extentX,
    minY: element.cy - extentY,
    maxX: element.cx + extentX,
    maxY: element.cy + extentY,
  };
}

function mergeBounds(bounds, next) {
  if (!bounds) return { ...next };
  return {
    minX: Math.min(bounds.minX, next.minX),
    minY: Math.min(bounds.minY, next.minY),
    maxX: Math.max(bounds.maxX, next.maxX),
    maxY: Math.max(bounds.maxY, next.maxY),
  };
}

function normalizeIntervention(raw, fontIds) {
  const source = raw && typeof raw === "object" ? raw : {};
  const sourceElements = Array.isArray(source.elements) ? source.elements : [];
  const elements = [];
  let bounds = null;
  for (let index = 0; index < sourceElements.length; index += 1) {
    const rawElement = sourceElements[index];
    const element =
      rawElement?.type === "stroke"
        ? normalizeStroke(rawElement, index)
        : rawElement?.type === "text"
        ? normalizeText(rawElement, index, fontIds)
        : rawElement?.type === "erase" && elements.length
        ? normalizeChalkboardErasure(rawElement)
        : null;
    if (!element) continue;
    elements.push(element);
    if (element.type !== "erase") bounds = mergeBounds(bounds, getElementBounds(element));
  }
  if (!elements.length || !bounds) return { ok: false, error: "empty_intervention" };
  return {
    ok: true,
    intervention: {
      elements,
      bounds: {
        minX: roundCoordinate(bounds.minX, CHALKBOARD_WORLD.width),
        minY: roundCoordinate(bounds.minY, CHALKBOARD_WORLD.height),
        maxX: roundCoordinate(bounds.maxX, CHALKBOARD_WORLD.width),
        maxY: roundCoordinate(bounds.maxY, CHALKBOARD_WORLD.height),
      },
    },
  };
}

function resolveAuditPublicKey(explicitKey) {
  const raw = String(explicitKey || process.env.GOBBLE_CHALKBOARD_AUDIT_PUBLIC_KEY || "").trim();
  if (!raw) return "";
  if (raw.includes("BEGIN PUBLIC KEY")) return raw.replace(/\\n/g, "\n");
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return decoded.includes("BEGIN PUBLIC KEY") ? decoded : "";
  } catch (_) {
    return "";
  }
}

function sealAuditIdentity(publicKey, identity, interventionId, createdAt) {
  if (!publicKey || !identity?.userId) return null;
  try {
    const payload = Buffer.from(
      JSON.stringify({
        userId: Number(identity.userId),
        interventionId,
        createdAt,
      }),
      "utf8"
    );
    return publicEncrypt(
      {
        key: publicKey,
        oaepHash: "sha256",
        padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING,
      },
      payload
    ).toString("base64");
  } catch (error) {
    console.warn("[chalkboard] audit identity sealing failed", error?.message || error);
    return null;
  }
}

function toPublicIntervention(entry, identity) {
  return {
    id: entry.id,
    board: entry.board,
    createdAt: entry.createdAt,
    z: entry.z,
    bounds: entry.bounds,
    elements: entry.elements,
    canErase: !!identity?.userId && entry.ownerId === String(identity.userId),
  };
}

export function createChalkboardService({ now = () => Date.now(), auditPublicKey = "", fontCatalog = chalkboardFontCatalog } = {}) {
  const publicKey = resolveAuditPublicKey(auditPublicKey);
  let weekId = getChalkboardWeekId(now());
  let revision = 0;
  let zSequence = 0;
  const boards = new Map(CHALKBOARD_BOARDS.map((board) => [board, []]));
  // One reversible deletion per authenticated moderator and board. Keep the
  // original sealed identity, timestamp and z-order; never republish a copy.
  const lastDeletions = new Map();
  const undoKey = (board, identity) => identity?.userId ? `${identity.userId}:${board}` : "";

  function ensureCurrentWeek() {
    const currentWeekId = getChalkboardWeekId(now());
    if (currentWeekId === weekId) return;
    weekId = currentWeekId;
    revision += 1;
    zSequence = 0;
    lastDeletions.clear();
    for (const board of CHALKBOARD_BOARDS) boards.set(board, []);
  }

  function getSnapshot(boardValue, identity) {
    ensureCurrentWeek();
    const board = normalizeBoard(boardValue);
    if (!board) return { ok: false, error: "invalid_board" };
    return {
      ok: true,
      board,
      weekId,
      revision,
      world: CHALKBOARD_WORLD,
      interventions: boards.get(board).map(entry => toPublicIntervention(entry, identity)),
    };
  }

  function addIntervention(boardValue, raw, identity) {
    ensureCurrentWeek();
    const board = normalizeBoard(boardValue);
    if (!board) return { ok: false, error: "invalid_board" };
    const sourceElements = Array.isArray(raw?.elements) ? raw.elements : [];
    const hasErasures = sourceElements.some(element => element?.type === "erase") || !!raw?.removeIds?.length;
    if (hasErasures && raw.weekId !== weekId) return { ok: false, error: "stale_week" };
    if (hasErasures && !erasuresFitBudget(sourceElements)) return { ok: false, error: "erasure_limit" };
    if (!chalkboardDraftFits(sourceElements)) return { ok: false, error: "drawing_limit" };
    const cleanup = prepareChalkboardCleanup(boards.get(board), raw?.removeIds, identity);
    if (!cleanup.ok) return cleanup;
    const erasures = prepareChalkboardErasures(boards.get(board), sourceElements, identity, cleanup.removals);
    if (!erasures.ok) return erasures;
    const normalized = normalizeIntervention(raw, fontCatalog.getFonts().map(font => font.id));
    if (!normalized.ok && !hasErasures) return normalized;
    if (!normalized.ok && !erasures.updates.size && !cleanup.removals.size) return { ok: true, ...getSnapshot(board, identity), intervention: null };
    if (erasures.updates.size || cleanup.removals.size) boards.set(board, boards.get(board)
      .filter(entry => !cleanup.removals.has(entry))
      .map(entry => erasures.updates.has(entry) ? { ...entry, elements: erasures.updates.get(entry) } : entry));
    if (!normalized.ok) {
      revision += 1;
      return { ...getSnapshot(board, identity), intervention: null };
    }
    const id = randomUUID();
    const createdAt = now();
    const entry = {
      id,
      board,
      createdAt,
      z: ++zSequence,
      ...normalized.intervention,
      authorSeal: sealAuditIdentity(publicKey, identity, id, createdAt),
      ownerId: identity?.userId ? String(identity.userId) : null,
    };
    boards.get(board).push(entry);
    revision += 1;
    return {
      ok: true,
      weekId,
      revision,
      ...(hasErasures ? getSnapshot(board, identity) : {}),
      intervention: toPublicIntervention(entry, identity),
    };
  }

  function deleteIntervention(idValue, identity) {
    ensureCurrentWeek();
    const id = String(idValue || "").trim();
    if (!id) return { ok: false, error: "invalid_intervention" };
    for (const board of CHALKBOARD_BOARDS) {
      const entries = boards.get(board);
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) continue;
      const [entry] = entries.splice(index, 1);
      const key = undoKey(board, identity);
      if (key) {
        lastDeletions.delete(key);
        lastDeletions.set(key, entry);
        while (lastDeletions.size > MAX_UNDO_ENTRIES) lastDeletions.delete(lastDeletions.keys().next().value);
      }
      revision += 1;
      return { ok: true, board, weekId, revision, deletedId: id };
    }
    return { ok: false, error: "not_found" };
  }

  function canUndoDeletion(boardValue, identity) {
    ensureCurrentWeek();
    return lastDeletions.has(undoKey(normalizeBoard(boardValue), identity));
  }

  function undoLastDeletion(boardValue, identity) {
    ensureCurrentWeek();
    const board = normalizeBoard(boardValue);
    if (!board) return { ok: false, error: "invalid_board" };
    const key = undoKey(board, identity);
    const entry = lastDeletions.get(key);
    if (!entry) return { ok: false, error: "undo_not_available" };
    const entries = boards.get(board);
    const index = entries.findIndex(other => other.z > entry.z);
    entries.splice(index < 0 ? entries.length : index, 0, entry);
    lastDeletions.delete(key);
    revision += 1;
    return { ok: true, board, weekId, revision, intervention: toPublicIntervention(entry, identity) };
  }

  function exportSealedAudit() {
    ensureCurrentWeek();
    return {
      weekId,
      entries: CHALKBOARD_BOARDS.flatMap((board) =>
        boards
          .get(board)
          .filter((entry) => entry.authorSeal)
          .map((entry) => ({ id: entry.id, board, createdAt: entry.createdAt, seal: entry.authorSeal }))
      ),
    };
  }

  // Internal persistence only: never expose account ownership through HTTP.
  // Entries are immutable, so a before-state can be restored if a commit fails.
  function exportState() {
    return { version: 1, weekId, revision, zSequence, boards: Object.fromEntries([...boards].map(([board, entries]) => [board, [...entries]])), lastDeletions: [...lastDeletions] };
  }

  function restoreState(state) {
    if (!state || state.version !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(state.weekId) || !Number.isSafeInteger(state.revision) || !Number.isSafeInteger(state.zSequence) || !Array.isArray(state.boards?.[CHALKBOARD_BOARD])) throw new Error("invalid_chalkboard_state");
    weekId = state.weekId;
    revision = state.revision;
    zSequence = state.zSequence;
    for (const board of CHALKBOARD_BOARDS) boards.set(board, [...state.boards[board]]);
    lastDeletions.clear();
    for (const [key, entry] of state.lastDeletions || []) lastDeletions.set(key, entry);
  }

  return {
    addIntervention,
    canUndoDeletion,
    deleteIntervention,
    undoLastDeletion,
    exportSealedAudit,
    getSnapshot,
    exportState,
    restoreState,
    getFonts: fontCatalog.getFonts,
  };
}
