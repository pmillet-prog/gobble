const STORAGE_PREFIX = "gobble_duel_objective_anims_v1";

function normalizeInstallId(rawInstallId) {
  return typeof rawInstallId === "string" ? rawInstallId.trim() : "";
}

function normalizeDateId(rawDateId) {
  return typeof rawDateId === "string" ? rawDateId.trim() : "";
}

function normalizeKeys(rawKeys) {
  if (!Array.isArray(rawKeys)) return [];
  const out = [];
  const seen = new Set();
  rawKeys.forEach((key) => {
    const safeKey = String(key || "").trim();
    if (!safeKey || seen.has(safeKey)) return;
    seen.add(safeKey);
    out.push(safeKey);
  });
  return out;
}

function normalizeViewState(rawViewState, dateId) {
  const keys = normalizeKeys(rawViewState?.keys);
  return {
    dateId,
    keys,
  };
}

function normalizeState(rawState, dateId) {
  return {
    popup: normalizeViewState(rawState?.popup, dateId),
    page: normalizeViewState(rawState?.page, dateId),
  };
}

function getStorageKey(installId, dateId) {
  const safeInstallId = normalizeInstallId(installId);
  const safeDateId = normalizeDateId(dateId);
  if (!safeInstallId || !safeDateId) return "";
  return `${STORAGE_PREFIX}:${safeInstallId}:${safeDateId}`;
}

export function readDuelObjectiveAnimationsState(installId, dateId) {
  const key = getStorageKey(installId, dateId);
  if (!key || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return normalizeState(parsed, normalizeDateId(dateId));
  } catch (_) {
    return null;
  }
}

export function writeDuelObjectiveAnimationsState(installId, dateId, state) {
  const key = getStorageKey(installId, dateId);
  if (!key || typeof localStorage === "undefined") return;
  try {
    const payload = normalizeState(state, normalizeDateId(dateId));
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (_) {}
}

