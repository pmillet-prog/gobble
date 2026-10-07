const memory = new Map();
export const chalkboardSeenKey = accountId => `gobble:chalkboard-seen:${accountId || "guest"}`;

export function validChalkboardMarker(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value?.weekId || "") && Number.isSafeInteger(value?.latestEntry) && value.latestEntry >= 0;
}

const validEntryNumber = value => Number.isSafeInteger(value) && value > 0;

function normalizeMarker(value) {
  if (!validChalkboardMarker(value)) return null;
  const marker = { weekId: value.weekId, latestEntry: value.latestEntry };
  const seenEntries = [...new Set(Array.isArray(value.seenEntries) ? value.seenEntries : [])]
    .filter(z => validEntryNumber(z) && z > marker.latestEntry).sort((a, b) => a - b);
  if (seenEntries.length) marker.seenEntries = seenEntries;
  return marker;
}

function mergeMarkers(first, second) {
  if (!first) return second;
  if (!second) return first;
  if (first.weekId !== second.weekId) return first.weekId > second.weekId ? first : second;
  return normalizeMarker({
    weekId: first.weekId,
    latestEntry: Math.max(first.latestEntry, second.latestEntry),
    seenEntries: [...(first.seenEntries || []), ...(second.seenEntries || [])],
  });
}

export function hasUnseenChalkboardEntries(activity, seen) {
  if (!validChalkboardMarker(activity) || activity.latestEntry === 0) return false;
  if (!validChalkboardMarker(seen)) return true;
  return activity.weekId > seen.weekId || (activity.weekId === seen.weekId && activity.latestEntry > seen.latestEntry);
}

export function readChalkboardSeen(accountId) {
  const key = chalkboardSeenKey(accountId);
  let saved = null;
  try {
    saved = normalizeMarker(JSON.parse(localStorage.getItem(key)));
  } catch { /* Private browsing may disable storage; retain this session's visit. */ }
  return mergeMarkers(saved, memory.get(key) || null);
}

export function getUnseenChalkboardEntries(snapshot, seen) {
  if (!Array.isArray(snapshot?.interventions) || !validChalkboardMarker({ weekId: snapshot.weekId, latestEntry: 0 })) return [];
  const marker = normalizeMarker(seen);
  if (marker && marker.weekId > snapshot.weekId) return [];
  const sameWeek = marker?.weekId === snapshot.weekId;
  const latestEntry = sameWeek ? marker.latestEntry : 0;
  const seenEntries = new Set(sameWeek ? marker.seenEntries : []);
  return snapshot.interventions.filter(entry => validEntryNumber(entry?.z) && !entry.canErase
    && entry.z > latestEntry && !seenEntries.has(entry.z));
}

export function markChalkboardSeen(accountId, snapshot, visibleEntries = snapshot?.interventions) {
  const current = readChalkboardSeen(accountId);
  if (!Array.isArray(snapshot?.interventions) || !validChalkboardMarker({ weekId: snapshot.weekId, latestEntry: 0 })) return current;
  if (current && current.weekId > snapshot.weekId) return current;
  const sameWeek = current?.weekId === snapshot.weekId;
  const previousEntry = sameWeek ? current.latestEntry : 0;
  const seenEntries = new Set(sameWeek ? current.seenEntries : []);
  const visibleNumbers = new Set((Array.isArray(visibleEntries) ? visibleEntries : []).map(entry => entry?.z).filter(validEntryNumber));
  let latestSnapshotEntry = previousEntry;
  let firstUnseenEntry = Infinity;
  for (const entry of snapshot.interventions) {
    if (!validEntryNumber(entry?.z)) continue;
    // A publish response can append our own entry before the next full poll.
    // Its number must not acknowledge somebody else's concurrent, unseen entry.
    if (entry.canErase) continue;
    latestSnapshotEntry = Math.max(latestSnapshotEntry, entry.z);
    if (entry.z <= previousEntry) continue;
    if (visibleNumbers.has(entry.z)) seenEntries.add(entry.z);
    if (!seenEntries.has(entry.z)) firstUnseenEntry = Math.min(firstUnseenEntry, entry.z);
  }
  const marker = normalizeMarker({
    weekId: snapshot.weekId,
    latestEntry: firstUnseenEntry < Infinity ? Math.max(previousEntry, firstUnseenEntry - 1) : latestSnapshotEntry,
    seenEntries: [...seenEntries],
  });
  if (JSON.stringify(marker) === JSON.stringify(current)) return current;
  const key = chalkboardSeenKey(accountId);
  memory.set(key, marker);
  try { localStorage.setItem(key, JSON.stringify(marker)); } catch { /* Session fallback above. */ }
  return marker;
}
