import { AVATAR_ASSET_VARIANTS } from "../../shared/avatarRenderAssets.js";

export function createAvatarRenderRepository({ getDb }) {
  return {
    async decorate(avatars, db = null) {
      const ids = Object.keys(avatars).map(Number);
      if (!ids.length) return avatars;
      db ||= await getDb();
      const rows = await db.all(`SELECT r.user_id, r.revision, r.render_version, r.manifest
        FROM user_avatar_renders r JOIN user_avatars a ON a.user_id = r.user_id AND a.revision = r.revision
        WHERE r.user_id IN (${ids.map(() => "?").join(",")})`, ...ids);
      const result = { ...avatars };
      for (const row of rows) if (result[row.user_id]) result[row.user_id] = { ...result[row.user_id],
        renderedAssets: { ...JSON.parse(row.manifest), userId: row.user_id, revision: row.revision, version: row.render_version } };
      return result;
    },
    async write(db, userId, revision, assets) {
      // Called inside the same transaction as the outfit and miniature.
      await db.run("DELETE FROM user_avatar_renders WHERE user_id = ?", userId);
      await db.run("INSERT INTO user_avatar_renders (user_id, revision, render_version, manifest) VALUES (?, ?, ?, ?)",
        userId, revision, assets.version, JSON.stringify(assets.manifest));
      for (const kind of Object.keys(AVATAR_ASSET_VARIANTS)) {
        if (!assets.images[kind]?.length || !assets.manifest.frames[kind]) throw new Error("avatar_assets_incomplete");
        await db.run("INSERT INTO user_avatar_render_images (user_id, kind, png) VALUES (?, ?, ?)", userId, kind, assets.images[kind]);
      }
    },
    async get(userId, revision, version, kind) {
      if (!Object.hasOwn(AVATAR_ASSET_VARIANTS, kind)) return null;
      return (await getDb()).get(`SELECT i.png FROM user_avatar_render_images i
        JOIN user_avatar_renders r ON r.user_id = i.user_id
        JOIN user_avatars a ON a.user_id = r.user_id AND a.revision = r.revision
        WHERE r.user_id = ? AND r.revision = ? AND r.render_version = ? AND i.kind = ?`, userId, revision, version, kind);
    },
  };
}
