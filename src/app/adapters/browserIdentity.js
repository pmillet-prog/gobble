const INSTALL_ID_STORAGE_KEY = "gobble_install_id";
const INSTALL_ID_CREATED_AT_STORAGE_KEY = "gobble_install_id_created_at";

export function generateInstallId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return `iid-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export function buildUserScopedInstallId(userId) {
  const safeUserId = Number(userId);
  return Number.isInteger(safeUserId) && safeUserId > 0 ? String(safeUserId) : "";
}

export function normalizeStoredPlayerIdentityKey(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  return /^user:(\d+)$/.exec(raw)?.[1] || raw;
}

export function getOrCreateInstallId() {
  try {
    const existing = localStorage.getItem(INSTALL_ID_STORAGE_KEY);
    if (existing?.trim()) return existing.trim();
    const legacy = localStorage.getItem("boggle_client_id");
    if (legacy?.trim()) {
      localStorage.setItem(INSTALL_ID_STORAGE_KEY, legacy.trim());
      return legacy.trim();
    }
    const fresh = generateInstallId();
    localStorage.setItem(INSTALL_ID_STORAGE_KEY, fresh);
    localStorage.setItem(INSTALL_ID_CREATED_AT_STORAGE_KEY, String(Date.now()));
    return fresh;
  } catch (_) {
    return generateInstallId();
  }
}

export function getInstallIdCreatedAtTs() {
  try {
    const timestamp = Number(localStorage.getItem(INSTALL_ID_CREATED_AT_STORAGE_KEY));
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  } catch (_) {
    return null;
  }
}
