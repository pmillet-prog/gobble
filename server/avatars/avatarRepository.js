import { runSqliteImmediateTransaction } from "../sqliteQueue.js";

export function createAvatarRepository({ getDb, runWrite, renders = null }) {
  const decode = (userId, row) => ({
    userId,
    avatar: row ? JSON.parse(row.configuration) : null,
    revision: row?.revision || 0,
    updatedAt: row?.updated_at || null,
  });
  const read = (db, userId) => db.get(
    "SELECT configuration, revision, updated_at FROM user_avatars WHERE user_id = ?", userId
  );
  return {
    async get(userId) {
      const db = await getDb(), snapshot = decode(userId, await read(db, userId));
      if (renders && snapshot.avatar) snapshot.avatar = (await renders.decorate({ [userId]: snapshot.avatar }, db))[userId];
      return snapshot;
    },
    async getMany(userIds) {
      if (!userIds.length) return {};
      const db = await getDb();
      const rows = await db.all(
        `SELECT user_id, configuration FROM user_avatars WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
        ...userIds
      );
      const avatars = Object.fromEntries(rows.map(row => [row.user_id, JSON.parse(row.configuration)]));
      return renders ? renders.decorate(avatars, db) : avatars;
    },
    async getThumbnail(userId) {
      return (await getDb()).get(`SELECT t.revision, t.render_version AS renderVersion, t.png
        FROM user_avatar_thumbnails t JOIN user_avatars a ON a.user_id = t.user_id AND a.revision = t.revision
        WHERE t.user_id = ?`, userId);
    },
    async save(userId, avatar, expectedRevision, thumbnail = null, { assertWritable = () => {} } = {}) {
      const db = await getDb();
      return runWrite(() => runSqliteImmediateTransaction(db, async () => {
        assertWritable();
        const json = JSON.stringify(avatar), timestamp = Date.now();
        const result = expectedRevision === 0
          ? await db.run(`INSERT INTO user_avatars (user_id, configuration, revision, updated_at)
              VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING`, userId, json, timestamp)
          : await db.run(`UPDATE user_avatars SET configuration = ?, revision = revision + 1, updated_at = ?
              WHERE user_id = ? AND revision = ?`, json, timestamp, userId, expectedRevision);
        const snapshot = decode(userId, await read(db, userId));
        if (result.changes === 1 && thumbnail) {
          await db.run(`INSERT INTO user_avatar_thumbnails (user_id, revision, render_version, png)
            VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision,
              render_version = excluded.render_version, png = excluded.png`,
          userId, snapshot.revision, thumbnail.renderVersion, thumbnail.png);
        }
        if (result.changes === 1 && thumbnail?.assets) await renders?.write(db, userId, snapshot.revision, thumbnail.assets);
        if (renders && snapshot.avatar) snapshot.avatar = (await renders.decorate({ [userId]: snapshot.avatar }, db))[userId];
        return { saved: result.changes === 1, ...snapshot };
      }, { label: "account-avatar" }));
    },
  };
}
