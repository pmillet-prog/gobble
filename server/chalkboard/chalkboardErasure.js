import { erasuresFitBudget, normalizeChalkboardErasure } from "../../shared/chalkboardErasure.js";

// Build a complete update first: a bad target or a full mask budget must never
// leave half a gesture committed. Ownership always comes from the session.
export function prepareChalkboardErasures(entries, rawElements, identity, removals = new Set()) {
  const updates = new Map();
  for (const raw of rawElements) {
    if (raw?.type !== "erase") continue;
    const mask = normalizeChalkboardErasure(raw);
    if (!mask || !Array.isArray(raw.targetIds) || raw.targetIds.length > 512) return { ok: false, error: "invalid_erasure" };
    for (const id of new Set(raw.targetIds)) {
      const entry = entries.find(candidate => candidate.id === id);
      if (!entry) continue; // A moderator may already have removed it.
      if (!identity?.userId || entry.ownerId !== String(identity.userId)) return { ok: false, error: "erasure_forbidden" };
      if (removals.has(entry)) continue;
      const elements = [...(updates.get(entry) || entry.elements), mask];
      if (!erasuresFitBudget(elements)) return { ok: false, error: "erasure_limit" };
      updates.set(entry, elements);
    }
  }
  return { ok: true, updates };
}

export function prepareChalkboardCleanup(entries, rawIds, identity) {
  if (rawIds === undefined) return { ok: true, removals: new Set() };
  if (!Array.isArray(rawIds) || rawIds.length > 512) return { ok: false, error: "invalid_erasure" };
  const removals = new Set();
  for (const id of rawIds) {
    const entry = entries.find(candidate => candidate.id === id);
    if (!entry) continue;
    if (!identity?.userId || entry.ownerId !== String(identity.userId)) return { ok: false, error: "erasure_forbidden" };
    removals.add(entry);
  }
  return { ok: true, removals };
}
