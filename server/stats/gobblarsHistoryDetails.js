const AVATAR_REASONS = new Set(["avatar_unlock", "avatar_refund"]);
const THEME_REASONS = new Set(["theme_unlock_single", "theme_unlock_full"]);
const validKey = key => typeof key === "string" && key.length <= 160 && /^[a-zA-Z][a-zA-Z0-9]*:[a-zA-Z0-9_-]+$/.test(key);
const label = value => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160) : "";

async function loadAvatarCatalog() {
  const { loadCatalog } = await import("../avatars/avatarValidation.js");
  return loadCatalog();
}

// Expose only presentation data: ledger metadata may also hold private/internal
// fields (purchase ids, room ids, transaction tokens or account identifiers).
export async function gobblarsHistoryDetails(reason, data, { loadCatalog = loadAvatarCatalog } = {}) {
  let meta;
  try { meta = JSON.parse(data); } catch { return {}; }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  if (reason === "weekly_duel_winner") {
    return typeof meta.weekId === "string" && /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(meta.weekId)
      ? { weekId: meta.weekId } : {};
  }
  const avatar = AVATAR_REASONS.has(reason);
  if (!avatar && !THEME_REASONS.has(reason)) return {};
  const rawKeys = avatar ? meta.items : meta.requiredUnlocks;
  if (!Array.isArray(rawKeys)) return {};
  const keys = [...new Set(rawKeys.filter(validKey))];
  const snapshots = new Map((Array.isArray(meta.itemDetails) ? meta.itemDetails : [])
    .filter(item => item && validKey(item.key)).map(item => [item.key, item]));
  // Older purchases stored keys only. Resolve their names without inventing a
  // historical price from today's catalogue. New purchases preserve their name.
  const needsCatalog = avatar && keys.some(key => !label(snapshots.get(key)?.label));
  const catalog = needsCatalog ? await loadCatalog().catch(() => null) : null;
  return { items: keys.map(key => {
    const [family, id] = key.split(":");
    const snapshot = snapshots.get(key);
    const familyParts = catalog?.families?.[family];
    const part = Array.isArray(familyParts) ? familyParts.find(item => item.id === id) : null;
    const itemLabel = label(snapshot?.label) || label(part?.label);
    return { key, ...(itemLabel ? { label: itemLabel } : {}),
      ...(Number.isSafeInteger(snapshot?.amount) && snapshot.amount > 0 ? { amount: snapshot.amount } : {}) };
  }) };
}
