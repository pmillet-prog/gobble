CREATE TABLE IF NOT EXISTS gobblar_account_grant_campaigns (
  campaign_key TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gobblar_account_grants (
  campaign_key TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  granted_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  PRIMARY KEY (campaign_key, user_id)
);
