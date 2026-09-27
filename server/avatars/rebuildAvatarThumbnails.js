import { AVATAR_THUMBNAIL_RENDER_VERSION } from "../../shared/avatarRenderVersion.js";

// Explicit maintenance job: never regenerate images while serving a chat GET.
// Render outside the write lock; the conditional write rejects an intervening
// avatar edit/refund/deletion and never changes the player's configuration.
export async function rebuildAvatarThumbnails({ db, renderer, apply = false, onProgress = () => {} }) {
  const report = { selected: 0, rebuilt: 0, skipped: 0, failed: 0 };
  let cursor = 0;
  for (;;) {
    const rows = await db.all(`SELECT a.user_id, a.revision, a.configuration
      FROM user_avatars a LEFT JOIN user_avatar_thumbnails t ON t.user_id = a.user_id
      WHERE a.user_id > ? AND (t.user_id IS NULL OR t.revision != a.revision OR t.render_version < ?)
      ORDER BY a.user_id LIMIT 32`, cursor, AVATAR_THUMBNAIL_RENDER_VERSION);
    if (!rows.length) break;
    for (const row of rows) {
      cursor = row.user_id; report.selected++;
      if (!apply) continue;
      try {
        const thumbnail = await renderer.render(JSON.parse(row.configuration));
        const write = await db.run(`INSERT INTO user_avatar_thumbnails (user_id, revision, render_version, png)
          SELECT user_id, revision, ?, ? FROM user_avatars WHERE user_id = ? AND revision = ? AND configuration = ?
          ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision,
            render_version = excluded.render_version, png = excluded.png
          WHERE user_avatar_thumbnails.revision != excluded.revision OR user_avatar_thumbnails.render_version < excluded.render_version`,
        thumbnail.renderVersion, thumbnail.png, row.user_id, row.revision, row.configuration);
        report[write.changes ? "rebuilt" : "skipped"]++;
      } catch (error) {
        report.failed++;
        onProgress({ userId: row.user_id, error: error.message });
      }
      onProgress({ ...report });
    }
  }
  return report;
}
