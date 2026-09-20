CREATE TABLE IF NOT EXISTS avatar_objective_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, objective)
);
CREATE TABLE IF NOT EXISTS avatar_objective_events (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  objective TEXT NOT NULL,
  event_key TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, objective, event_key)
);
CREATE TABLE IF NOT EXISTS avatar_reward_notifications (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  objective TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  PRIMARY KEY (user_id, item_key)
);
INSERT OR IGNORE INTO avatar_objective_epochs (objective, started_at)
VALUES ('lepers_correct_answers', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
-- Preserve only wins already recorded by the non-retroactive crown system.
INSERT OR IGNORE INTO avatar_objective_progress (user_id, objective, value)
SELECT user_id, 'mini_tournament_wins', COUNT(*) FROM avatar_tournament_wins GROUP BY user_id;
INSERT OR IGNORE INTO avatar_objective_events (user_id, objective, event_key, recorded_at)
SELECT user_id, 'mini_tournament_wins', tournament_key, won_at FROM avatar_tournament_wins;
