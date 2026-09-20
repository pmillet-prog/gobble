-- Runs with the avatar module's migrations when it is deployed.
-- Resolve the registered account, never a chat nickname. Re-running is harmless.
INSERT OR IGNORE INTO avatar_unlocks (user_id, item_key, unlocked_at)
SELECT id, 'accessories:tiger_plush', CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM users WHERE username_normalized = 'tigrou';
