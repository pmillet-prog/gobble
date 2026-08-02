export function patchFirstMatchingFeedEntry(entries, matchesEntry, patch) {
  if (!Array.isArray(entries) || entries.length === 0) return entries;
  if (typeof matchesEntry !== "function" || !patch || typeof patch !== "object") {
    return entries;
  }

  const index = entries.findIndex((entry) => matchesEntry(entry));
  if (index < 0) return entries;
  const current = entries[index] || {};
  const patchKeys = Object.keys(patch);
  const changed = patchKeys.some((key) => !Object.is(current[key], patch[key]));
  if (!changed) return entries;

  const next = entries.slice();
  next[index] = { ...current, ...patch };
  return next;
}
