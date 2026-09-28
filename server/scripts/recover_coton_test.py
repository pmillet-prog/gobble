import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("recovery", Path(__file__).parents[1] / "scripts/recover-coton.py")
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoveryTest(unittest.TestCase):
    def make_db(self):
        db = sqlite3.connect(":memory:")
        db.row_factory = sqlite3.Row
        db.executescript("""
          CREATE TABLE users(id INTEGER PRIMARY KEY,username_normalized TEXT,primary_install_id TEXT,password_hash TEXT,must_reset_password INTEGER,updated_at INTEGER);
          INSERT INTO users VALUES(280,'coton','acct-a','old',0,0),(304,'cotonbe','acct-b','old',0,0);
          CREATE TABLE user_sessions(user_id INTEGER,last_seen_at INTEGER,invalidated_at INTEGER);
          INSERT INTO user_sessions VALUES(280,1,NULL),(304,1,NULL);
          CREATE TABLE auth_data_migrations(migration_key TEXT PRIMARY KEY,applied_at INTEGER);
          CREATE TABLE vocab_words(installId TEXT,wordHash TEXT,firstSeenTs INTEGER,PRIMARY KEY(installId,wordHash));
          INSERT INTO vocab_words VALUES('280','a',5),('304','a',3),('304','b',8);
          CREATE TABLE vocab_weekly_words(installId TEXT,weekStartTs INTEGER,wordHash TEXT,firstSeenTs INTEGER,PRIMARY KEY(installId,weekStartTs,wordHash));
          INSERT INTO vocab_weekly_words VALUES('304',1,'b',8);
          CREATE TABLE vocab_counts(installId TEXT PRIMARY KEY,count INTEGER,updatedAt INTEGER);
          INSERT INTO vocab_counts VALUES('280',1,0),('304',2,0);
          CREATE TABLE vocab_profiles(installId TEXT PRIMARY KEY,updatedAt INTEGER);
          INSERT INTO vocab_profiles VALUES('280',0),('304',0);
          CREATE TABLE gobblar_profiles(installId TEXT PRIMARY KEY,balance INTEGER);
          INSERT INTO gobblar_profiles VALUES('280',100),('304',50),('999',90);
          CREATE TABLE legacy_username_reservations(claimed_user_id INTEGER);
          CREATE TABLE player_live_head_to_head(playerAUserId TEXT,playerBUserId TEXT);
        """)
        ints = (*recovery.COUNTERS, *recovery.RECORDS)
        details = [v for v in recovery.RECORDS.values() if v]
        db.execute("CREATE TABLE player_lifetime_stats(installId TEXT PRIMARY KEY," + ",".join(k + " INTEGER DEFAULT 0" for k in ints) + "," + ",".join(k + " TEXT" for k in details) + ",updatedAt INTEGER)")
        db.execute("INSERT INTO player_lifetime_stats(installId,roundsPlayed,bestSpecial3Score,bestWordScore,bestWord) VALUES('280',10,69,150,'ancien'),('304',2,79,100,'second')")
        db.commit()
        return db

    def test_union_records_deletion_and_idempotency(self):
        db = self.make_db()
        with tempfile.TemporaryDirectory() as directory:
            result = recovery.recover(db, "temporary-test-password", directory, lambda: None)
            self.assertEqual(result["vocabulary"], 2)
            self.assertEqual(result["roundsPlayed"], 12)
            self.assertEqual(result["bestSpecial3Score"], 79)
            self.assertEqual(db.execute("SELECT firstSeenTs FROM vocab_words WHERE installId='280' AND wordHash='a'").fetchone()[0], 3)
            self.assertIsNone(db.execute("SELECT 1 FROM users WHERE id=304").fetchone())
            self.assertEqual(db.execute("SELECT balance FROM gobblar_profiles WHERE installId='280'").fetchone()[0], 100)
            self.assertEqual(db.execute("SELECT balance FROM gobblar_profiles WHERE installId='999'").fetchone()[0], 90)
            self.assertEqual(db.execute("SELECT must_reset_password FROM users WHERE id=280").fetchone()[0], 1)
            self.assertTrue(recovery.recover(db, "temporary-test-password", directory, lambda: None)["alreadyApplied"])

    def test_rollback_after_write_failure(self):
        db = self.make_db()
        db.execute("CREATE TRIGGER prevent_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT,'test'); END")
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(sqlite3.IntegrityError):
                recovery.recover(db, "temporary-test-password", directory, lambda: None)
        self.assertEqual(db.execute("SELECT count FROM vocab_counts WHERE installId='280'").fetchone()[0], 1)
        self.assertEqual(db.execute("SELECT password_hash FROM users WHERE id=280").fetchone()[0], "old")
        self.assertIsNotNone(db.execute("SELECT 1 FROM users WHERE id=304").fetchone())


if __name__ == "__main__":
    unittest.main()
