export const FACEBOOK_INVITE_MIN_DISTINCT_VISIT_DAYS = 5;

const NEW_PLAYER_POPUP_QUIET_PERIOD_MS = 24 * 60 * 60 * 1000;
const DISTINCT_VISIT_DAYS_STORAGE_PREFIX = "gobble_distinct_visit_days:v1";
const MAX_STORED_VISIT_DAYS = 60;

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function getParisDateId(now = Date.now()) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isNewPlayerPopupQuietPeriod({
  accountCreatedAt,
  installCreatedAt,
  isAuthenticated = false,
  isLegacyConverted = false,
  now = Date.now(),
} = {}) {
  const accountTimestamp = normalizeTimestamp(accountCreatedAt);
  const installTimestamp = normalizeTimestamp(installCreatedAt);
  const createdAt =
    isAuthenticated && !isLegacyConverted ? accountTimestamp : installTimestamp;
  if (!createdAt) return false;
  const ageMs = Number(now) - createdAt;
  return ageMs >= 0 && ageMs < NEW_PLAYER_POPUP_QUIET_PERIOD_MS;
}

export function isAudienceEligibleForPatchNotes({
  accountCreatedAt,
  installCreatedAt,
  isAuthenticated = false,
  isLegacyConverted = false,
  releaseTimestamp,
} = {}) {
  const releaseAt = normalizeTimestamp(releaseTimestamp);
  if (!releaseAt) return true;
  const accountTimestamp = normalizeTimestamp(accountCreatedAt);
  if (isAuthenticated && !isLegacyConverted && accountTimestamp) {
    return accountTimestamp < releaseAt;
  }
  const installTimestamp = normalizeTimestamp(installCreatedAt);
  // Les anciennes installations sans date sont considérées comme antérieures à la version.
  return !installTimestamp || installTimestamp < releaseAt;
}

export function recordDistinctVisitDay(audienceKey, storage, now = Date.now()) {
  const safeAudienceKey = String(audienceKey || "").trim();
  if (!safeAudienceKey || !storage) return { count: 0, dateId: "" };
  const dateId = getParisDateId(now);
  const storageKey = `${DISTINCT_VISIT_DAYS_STORAGE_PREFIX}:${safeAudienceKey}`;
  let days = [];
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) || "[]");
    if (Array.isArray(parsed)) {
      days = parsed.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)));
    }
  } catch (_) {}
  days = Array.from(new Set([...days, dateId])).sort().slice(-MAX_STORED_VISIT_DAYS);
  try {
    storage.setItem(storageKey, JSON.stringify(days));
  } catch (_) {}
  return { count: days.length, dateId };
}
