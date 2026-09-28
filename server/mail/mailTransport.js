import { readFileSync } from "node:fs";

export function readMailPassword(env = process.env) {
  if (!env.SMTP_PASSWORD_FILE) return env.SMTP_PASSWORD || env.SMTP_PASS;
  try {
    const password = readFileSync(env.SMTP_PASSWORD_FILE, "utf8").replace(/\r?\n$/, "");
    if (!password || password.includes("\0")) throw new Error("invalid_credential");
    return password;
  } catch (_) {
    // Never log credentials, their contents or their filesystem location.
    throw Object.assign(new Error("mail_credential_unavailable"), { code: "mail_credential_unavailable" });
  }
}

export function mailTransportConfig(env = process.env) {
  if (env.GOBBLE_MAIL_TRANSPORT === "sendmail") return {
    sendmail: true, newline: "unix", path: env.GOBBLE_SENDMAIL_PATH || "/usr/sbin/sendmail",
  };
  if (!env.SMTP_HOST) return null;
  const port = Number(env.SMTP_PORT || 465);
  return {
    host: env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: readMailPassword(env) } } : {}),
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 60000,
  };
}
