import { runSqliteImmediateTransaction } from "../sqliteQueue.js";
import { withAccountMaintenance } from "./accountMaintenance.js";
import { mergeAbsoluteRecords, mergeLifetimeStats } from "./accountRecords.js";

const idOf = raw => {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("invalid_account");
  return id;
};
const publicUser = row => ({ id: row.id, username: row.username_display });

// Uses the auth write queue and the same database transaction as session changes.
// Physical device IDs never establish ownership of another account's progress.
export function createAccountAdminService({ getDb, runWrite, hashPassword, clearAuthCache, getWeeklySnapshot = () => null }) {
  async function user(db, id) {
    const row = await db.get("SELECT * FROM users WHERE id=?", idOf(id));
    if (!row) throw new Error("account_not_found");
    return row;
  }
  async function readRecords(db, id) {
    const row = await db.get("SELECT records_json FROM account_absolute_records WHERE user_id=?", id);
    return mergeAbsoluteRecords(getWeeklySnapshot(String(id))?.allTime, row ? JSON.parse(row.records_json) : null);
  }
  async function readPlan(db, targetId, sourceId) {
    if (targetId === sourceId) throw new Error("same_account");
    const target = await user(db, targetId), source = await user(db, sourceId);
    // Refuse unmigrated legacy data rather than guess ownership from a shared device.
    for (const account of [target, source]) {
      const legacy = await db.get("SELECT 1 FROM vocab_words WHERE installId=? LIMIT 1", account.primary_install_id);
      if (legacy) throw new Error("legacy_progression_pending");
    }
    const count = await db.get("SELECT COUNT(DISTINCT wordHash) AS count FROM vocab_words WHERE installId IN (?,?)", String(targetId), String(sourceId));
    const before = await db.get("SELECT COUNT(*) AS count FROM vocab_words WHERE installId=?", String(targetId));
    const records = mergeAbsoluteRecords(await readRecords(db, targetId), await readRecords(db, sourceId));
    const lifetime = mergeLifetimeStats(
      await db.get("SELECT * FROM player_lifetime_stats WHERE installId=?", String(targetId)),
      await db.get("SELECT * FROM player_lifetime_stats WHERE installId=?", String(sourceId)), records);
    return { target: publicUser(target), source: publicUser(source), vocabulary: count.count, newWords: count.count - before.count, lifetime, records, deletesSource: true, transfersGobblars: false };
  }
  async function snapshot(db, ids) {
    const placeholders = ids.map(() => "?").join(",");
    const rows = { users: await db.all(`SELECT * FROM users WHERE id IN (${placeholders})`, ...ids) };
    const selectors = [];
    for (const { name } of await db.all("SELECT name FROM sqlite_master WHERE type='table'")) {
      if (!/^[a-zA-Z0-9_]+$/.test(name) || name === "admin_account_operations") continue;
      const columns = new Set((await db.all(`PRAGMA table_info("${name}")`)).map(row => row.name));
      const column = columns.has("user_id") ? "user_id" : columns.has("installId") ? "installId" : columns.has("claimed_user_id") ? "claimed_user_id" : null;
      if (!column) continue;
      rows[name] = await db.all(`SELECT * FROM "${name}" WHERE ${column} IN (${placeholders})`, ...ids.map(id => column === "installId" ? String(id) : id));
      selectors.push({ table: name, column });
    }
    rows.player_live_head_to_head = await db.all(`SELECT * FROM player_live_head_to_head WHERE playerAUserId IN (${placeholders}) OR playerBUserId IN (${placeholders})`, ...ids.map(String), ...ids.map(String));
    return { rows, selectors };
  }
  async function operate({ action, targetId: rawTarget, sourceId: rawSource, actorId, operationId, assertOffline = () => {}, assertAllowed = () => {} }) {
    const targetId = idOf(rawTarget), sourceId = action === "merge" ? idOf(rawSource) : null;
    if (!/^[\w-]{16,100}$/.test(String(operationId || ""))) throw new Error("invalid_operation");
    if (!["reset-password", "merge"].includes(action)) throw new Error("invalid_operation");
    if (sourceId === targetId) throw new Error("same_account");
    if ([targetId, sourceId].includes(Number(actorId))) throw new Error("cannot_target_self");
    const ids = [targetId, sourceId].filter(Boolean);
    const db = await getDb();
    const hash = action === "reset-password" ? await hashPassword("gobble2026") : null;
    return withAccountMaintenance(ids, async () => {
      // Invalidate cached and in-flight session results before the transaction,
      // then again after commit so an old login cannot linger.
      ids.forEach(id => clearAuthCache({ userId: id }));
      return runWrite(() => runSqliteImmediateTransaction(db, async () => {
      const previous = await db.get("SELECT * FROM admin_account_operations WHERE operation_id=?", operationId);
      if (previous) {
        if (previous.actor_user_id !== Number(actorId) || previous.target_user_id !== targetId || previous.source_user_id !== sourceId || previous.action !== action) throw new Error("invalid_operation");
        return JSON.parse(previous.result_json);
      }
      for (const id of ids) await assertAllowed(await user(db, id));
      assertOffline(ids);
      const recent = await db.get("SELECT MAX(last_seen_at) AS ts FROM user_sessions WHERE user_id IN (?,?) AND invalidated_at IS NULL", targetId, sourceId || targetId);
      if (Number(recent?.ts) > Date.now() - 60000) throw new Error("account_recently_active");
      const now = Date.now();
      const backup = await snapshot(db, ids);
      let result;
      if (action === "reset-password") {
        await db.run("UPDATE users SET password_hash=?,must_reset_password=1,updated_at=? WHERE id=?", hash, now, targetId);
        await db.run("UPDATE user_sessions SET invalidated_at=COALESCE(invalidated_at,?) WHERE user_id=?", now, targetId);
        result = { ok: true, target: publicUser(await user(db, targetId)), mustResetPassword: true };
      } else {
        const plan = await readPlan(db, targetId, sourceId);
        for (const [table, columns, conflict] of [
          ["vocab_words", "wordHash,firstSeenTs", "installId,wordHash"],
          ["vocab_weekly_words", "weekStartTs,wordHash,firstSeenTs", "installId,weekStartTs,wordHash"],
        ]) await db.run(`INSERT INTO ${table}(installId,${columns}) SELECT ?,${columns} FROM ${table} WHERE installId=? ON CONFLICT(${conflict}) DO UPDATE SET firstSeenTs=MIN(${table}.firstSeenTs,excluded.firstSeenTs)`, String(targetId), String(sourceId));
        await db.run("INSERT INTO vocab_counts(installId,count,updatedAt) VALUES(?,?,?) ON CONFLICT(installId) DO UPDATE SET count=excluded.count,updatedAt=excluded.updatedAt", String(targetId), plan.vocabulary, now);
        await db.run("INSERT INTO vocab_profiles(installId,nick,updatedAt) VALUES(?,?,?) ON CONFLICT(installId) DO UPDATE SET nick=excluded.nick,updatedAt=excluded.updatedAt", String(targetId), plan.target.username, now);
        const stats = { ...plan.lifetime, installId: String(targetId), nick: plan.target.username, updatedAt: now };
        const columns = Object.keys(stats);
        await db.run(`INSERT INTO player_lifetime_stats(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")}) ON CONFLICT(installId) DO UPDATE SET ${columns.filter(key => key !== "installId").map(key => `${key}=excluded.${key}`).join(",")}`, ...columns.map(key => stats[key]));
        await db.run("INSERT INTO account_absolute_records(user_id,records_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET records_json=excluded.records_json,updated_at=excluded.updated_at", targetId, JSON.stringify(plan.records), now);
        for (const { table, column } of backup.selectors) await db.run(`DELETE FROM "${table}" WHERE ${column}=?`, column === "installId" ? String(sourceId) : sourceId);
        await db.run("DELETE FROM player_live_head_to_head WHERE playerAUserId=? OR playerBUserId=?", String(sourceId), String(sourceId));
        await db.run("DELETE FROM users WHERE id=?", sourceId);
        result = { ok: true, target: plan.target, source: plan.source, vocabulary: plan.vocabulary, newWords: plan.newWords, sourceDeleted: true, gobblarsTransferred: false };
      }
      assertOffline(ids);
      await db.run("INSERT INTO admin_account_operations VALUES(?,?,?,?,?,?,?,?)", operationId, Number(actorId), targetId, sourceId, action, now, JSON.stringify(result), JSON.stringify(backup.rows));
      return result;
      }, { label: "admin-account" })).finally(() => { ids.forEach(id => clearAuthCache({ userId: id })); });
    });
  }
  return {
    operate,
    async search(query) {
      const value = String(query || "").trim().toLowerCase().slice(0, 25);
      if (value.length < 2) return [];
      const db = await getDb();
      return (await db.all("SELECT id,username_display FROM users WHERE instr(username_normalized,?)>0 ORDER BY username_normalized LIMIT 20", value)).map(publicUser);
    },
    async preview(targetId, sourceId) { return readPlan(await getDb(), idOf(targetId), idOf(sourceId)); },
  };
}
