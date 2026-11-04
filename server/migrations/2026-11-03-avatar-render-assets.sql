CREATE TABLE IF NOT EXISTS user_avatar_renders (
  user_id INTEGER PRIMARY KEY REFERENCES user_avatars(user_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  render_version INTEGER NOT NULL,
  manifest TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_avatar_render_images (
  user_id INTEGER NOT NULL REFERENCES user_avatar_renders(user_id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  png BLOB NOT NULL,
  PRIMARY KEY (user_id, kind)
);
-- Edits, refunds and account deletion must never leave old portraits available.
CREATE TRIGGER IF NOT EXISTS invalidate_avatar_renders
AFTER UPDATE OF revision ON user_avatars
WHEN OLD.revision != NEW.revision
BEGIN
  DELETE FROM user_avatar_renders WHERE user_id = NEW.user_id;
END;
