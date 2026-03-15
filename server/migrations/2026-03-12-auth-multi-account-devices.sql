PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS user_devices_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  install_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  UNIQUE(user_id, install_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO user_devices_v2 (user_id, install_id, created_at, last_seen_at)
SELECT
  user_id,
  install_id,
  MIN(created_at) AS created_at,
  MAX(last_seen_at) AS last_seen_at
FROM user_devices
GROUP BY user_id, install_id;

DROP TABLE IF EXISTS user_devices;
ALTER TABLE user_devices_v2 RENAME TO user_devices;

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id
ON user_devices(user_id);

CREATE INDEX IF NOT EXISTS idx_user_devices_install_id
ON user_devices(install_id);

PRAGMA foreign_keys = ON;
