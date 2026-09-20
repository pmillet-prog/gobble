-- Temporary rewards are separate from permanently bought/unlocked items.
-- At most the three current winners are retained, with one pending receipt each.
CREATE TABLE IF NOT EXISTS avatar_weekly_auras (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  aura_id TEXT NOT NULL CHECK(aura_id IN ('weekly_gold', 'weekly_silver', 'weekly_bronze')),
  week_start INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  notification_key TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL,
  acknowledged_at INTEGER
);
