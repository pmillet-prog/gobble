"""One-off, audited SergeD -> Serge recovery. Dry run unless --apply.

Uses the auth service's scrypt format and password-reset/session invalidation
procedure. Never starts, stops or imports the game server. The apply command
reads {"password": "..."} from stdin; credentials are never printed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import time
import urllib.request

TARGET, SOURCE = 221, 283
OPERATION = "account-recovery-serged-283-to-serge-221-20260920"


def password_hash(password):
    if not isinstance(password, str) or not 8 <= len(password) <= 200:
        raise ValueError("Invalid temporary password length")
    salt = secrets.token_hex(16)
    key = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64)
    return "scrypt$" + salt + "$" + key.hex()


def check_offline():
    for room in ("room-4x4", "room-5x5"):
        with urllib.request.urlopen("http://127.0.0.1:4000/api/players?roomId=" + room, timeout=10) as response:
            payload = json.load(response)
        # Production currently has only room-4x4; still check 5x5 if enabled.
        if room == "room-5x5" and payload.get("error") == "invalid_room":
            continue
        if payload.get("ok") is not True or not isinstance(payload.get("players"), list):
            raise RuntimeError("Cannot verify account presence")
        for player in payload["players"]:
            if player.get("userId") in (TARGET, SOURCE) or str(player.get("nick", "")).lower() in ("serge", "serged"):
                raise RuntimeError("Serge or SergeD is online; recovery postponed")


def placeholders(values):
    return ",".join("?" for _ in values)


def read_plan(db):
    users = {row["id"]: dict(row) for row in db.execute("SELECT * FROM users WHERE id IN (?, ?)", (TARGET, SOURCE))}
    if set(users) != {TARGET, SOURCE} or users[TARGET]["username_normalized"] != "serge" or users[SOURCE]["username_normalized"] != "serged":
        raise RuntimeError("Account identities do not match the approved recovery")
    keys = set(str(id_) for id_ in users)
    keys.update(user["primary_install_id"] for user in users.values() if user["primary_install_id"])
    # A physical device can be shared by multiple accounts: only account-owned
    # identities and explicitly claimed legacy profiles belong in the union.
    keys.update(row[0] for row in db.execute("SELECT install_id FROM legacy_username_reservations WHERE claimed_user_id IN (?, ?)", (TARGET, SOURCE)))
    keys = sorted(keys)
    # Avoid touching unrelated entitlements with this narrow one-off operation.
    for table in ("user_avatars", "avatar_unlocks"):
        if db.execute(f"SELECT COUNT(*) FROM {table} WHERE user_id=?", (SOURCE,)).fetchone()[0]:
            raise RuntimeError("SergeD now has avatar purchases; review before merging")
    wallets = [dict(row) for row in db.execute(f"SELECT * FROM gobblar_profiles WHERE installId IN ({placeholders(keys)})", keys)]
    if any(not isinstance(row["balance"], int) or row["balance"] < 0 for row in wallets):
        raise RuntimeError("Invalid wallet balance")
    vocabulary = db.execute(f"SELECT COUNT(DISTINCT wordHash) FROM vocab_words WHERE installId IN ({placeholders(keys)})", keys).fetchone()[0]
    return {"users": users, "keys": keys, "wallets": wallets, "balance": sum(row["balance"] for row in wallets), "vocabulary": vocabulary}


def merge_unlocks(target, source):
    for key, value in source.items():
        if isinstance(value, dict):
            if not isinstance(target.get(key), dict):
                target[key] = {}
            merge_unlocks(target[key], value)
        elif value:
            target[key] = value
    return target


def recover(db, *, password, backup_dir, verify_offline=check_offline):
    if db.execute("SELECT 1 FROM auth_data_migrations WHERE migration_key=?", (OPERATION,)).fetchone():
        return {"ok": True, "alreadyApplied": True}
    verify_offline()
    temporary_hash = password_hash(password)
    retired_hash = password_hash(secrets.token_urlsafe(48))
    db.execute("BEGIN IMMEDIATE")
    try:
        if db.execute("SELECT 1 FROM auth_data_migrations WHERE migration_key=?", (OPERATION,)).fetchone():
            db.rollback()
            return {"ok": True, "alreadyApplied": True}
        verify_offline()
        plan = read_plan(db)
        now = int(time.time() * 1000)
        # No recently active browser session may race the offline check.
        recent = db.execute("SELECT MAX(last_seen_at) FROM user_sessions WHERE user_id IN (?, ?) AND invalidated_at IS NULL", (TARGET, SOURCE)).fetchone()[0]
        if recent and recent > now - 60000:
            raise RuntimeError("An account was active in the last minute; retry after it disconnects")
        selectors = {
            **{table: ("user_id IN (?, ?)", (TARGET, SOURCE)) for table in ("user_devices", "user_sessions", "user_identity_migrations")},
            "users": ("id IN (?, ?)", (TARGET, SOURCE)),
            "legacy_username_reservations": ("claimed_user_id IN (?, ?)", (TARGET, SOURCE)),
            **{table: (f"installId IN ({placeholders(plan['keys'])})", plan["keys"]) for table in (
                "gobblar_profiles", "gobblar_ledger", "gobblar_week_rewards", "gobblar_global_grants",
                "vocab_words", "vocab_weekly_words", "vocab_counts", "vocab_profiles")},
        }
        snapshot = {table: [dict(row) for row in db.execute(f"SELECT * FROM {table} WHERE {where}", args)] for table, (where, args) in selectors.items()}
        directory = Path(backup_dir)
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        backup = directory / f"{OPERATION}-{now}-{secrets.token_hex(3)}.json"
        fd = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            json.dump({"operation": OPERATION, "createdAt": now, "rows": snapshot}, output)
            output.flush()
            os.fsync(output.fileno())

        target_key = str(TARGET)
        target_wallet = next((row for row in plan["wallets"] if row["installId"] == target_key), {})
        unlocks = json.loads(target_wallet.get("themeUnlocks", "{}"))
        for wallet in plan["wallets"]:
            merge_unlocks(unlocks, json.loads(wallet["themeUnlocks"]))
        db.execute("""INSERT INTO gobblar_profiles (installId,balance,themeApplied,themeUnlocks,updatedAt) VALUES (?,?,?,?,?)
          ON CONFLICT(installId) DO UPDATE SET balance=excluded.balance,themeUnlocks=excluded.themeUnlocks,updatedAt=excluded.updatedAt""",
                   (target_key, plan["balance"], target_wallet.get("themeApplied", "{}"), json.dumps(unlocks), now))
        transferred = 0
        for wallet in plan["wallets"]:
            if wallet["installId"] == target_key:
                continue
            amount = wallet["balance"]
            transferred += amount
            db.execute("UPDATE gobblar_profiles SET balance=0,updatedAt=? WHERE installId=?", (now, wallet["installId"]))
            if amount:
                db.execute("INSERT INTO gobblar_ledger (installId,ts,delta,reason,meta) VALUES (?,?,?,?,?)",
                           (wallet["installId"], now, -amount, "account_merge_out", json.dumps({"operation": OPERATION, "target": TARGET})))
        if transferred:
            db.execute("INSERT INTO gobblar_ledger (installId,ts,delta,reason,meta) VALUES (?,?,?,?,?)",
                       (target_key, now, transferred, "account_merge_in", json.dumps({"operation": OPERATION, "source": SOURCE})))
        for key in plan["keys"]:
            if key == target_key:
                continue
            db.execute("""INSERT INTO vocab_words (installId,wordHash,firstSeenTs) SELECT ?,wordHash,firstSeenTs FROM vocab_words WHERE installId=?
              ON CONFLICT(installId,wordHash) DO UPDATE SET firstSeenTs=MIN(vocab_words.firstSeenTs,excluded.firstSeenTs)""", (target_key, key))
            db.execute("""INSERT INTO vocab_weekly_words (installId,weekStartTs,wordHash,firstSeenTs) SELECT ?,weekStartTs,wordHash,firstSeenTs FROM vocab_weekly_words WHERE installId=?
              ON CONFLICT(installId,weekStartTs,wordHash) DO UPDATE SET firstSeenTs=MIN(vocab_weekly_words.firstSeenTs,excluded.firstSeenTs)""", (target_key, key))
            for table in ("vocab_words", "vocab_weekly_words", "vocab_counts", "vocab_profiles"):
                db.execute(f"DELETE FROM {table} WHERE installId=?", (key,))
            db.execute("INSERT OR IGNORE INTO gobblar_week_rewards SELECT ?,weekId,source,amount,awardedAt FROM gobblar_week_rewards WHERE installId=?", (target_key, key))
            db.execute("INSERT OR IGNORE INTO gobblar_global_grants SELECT ?,grantKey,amount,awardedAt FROM gobblar_global_grants WHERE installId=?", (target_key, key))
        actual_count = db.execute("SELECT COUNT(*) FROM vocab_words WHERE installId=?", (target_key,)).fetchone()[0]
        if actual_count != plan["vocabulary"]:
            raise RuntimeError("Merged vocabulary count mismatch")
        db.execute("INSERT INTO vocab_counts VALUES (?,?,?) ON CONFLICT(installId) DO UPDATE SET count=excluded.count,updatedAt=excluded.updatedAt", (target_key, actual_count, now))
        db.execute("INSERT INTO vocab_profiles VALUES (?,?,?) ON CONFLICT(installId) DO UPDATE SET nick=excluded.nick,updatedAt=excluded.updatedAt", (target_key, plan["users"][TARGET]["username_display"], now))
        db.execute("UPDATE user_devices SET user_id=? WHERE user_id=?", (TARGET, SOURCE))
        db.execute("UPDATE legacy_username_reservations SET claimed_user_id=?,updated_at=? WHERE claimed_user_id=?", (TARGET, now, SOURCE))
        db.execute("DELETE FROM user_identity_migrations WHERE user_id IN (?, ?)", (TARGET, SOURCE))
        db.execute("UPDATE users SET password_hash=?,must_reset_password=1,updated_at=? WHERE id=?", (temporary_hash, now, TARGET))
        # Preserve the old account's history but retire its login credentials.
        db.execute("UPDATE users SET password_hash=?,must_reset_password=1,updated_at=? WHERE id=?", (retired_hash, now, SOURCE))
        db.execute("UPDATE user_sessions SET invalidated_at=COALESCE(invalidated_at,?) WHERE user_id IN (?, ?)", (now, TARGET, SOURCE))
        db.execute("INSERT INTO auth_data_migrations VALUES (?,?)", (OPERATION, now))
        db.commit()
        return {"ok": True, "userId": TARGET, "username": plan["users"][TARGET]["username_display"], "balance": plan["balance"], "transferred": transferred,
                "vocabulary": actual_count, "mustResetPassword": True, "sessionsInvalidated": True, "sourceLoginRetired": True, "backup": str(backup)}
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
            result = recover(db, password=json.load(sys.stdin)["password"], backup_dir=args.backup_dir)
        else:
            check_offline()
            plan = read_plan(db)
            result = {"dryRun": True, "target": TARGET, "source": SOURCE, "balance": plan["balance"], "vocabulary": plan["vocabulary"], "wallets": [{"installId": row["installId"], "balance": row["balance"]} for row in plan["wallets"]]}
        print(json.dumps(result))
    finally:
        db.close()


if __name__ == "__main__":
    main()
