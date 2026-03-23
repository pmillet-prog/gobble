PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_identity_migrations (
  user_id INTEGER PRIMARY KEY,
  migration_signature TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
