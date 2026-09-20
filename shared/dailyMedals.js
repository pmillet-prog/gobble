export const MEDAL_COLORS = ["gold", "silver", "bronze"];
const parisDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
const parisHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" });

export function getMedalDateId(now = Date.now()) {
  const parts = Object.fromEntries(parisDate.formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getMedalResetAt(now = Date.now()) {
  const [year, month, day] = getMedalDateId(now).split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day + 1);
  return utcMidnight - Number(parisHour.format(utcMidnight)) * 3600000;
}

export function normalizeDailyMedals(value) {
  return Object.fromEntries(MEDAL_COLORS.map(color => {
    const count = Number(value?.[color]);
    return [color, Number.isFinite(count) ? Math.max(0, Math.min(9999, Math.trunc(count))) : 0];
  }));
}

export function getMedalPins(value) {
  const counts = normalizeDailyMedals(value);
  const total = MEDAL_COLORS.reduce((sum, color) => sum + counts[color], 0);
  return MEDAL_COLORS.flatMap(color => total <= 3
    ? Array.from({ length: counts[color] }, () => ({ color, count: 1 }))
    : counts[color] ? [{ color, count: counts[color] }] : []);
}

export function summarizeDailyMedals(state, userId, now = Date.now()) {
  const snapshot = { ...normalizeDailyMedals(null), dateId: getMedalDateId(now), expiresAt: getMedalResetAt(now) };
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0 || state?.lastResetDateId !== snapshot.dateId) return snapshot;
  const key = `install:${Number(userId)}`;
  for (const room of Object.values(state.rooms || {})) {
    const expiry = Number(room?.expiry?.[key]);
    if (Number.isFinite(expiry) && expiry <= now) continue;
    const counts = normalizeDailyMedals(room?.medals?.[key]);
    for (const color of MEDAL_COLORS) snapshot[color] += counts[color];
    if (MEDAL_COLORS.some(color => counts[color]) && Number.isFinite(expiry)) snapshot.expiresAt = Math.min(snapshot.expiresAt, expiry);
  }
  return snapshot;
}
