import { runSqliteImmediateTransaction } from "../sqliteQueue.js";

const MAX_MARKER_LENGTH = 180;
const MAX_MARKERS_PER_WRITE = 64;
const MAX_MARKERS_PER_READ = 5000;
const TRANSIENT_PREFIXES = ["vocab-overlay:"];

function normalizeMarkers(rawMarkers, limit) {
  const source = Array.isArray(rawMarkers) ? rawMarkers : [rawMarkers];
  const seen = new Set();
  for (const rawMarker of source) {
    const marker = String(rawMarker || "").trim();
    if (!marker || marker.length > MAX_MARKER_LENGTH || /[\u0000-\u001f\u007f]/u.test(marker)) continue;
    seen.add(marker);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

export function createUserUiSeenRepository({ getDb, runWrite, now = Date.now }) {
  return {
    async list(userId) {
      const safeUserId = Number(userId);
      if (!Number.isInteger(safeUserId) || safeUserId <= 0) return [];
      const db = await getDb();
      // The write batch limit must never truncate account history on reload.
      // Keep onboarding ahead of rotating announcements even at the read limit.
      const rows = await db.all(
        `SELECT marker FROM user_ui_seen
         WHERE user_id = ?
         ORDER BY CASE
           WHEN marker GLOB 'tutorial:*' OR marker GLOB 'duel-tutorial:*'
             OR marker GLOB 'chat-rules:*' OR marker GLOB 'migration:*' THEN 0
           ELSE 1 END, seen_at DESC, marker ASC
         LIMIT ?`,
        safeUserId,
        MAX_MARKERS_PER_READ
      );
      return normalizeMarkers(rows.map(row => row.marker), MAX_MARKERS_PER_READ);
    },

    async mark(userId, rawMarkers) {
      const safeUserId = Number(userId);
      const markers = normalizeMarkers(rawMarkers, MAX_MARKERS_PER_WRITE);
      if (!Number.isInteger(safeUserId) || safeUserId <= 0 || markers.length === 0) return [];
      const db = await getDb();
      const timestamp = now();
      await runWrite(() => runSqliteImmediateTransaction(db, async () => {
        for (const marker of markers) {
          const transientPrefix = TRANSIENT_PREFIXES.find(prefix => marker.startsWith(prefix));
          if (transientPrefix) {
            await db.run(
              `DELETE FROM user_ui_seen
               WHERE user_id = ? AND marker LIKE ? AND marker <> ?`,
              safeUserId, `${transientPrefix}%`, marker
            );
          }
          await db.run(
            `INSERT INTO user_ui_seen (user_id, marker, seen_at)
             VALUES (?, ?, ?)
             ON CONFLICT(user_id, marker) DO UPDATE SET seen_at = excluded.seen_at`,
            safeUserId, marker, timestamp
          );
        }
      }, { label: "auth-ui-seen" }));
      return markers;
    },
  };
}
