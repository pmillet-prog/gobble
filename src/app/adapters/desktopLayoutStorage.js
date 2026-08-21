export const GRID_COL_TEMPLATE = "1.05fr 1.6fr 0.85fr 1.05fr";
export const DESKTOP_COLUMN_DEFAULT_FRACTIONS = [1.05, 1.6, 0.85, 1.05];
export const DESKTOP_COLUMN_MIN_WIDTHS_PX = [220, 340, 260, 260];
export const DAILY_DESKTOP_COLUMN_TEMPLATE = "1.05fr 1.6fr 1.6fr";
export const DAILY_DESKTOP_COLUMN_DEFAULT_FRACTIONS = [1.05, 1.6, 1.6];
export const DAILY_DESKTOP_COLUMN_MIN_WIDTHS_PX = [220, 340, 380];
export const LIVE_DESKTOP_COLUMN_DEFS = [
  { id: "players", defaultFraction: 1.05, minWidthPx: 220 },
  { id: "grid", defaultFraction: 1.6, minWidthPx: 340 },
  { id: "side", defaultFraction: 0.85, minWidthPx: 260 },
  { id: "chat", defaultFraction: 1.05, minWidthPx: 260 },
];
export const DAILY_DESKTOP_COLUMN_DEFS = [
  { id: "players", defaultFraction: 1.05, minWidthPx: 220 },
  { id: "grid", defaultFraction: 1.6, minWidthPx: 340 },
  { id: "side", defaultFraction: 1.6, minWidthPx: 380 },
];

const RESIZE_STORAGE_PREFIX = "gobble_desktop_cols_v1";
const ORDER_STORAGE_PREFIX = "gobble_desktop_order_v1";

export function normalizeDesktopColumnFractions(
  rawFractions,
  defaultFractions = DESKTOP_COLUMN_DEFAULT_FRACTIONS
) {
  const safeDefaults =
    Array.isArray(defaultFractions) && defaultFractions.length > 0
      ? defaultFractions
      : DESKTOP_COLUMN_DEFAULT_FRACTIONS;
  const source = Array.isArray(rawFractions) ? rawFractions : safeDefaults;
  const safe = safeDefaults.map((fallback, index) => {
    const value = Number(source[index]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  });
  const sum = safe.reduce((total, value) => total + value, 0);
  return Number.isFinite(sum) && sum > 0
    ? safe.map((value) => value / sum)
    : [...safeDefaults];
}

export function areDesktopFractionsEqual(a, b, epsilon = 0.0005) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every(
    (value, index) =>
      Math.abs((Number(value) || 0) - (Number(b[index]) || 0)) <= epsilon
  );
}

export function normalizeDesktopColumnOrder(rawOrder, defs = LIVE_DESKTOP_COLUMN_DEFS) {
  const safeDefs = Array.isArray(defs) && defs.length ? defs : LIVE_DESKTOP_COLUMN_DEFS;
  const allowed = safeDefs.map((entry) => String(entry?.id || "").trim()).filter(Boolean);
  const requested = Array.isArray(rawOrder) ? rawOrder : [];
  const seen = new Set();
  const order = [];
  for (const rawId of requested) {
    const id = String(rawId || "").trim();
    if (!id || seen.has(id) || !allowed.includes(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const id of allowed) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
}

function storageKey(prefix, installId, storageScope) {
  const id = String(installId || "").trim();
  const scope = String(storageScope || "live").trim() || "live";
  return id ? `${prefix}:${scope}:${id}` : "";
}

export function readDesktopColumnOrderForInstall(installId, storageScope, defs) {
  const fallback = () => normalizeDesktopColumnOrder(null, defs);
  if (typeof localStorage === "undefined") return fallback();
  const key = storageKey(ORDER_STORAGE_PREFIX, installId, storageScope);
  if (!key) return fallback();
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalizeDesktopColumnOrder(JSON.parse(raw), defs) : fallback();
  } catch (_) {
    return fallback();
  }
}

export function writeDesktopColumnOrderForInstall(installId, storageScope, order, defs) {
  if (typeof localStorage === "undefined") return;
  const key = storageKey(ORDER_STORAGE_PREFIX, installId, storageScope);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(normalizeDesktopColumnOrder(order, defs)));
  } catch (_) {}
}

export function readDesktopColumnFractionsForInstall(
  installId,
  storageScope,
  defaultFractions
) {
  const fallback = () =>
    normalizeDesktopColumnFractions(defaultFractions, defaultFractions);
  if (typeof localStorage === "undefined") return fallback();
  const key = storageKey(RESIZE_STORAGE_PREFIX, installId, storageScope);
  if (!key) return fallback();
  try {
    const raw = localStorage.getItem(key);
    return raw
      ? normalizeDesktopColumnFractions(JSON.parse(raw), defaultFractions)
      : fallback();
  } catch (_) {
    return fallback();
  }
}

export function writeDesktopColumnFractionsForInstall(
  installId,
  storageScope,
  fractions,
  defaultFractions
) {
  if (typeof localStorage === "undefined") return;
  const key = storageKey(RESIZE_STORAGE_PREFIX, installId, storageScope);
  if (!key) return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify(normalizeDesktopColumnFractions(fractions, defaultFractions))
    );
  } catch (_) {}
}
