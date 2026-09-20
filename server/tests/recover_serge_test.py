import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("recovery", ROOT / "scripts" / "recover-serge.py")
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="gobble-recovery-test-")
        self.addCleanup(self.tmp.cleanup)
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.addCleanup(self.db.close)
        self.db.executescript("""
          CREATE TABLE users (id INTEGER PRIMARY KEY,username_normalized TEXT,username_display TEXT,primary_install_id TEXT,password_hash TEXT,must_reset_password INTEGER,updated_at INTEGER);
          INSERT INTO users VALUES (221,'serge','serge','acct-old','old',0,0),(283,'serged','sergeD','acct-new','new',0,0),(7,'other','Other','acct-other','other',0,0);
          CREATE TABLE user_devices (user_id INTEGER,install_id TEXT,created_at INTEGER,last_seen_at INTEGER);
          INSERT INTO user_devices VALUES (221,'device-old',0,0),(283,'device-new',0,0),(7,'device-new',0,0);
          CREATE TABLE user_sessions (user_id INTEGER,last_seen_at INTEGER,invalidated_at INTEGER);
          INSERT INTO user_sessions VALUES (221,0,NULL),(283,0,NULL),(7,0,NULL);
          CREATE TABLE user_identity_migrations (user_id INTEGER,migration_signature TEXT);
          INSERT INTO user_identity_migrations VALUES (221,'old'),(283,'new');
          CREATE TABLE legacy_username_reservations (claimed_user_id INTEGER,install_id TEXT,updated_at INTEGER);
          CREATE TABLE user_avatars (user_id INTEGER);
          CREATE TABLE avatar_unlocks (user_id INTEGER);
          CREATE TABLE auth_data_migrations (migration_key TEXT PRIMARY KEY,applied_at INTEGER);
          CREATE TABLE gobblar_profiles (installId TEXT PRIMARY KEY,balance INTEGER,themeApplied TEXT,themeUnlocks TEXT,updatedAt INTEGER);
          INSERT INTO gobblar_profiles VALUES ('221',741,'{"bg":"old"}','{"old":true}',0),('283',509,'{}','{"new":true}',0),('7',99,'{}','{}',0),('device-new',18,'{}','{}',0);
          CREATE TABLE gobblar_ledger (installId TEXT,ts INTEGER,delta INTEGER,reason TEXT,meta TEXT);
          CREATE TABLE gobblar_week_rewards (installId TEXT,weekId TEXT,source TEXT,amount INTEGER,awardedAt INTEGER,PRIMARY KEY(installId,weekId,source));
          CREATE TABLE gobblar_global_grants (installId TEXT,grantKey TEXT,amount INTEGER,awardedAt INTEGER,PRIMARY KEY(installId,grantKey));
          INSERT INTO gobblar_week_rewards VALUES ('283','week','vocab',100,0);
          INSERT INTO gobblar_global_grants VALUES ('283','welcome',100,0);
          CREATE TABLE vocab_words (installId TEXT,wordHash TEXT,firstSeenTs INTEGER,PRIMARY KEY(installId,wordHash));
          INSERT INTO vocab_words VALUES ('221','shared',20),('221','old',10),('283','shared',5),('283','new',30),('7','other',1),('device-new','unrelated',1);
          CREATE TABLE vocab_weekly_words (installId TEXT,weekStartTs INTEGER,wordHash TEXT,firstSeenTs INTEGER,PRIMARY KEY(installId,weekStartTs,wordHash));
          INSERT INTO vocab_weekly_words VALUES ('221',1,'shared',20),('283',1,'shared',5),('283',1,'new',30);
          CREATE TABLE vocab_counts (installId TEXT PRIMARY KEY,count INTEGER,updatedAt INTEGER);
          INSERT INTO vocab_counts VALUES ('221',2,0),('283',2,0);
          CREATE TABLE vocab_profiles (installId TEXT PRIMARY KEY,nick TEXT,updatedAt INTEGER);
          INSERT INTO vocab_profiles VALUES ('221','serge',0),('283','sergeD',0);
        """)

    def recover(self):
        return recovery.recover(self.db, password="Test-recovery-123!", backup_dir=self.tmp.name, verify_offline=lambda: None)

    def scalar(self, sql):
        return self.db.execute(sql).fetchone()[0]

    def test_merge_preserves_money_and_unions_words_without_touching_shared_device_data(self):
        result = self.recover()
        self.assertEqual((result["balance"], result["vocabulary"], result["transferred"]), (1250, 3, 509))
        self.assertEqual(self.scalar("SELECT SUM(balance) FROM gobblar_profiles"), 1367)
        self.assertEqual(self.scalar("SELECT balance FROM gobblar_profiles WHERE installId='283'"), 0)
        self.assertEqual(self.scalar("SELECT balance FROM gobblar_profiles WHERE installId='device-new'"), 18)
        self.assertEqual(self.scalar("SELECT firstSeenTs FROM vocab_words WHERE installId='221' AND wordHash='shared'"), 5)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM vocab_weekly_words WHERE installId='221'"), 2)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM vocab_words WHERE installId='283'"), 0)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM user_sessions WHERE invalidated_at IS NULL"), 1)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM user_devices WHERE user_id=221"), 2)
        self.assertEqual(json.loads(self.scalar("SELECT themeUnlocks FROM gobblar_profiles WHERE installId='221'")), {"old": True, "new": True})
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM gobblar_week_rewards WHERE installId='221'"), 1)
        self.assertEqual(self.scalar("SELECT must_reset_password FROM users WHERE id=221"), 1)
        backup = json.loads(Path(result["backup"]).read_text())
        self.assertEqual(backup["rows"]["users"][0]["password_hash"], "old")
        # Validate Python's maintenance hash against the real Node auth verifier.
        script = "import {verifyPassword} from './auth/authService.js'; import fs from 'node:fs'; const v=JSON.parse(fs.readFileSync(0,'utf8')); if(!await verifyPassword(v.password,v.hash)) process.exit(1);"
        subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, input=json.dumps({"password": "Test-recovery-123!", "hash": self.scalar("SELECT password_hash FROM users WHERE id=221")}), text=True, capture_output=True, check=True, timeout=15)

    def test_reapplying_cannot_credit_or_reset_again(self):
        self.recover()
        before = self.scalar("SELECT password_hash FROM users WHERE id=221")
        self.assertEqual(self.recover(), {"ok": True, "alreadyApplied": True})
        self.assertEqual(self.scalar("SELECT password_hash FROM users WHERE id=221"), before)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM gobblar_ledger"), 2)

    def test_write_failure_rolls_back_every_change_but_retains_backup(self):
        self.db.execute("CREATE TRIGGER failure BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT,'test failure'); END")
        self.db.commit()
        with self.assertRaisesRegex(sqlite3.IntegrityError, "test failure"):
            self.recover()
        self.assertEqual(self.scalar("SELECT balance FROM gobblar_profiles WHERE installId='221'"), 741)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM vocab_words WHERE installId='283'"), 2)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM auth_data_migrations"), 0)
        self.assertEqual(self.scalar("SELECT COUNT(*) FROM user_sessions WHERE invalidated_at IS NULL"), 3)
        self.assertEqual(len(list(Path(self.tmp.name).glob("*.json"))), 1)

    def test_recent_activity_or_new_purchases_prevent_recovery(self):
        self.db.execute("UPDATE user_sessions SET last_seen_at=? WHERE user_id=283", (int(time.time() * 1000),))
        self.db.commit()
        with self.assertRaisesRegex(RuntimeError, "last minute"):
            self.recover()
        self.db.execute("UPDATE user_sessions SET last_seen_at=0")
        self.db.execute("INSERT INTO avatar_unlocks VALUES (283)")
        self.db.commit()
        with self.assertRaisesRegex(RuntimeError, "avatar purchases"):
            self.recover()
        self.assertEqual(self.scalar("SELECT balance FROM gobblar_profiles WHERE installId='221'"), 741)


if __name__ == "__main__":
    unittest.main()
