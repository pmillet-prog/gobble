CREATE TABLE IF NOT EXISTS avatar_unlocks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_key)
);
CREATE TABLE IF NOT EXISTS avatar_objective_epochs (
  objective TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO avatar_objective_epochs (objective, started_at)
VALUES ('mini_tournament_wins', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
CREATE TABLE IF NOT EXISTS avatar_tournament_wins (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tournament_key TEXT NOT NULL,
  won_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, tournament_key)
);
