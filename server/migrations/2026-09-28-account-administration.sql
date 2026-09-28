CREATE TABLE IF NOT EXISTS admin_account_operations (
  operation_id TEXT PRIMARY KEY,
  actor_user_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL,
  source_user_id INTEGER,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  result_json TEXT NOT NULL,
  backup_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS account_absolute_records (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  records_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
