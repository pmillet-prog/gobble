import { AVATAR_ASSET_RENDER_VERSION } from "../../shared/avatarRenderAssets.js";
import { createAvatarRenderRepository } from "./avatarRenderRepository.js";
import { runSerializedSqliteWrite, runSqliteImmediateTransaction } from "../sqliteQueue.js";

// Explicit, resumable backfill. Image GETs never trigger expensive rendering.
export async function rebuildAvatarRenderAssets({ db, renderer, apply = false, onProgress = () => {} }) {
  const report = { selected: 0, rebuilt: 0, skipped: 0, failed: 0 };
  const renders = createAvatarRenderRepository({ getDb: async () => db });
  let cursor = 0;
  for (;;) {
    const rows = await db.all(`SELECT a.user_id, a.revision, a.configuration FROM user_avatars a
      LEFT JOIN user_avatar_renders r ON r.user_id = a.user_id
      WHERE a.user_id > ? AND a.configuration != 'null'
        AND (r.user_id IS NULL OR r.revision != a.revision OR r.render_version < ?)
      ORDER BY a.user_id LIMIT 16`, cursor, AVATAR_ASSET_RENDER_VERSION);
    if (!rows.length) break;
    for (const row of rows) {
      cursor = row.user_id; report.selected++;
      if (!apply) continue;
      try {
        const generated = await renderer.renderAssets(JSON.parse(row.configuration));
        const saved = await runSerializedSqliteWrite(() => runSqliteImmediateTransaction(db, async () => {
          const current = await db.get("SELECT revision, configuration FROM user_avatars WHERE user_id = ?", row.user_id);
          if (current?.revision !== row.revision || current?.configuration !== row.configuration) return false;
          const ready = await db.get("SELECT render_version FROM user_avatar_renders WHERE user_id = ? AND revision = ?", row.user_id, row.revision);
          if (ready?.render_version >= generated.assets.version) return false;
          await renders.write(db, row.user_id, row.revision, generated.assets);
          await db.run(`INSERT INTO user_avatar_thumbnails (user_id, revision, render_version, png) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, render_version = excluded.render_version, png = excluded.png`,
          row.user_id, row.revision, generated.renderVersion, generated.png);
          return true;
        }, { label: "avatar-render-backfill" }));
        report[saved ? "rebuilt" : "skipped"]++;
      } catch (error) {
        report.failed++;
        onProgress({ userId: row.user_id, error: error.message });
      }
      onProgress({ ...report });
    }
  }
  return report;
}
