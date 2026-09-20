CREATE TABLE IF NOT EXISTS gobblar_starter_campaigns (
  campaign_key TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gobblar_starter_grants (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  granted_at INTEGER NOT NULL,
  eligibility TEXT NOT NULL,
  rounds_played INTEGER NOT NULL,
  last_active_at INTEGER,
  acknowledged_at INTEGER
);
