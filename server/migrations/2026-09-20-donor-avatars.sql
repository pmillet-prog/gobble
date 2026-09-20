CREATE TABLE IF NOT EXISTS support_donor_accounts (
  donor_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_donor_accounts_user ON support_donor_accounts(user_id);
