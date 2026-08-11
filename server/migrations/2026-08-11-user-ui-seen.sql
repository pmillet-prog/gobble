PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_ui_seen (
  user_id INTEGER NOT NULL,
  marker TEXT NOT NULL,
  seen_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, marker),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_ui_seen_user_id_seen_at
ON user_ui_seen(user_id, seen_at DESC);

CREATE TABLE IF NOT EXISTS auth_data_migrations (
  migration_key TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO user_ui_seen (user_id, marker, seen_at)
SELECT id, 'tutorial:main:v1', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM auth_data_migrations
  WHERE migration_key = 'account-ui-seen-baseline-v1'
);

INSERT OR IGNORE INTO user_ui_seen (user_id, marker, seen_at)
SELECT id, 'tutorial:guided-results:v3', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM auth_data_migrations
  WHERE migration_key = 'account-ui-seen-baseline-v1'
);

INSERT OR IGNORE INTO user_ui_seen (user_id, marker, seen_at)
SELECT id, 'patch-notes:2026-08-09', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM auth_data_migrations
  WHERE migration_key = 'account-ui-seen-baseline-v1'
);

INSERT OR IGNORE INTO user_ui_seen (user_id, marker, seen_at)
SELECT id, 'duel-tutorial:duel-v1', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM auth_data_migrations
  WHERE migration_key = 'account-ui-seen-baseline-v1'
);

INSERT OR IGNORE INTO user_ui_seen (user_id, marker, seen_at)
SELECT id, 'migration:account-ui-seen-baseline:v1', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM auth_data_migrations
  WHERE migration_key = 'account-ui-seen-baseline-v1'
);

INSERT OR IGNORE INTO auth_data_migrations (migration_key, applied_at)
VALUES ('account-ui-seen-baseline-v1', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
