import { createHash, randomBytes } from "node:crypto";
import { runSqliteImmediateTransaction } from "../../sqliteQueue.js";
import { withAccountMaintenance } from "../../admin/accountMaintenance.js";
import {
  accountRecoveryMailConfig, passwordResetMessage, accountSupportMessage, sendAccountRecoveryMail,
} from "./accountRecoveryMail.js";

const MINUTE = 60 * 1000;
const digest = value => createHash("sha256").update(value).digest("hex");
const credentialsHash = user => digest(`${user.password_hash}\0${user.email || ""}`);
const fail = code => { throw new Error(code); };
const emailValid = value => value.length <= 254 && /^[^\s@<>,;:"\[\]\\]+@[^\s@<>,;:"\[\]\\]+\.[^\s@<>,;:"\[\]\\]+$/u.test(value);

export function createAccountRecoveryService({
  getDb, runWrite, hashPassword, validatePassword, normalizeUsername, clearAuthCache,
  getMailConfig = accountRecoveryMailConfig, sendMail = sendAccountRecoveryMail,
  now = Date.now, log = code => console.warn(`[account-recovery] ${code}`),
}) {
  const jobs = new Set();
  function config() {
    try { return getMailConfig(); } catch (_) { fail("mail_unavailable"); }
  }
  function usernameInput(value) {
    if (typeof value !== "string" || !value.trim() || value.length > 100 || /[\x00-\x1f\x7f]/.test(value)) fail("username_required");
    return normalizeUsername(value);
  }
  async function quota(key, limit, duration) {
    const db = await getDb();
    const timestamp = now();
    const bucket = digest(key);
    return runWrite(() => runSqliteImmediateTransaction(db, async () => {
      await db.run("DELETE FROM account_recovery_limits WHERE expires_at <= ?", timestamp);
      const entry = await db.get("SELECT count FROM account_recovery_limits WHERE bucket = ?", bucket);
      if (entry?.count >= limit) return false;
      await db.run(`INSERT INTO account_recovery_limits(bucket,count,expires_at) VALUES (?,1,?)
        ON CONFLICT(bucket) DO UPDATE SET count = count + 1`, bucket, timestamp + duration);
      return true;
    }));
  }
  async function requestQuota(kind, ip, limit, duration) {
    if (!await quota(`${kind}:ip:${String(ip || "unknown").slice(0, 100)}`, limit, duration)) fail("recovery_rate_limited");
  }
  async function deliverReset(username, mailConfig) {
    const db = await getDb();
    const user = await db.get("SELECT id,username_display,password_hash,email FROM users WHERE username_normalized = ?", username);
    if (!user?.email || !emailValid(user.email)) return;
    if (!await quota(`reset:mail:${user.email.toLowerCase()}`, 5, 60 * MINUTE)) return;
    const token = randomBytes(32).toString("hex");
    const tokenHash = digest(token);
    await runWrite(() => runSqliteImmediateTransaction(db, async () => {
      await db.run("DELETE FROM password_reset_tokens WHERE expires_at <= ?", now());
      // A deletion/fusion or a credential change during preparation cancels delivery.
      const current = await db.get("SELECT password_hash,email FROM users WHERE id = ?", user.id);
      if (!current || credentialsHash(current) !== credentialsHash(user)) fail("account_changed");
      await db.run("INSERT INTO password_reset_tokens VALUES (?,?,?,?,?)", tokenHash, user.id, credentialsHash(user), now(), now() + 30 * MINUTE);
    }));
    try {
      await sendMail(passwordResetMessage({ username: user.username_display, email: user.email, token }, mailConfig), mailConfig);
    } catch (_) {
      await runWrite(() => db.run("DELETE FROM password_reset_tokens WHERE token_hash = ?", tokenHash));
      fail("mail_unavailable");
    }
  }
  async function requestReset({ username: rawUsername, ip }) {
    const username = usernameInput(rawUsername);
    await requestQuota("reset", ip, 10, 15 * MINUTE);
    const mailConfig = config();
    if (jobs.size >= 4) fail("recovery_busy");
    if (!await quota("reset:global", 100, 60 * MINUTE)) fail("recovery_rate_limited");
    if (!await quota(`reset:name:${username}`, 3, 60 * MINUTE)) return { ok: true };
    if (jobs.size >= 4) fail("recovery_busy");
    // Return identically for missing accounts/emails. SMTP latency must not reveal
    // which pseudonyms have an email. Bounded jobs do not hold the SQLite queue.
    const job = Promise.resolve().then(() => deliverReset(username, mailConfig))
      .catch(() => log("reset_delivery_failed"))
      .finally(() => jobs.delete(job));
    jobs.add(job);
    return { ok: true };
  }
  async function submitSupport({ username, message, replyEmail = "", ip }) {
    usernameInput(username);
    if (typeof message !== "string" || message.trim().length < 10 || message.length > 3000 || message.includes("\0")) fail("support_message_invalid");
    if (typeof replyEmail !== "string" || (replyEmail.trim() && !emailValid(replyEmail.trim()))) fail("email_invalid");
    await requestQuota("support", ip, 3, 60 * MINUTE);
    if (!await quota("support:global", 20, 60 * MINUTE)) fail("recovery_rate_limited");
    const mailConfig = config();
    try {
      await sendMail(accountSupportMessage({ username: username.trim(), message: message.trim(), replyEmail: replyEmail.trim() }, mailConfig), mailConfig);
    } catch (_) { log("support_delivery_failed"); fail("mail_unavailable"); }
    return { ok: true };
  }
  async function completeReset({ token, newPassword, ip, onReset = () => {} }) {
    await requestQuota("complete", ip, 30, 15 * MINUTE);
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) fail("reset_link_invalid");
    const validation = validatePassword(newPassword);
    if (!validation.ok) fail(validation.error);
    const db = await getDb();
    const tokenHash = digest(token);
    const entry = await db.get("SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?", tokenHash, now());
    if (!entry) fail("reset_link_invalid");
    return withAccountMaintenance([entry.user_id], async () => {
      clearAuthCache({ userId: entry.user_id });
      try {
        const passwordHash = await hashPassword(newPassword);
        await runWrite(() => runSqliteImmediateTransaction(db, async () => {
          const row = await db.get(`SELECT t.credentials_hash, u.password_hash, u.email FROM password_reset_tokens t
            JOIN users u ON u.id = t.user_id WHERE t.token_hash = ? AND t.expires_at > ?`, tokenHash, now());
          if (!row || row.credentials_hash !== credentialsHash(row)) fail("reset_link_invalid");
          await db.run("UPDATE users SET password_hash = ?, must_reset_password = 0, updated_at = ? WHERE id = ?", passwordHash, now(), entry.user_id);
          await db.run("DELETE FROM password_reset_tokens WHERE user_id = ?", entry.user_id);
          await db.run("UPDATE user_sessions SET invalidated_at = ? WHERE user_id = ? AND invalidated_at IS NULL", now(), entry.user_id);
        }));
        try { await onReset(entry.user_id); } catch (_) { log("session_disconnect_failed"); }
        return { ok: true };
      } finally { clearAuthCache({ userId: entry.user_id }); }
    });
  }
  return { requestReset, submitSupport, completeReset, waitForDeliveries: () => Promise.all([...jobs]) };
}
