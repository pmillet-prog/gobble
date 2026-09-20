CREATE TABLE IF NOT EXISTS user_avatar_thumbnails (
  user_id INTEGER PRIMARY KEY REFERENCES user_avatars(user_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  render_version INTEGER NOT NULL,
  png BLOB NOT NULL
);
