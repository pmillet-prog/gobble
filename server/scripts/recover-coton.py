"""Recover Coton and copy Cotonbe's vocabulary/lifetime stats without restarting.

Only the requested progression is merged. The secondary account is deleted,
without transferring its gobblars. Dry run by default; --apply reads the temporary password
from JSON stdin. A transaction marker prevents counting the same games twice.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import time
import urllib.request

TARGET, SOURCE = 280, 304
OPERATION = "account-recovery-cotonbe-304-to-coton-280-20260928"
COUNTERS = ("roundsPlayed", "totalScore", "wordsFound", "gobbles", "doubleGobbles", "targetRoundsPlayed", "targetRoundsFound", "special3RoundsPlayed")
RECORDS = {"bestRoundScore": "bestRoundId", "bestWordsInRound": "bestWordsInRoundId", "bestWordScore": "bestWord", "longestWordLength": "longestWord", "bestSpecial3Score": None}


def check_offline():
    for room in ("room-4x4", "room-5x5"):
        with urllib.request.urlopen("http://127.0.0.1:4000/api/players?roomId=" + room, timeout=10) as response:
            payload = json.load(response)
        if room == "room-5x5" and payload.get("error") == "invalid_room":
            continue
        if payload.get("ok") is not True or not isinstance(payload.get("players"), list):
            raise RuntimeError("Cannot verify account presence")
        if any(p.get("userId") in (TARGET, SOURCE) or str(p.get("nick", "")).lower() in ("coton", "cotonbe") for p in payload["players"]):
            raise RuntimeError("Coton or Cotonbe is online; recovery postponed")


def read_plan(db):
    users = {r["id"]: dict(r) for r in db.execute("SELECT * FROM users WHERE id IN (?,?)", (TARGET, SOURCE))}
    if set(users) != {TARGET, SOURCE} or users[TARGET]["username_normalized"] != "coton" or users[SOURCE]["username_normalized"] != "cotonbe":
        raise RuntimeError("Unexpected account identity")
    stats = {r["installId"]: dict(r) for r in db.execute("SELECT * FROM player_lifetime_stats WHERE installId IN (?,?)", (str(TARGET), str(SOURCE)))}
    # Both accounts use canonical user identities; never sweep physical devices.
    for u in users.values():
        if db.execute("SELECT 1 FROM vocab_words WHERE installId=? LIMIT 1", (u["primary_install_id"],)).fetchone():
            raise RuntimeError("Unexpected legacy vocabulary; review needed")
    merged = dict(stats[str(TARGET)])
    source = stats.get(str(SOURCE), {})
    for key in COUNTERS:
        merged[key] += source.get(key, 0)
    for key, detail in RECORDS.items():
        if source.get(key, 0) > merged[key]:
            merged[key] = source[key]
            if detail:
                merged[detail] = source[detail]
    count = db.execute("SELECT COUNT(DISTINCT wordHash) FROM vocab_words WHERE installId IN (?,?)", (str(TARGET), str(SOURCE))).fetchone()[0]
    return {"vocabulary": count, "stats": merged}


def recover(db, password, backup_dir, verify_offline=check_offline):
    if not isinstance(password, str) or not 8 <= len(password) <= 200:
        raise ValueError("Invalid temporary password")
    salt = secrets.token_hex(16)
    key = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64)
    password_hash = "scrypt$" + salt + "$" + key.hex()
    verify_offline()
    db.execute("BEGIN IMMEDIATE")
    try:
        if db.execute("SELECT 1 FROM auth_data_migrations WHERE migration_key=?", (OPERATION,)).fetchone():
            db.rollback()
            return {"ok": True, "alreadyApplied": True}
        verify_offline()
        now = int(time.time() * 1000)
        recent = db.execute("SELECT MAX(last_seen_at) FROM user_sessions WHERE user_id IN (?,?) AND invalidated_at IS NULL", (TARGET, SOURCE)).fetchone()[0]
        if recent and recent > now - 60000:
            raise RuntimeError("An account was active in the last minute")
        plan = read_plan(db)
        selectors = {"users": ("id IN (?,?)", (TARGET, SOURCE))}
        source_tables = []
        for table, in db.execute("SELECT name FROM sqlite_master WHERE type='table'"):
            columns = {r["name"] for r in db.execute(f'PRAGMA table_info("{table}")')}
            if "user_id" in columns:
                selectors[table] = ("user_id IN (?,?)", (TARGET, SOURCE))
                source_tables.append((table, "user_id"))
            elif "installId" in columns:
                selectors[table] = ("installId IN (?,?)", (str(TARGET), str(SOURCE)))
                source_tables.append((table, "installId"))
        selectors["legacy_username_reservations"] = ("claimed_user_id IN (?,?)", (TARGET, SOURCE))
        selectors["player_live_head_to_head"] = ("playerAUserId=? OR playerBUserId=?", (str(SOURCE), str(SOURCE)))
        snapshot = {t: [dict(r) for r in db.execute(f'SELECT * FROM "{t}" WHERE {where}', values)] for t, (where, values) in selectors.items()}
        directory = Path(backup_dir)
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        backup = directory / f"{OPERATION}-{now}-{secrets.token_hex(3)}.json"
        fd = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump({"operation": OPERATION, "rows": snapshot}, output, default=lambda value: {"base64": base64.b64encode(value).decode()})
            output.flush()
            os.fsync(output.fileno())
        db.execute("""INSERT INTO vocab_words (installId,wordHash,firstSeenTs)
          SELECT ?,wordHash,firstSeenTs FROM vocab_words WHERE installId=?
          ON CONFLICT(installId,wordHash) DO UPDATE SET firstSeenTs=MIN(vocab_words.firstSeenTs,excluded.firstSeenTs)""", (str(TARGET), str(SOURCE)))
        db.execute("""INSERT INTO vocab_weekly_words (installId,weekStartTs,wordHash,firstSeenTs)
          SELECT ?,weekStartTs,wordHash,firstSeenTs FROM vocab_weekly_words WHERE installId=?
          ON CONFLICT(installId,weekStartTs,wordHash) DO UPDATE SET firstSeenTs=MIN(vocab_weekly_words.firstSeenTs,excluded.firstSeenTs)""", (str(TARGET), str(SOURCE)))
        actual = db.execute("SELECT COUNT(*) FROM vocab_words WHERE installId=?", (str(TARGET),)).fetchone()[0]
        if actual != plan["vocabulary"]:
            raise RuntimeError("Vocabulary union mismatch")
        db.execute("UPDATE vocab_counts SET count=?,updatedAt=? WHERE installId=?", (actual, now, str(TARGET)))
        db.execute("UPDATE vocab_profiles SET updatedAt=? WHERE installId=?", (now, str(TARGET)))
        merged = plan["stats"]
        merged["updatedAt"] = now
        columns = [k for k in merged if k != "installId"]
        db.execute("UPDATE player_lifetime_stats SET " + ",".join(k + "=?" for k in columns) + " WHERE installId=?", [merged[k] for k in columns] + [str(TARGET)])
        db.execute("UPDATE users SET password_hash=?,must_reset_password=1,updated_at=? WHERE id=?", (password_hash, now, TARGET))
        db.execute("UPDATE user_sessions SET invalidated_at=COALESCE(invalidated_at,?) WHERE user_id=?", (now, TARGET))
        # The user explicitly requested deletion, with no wallet transfer.
        for table, column in source_tables:
            db.execute(f'DELETE FROM "{table}" WHERE {column}=?', (SOURCE if column == "user_id" else str(SOURCE),))
        db.execute("DELETE FROM legacy_username_reservations WHERE claimed_user_id=?", (SOURCE,))
        db.execute("DELETE FROM player_live_head_to_head WHERE playerAUserId=? OR playerBUserId=?", (str(SOURCE), str(SOURCE)))
        db.execute("DELETE FROM users WHERE id=?", (SOURCE,))
        db.execute("INSERT INTO auth_data_migrations VALUES (?,?)", (OPERATION, now))
        db.commit()
        return {"ok": True, "vocabulary": actual, "roundsPlayed": merged["roundsPlayed"], "bestSpecial3Score": merged["bestSpecial3Score"], "mustResetPassword": True, "sourceDeleted": True, "gobblarsTransferred": False, "backup": str(backup)}
    except BaseException:
        db.rollback()
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="/home/freebox/gobble_runtime/gobble.db")
    parser.add_argument("--backup-dir", default="/home/freebox/account-recovery")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    db = sqlite3.connect(Path(args.db).resolve().as_uri() + ("?mode=rw" if args.apply else "?mode=ro"), uri=True, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        if args.apply:
            result = recover(db, json.load(sys.stdin)["password"], args.backup_dir)
        else:
            check_offline()
            result = {"dryRun": True, **read_plan(db)}
        print(json.dumps(result))
    finally:
        db.close()


if __name__ == "__main__":
    main()
