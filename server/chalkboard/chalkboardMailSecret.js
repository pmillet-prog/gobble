import { readFileSync } from "node:fs";

// systemd decrypts an encrypted credential into the service's private runtime
// directory. Only its path is supplied to Node, never the encryption key.
export function readChalkboardMailPassword(env = process.env) {
  if (!env.SMTP_PASSWORD_FILE) return env.SMTP_PASSWORD || env.SMTP_PASS;
  try {
    // Ignore one final line ending from a password prompt; preserve real spaces.
    const password = readFileSync(env.SMTP_PASSWORD_FILE, "utf8").replace(/\r?\n$/, "");
    if (!password || password.includes("\0")) throw new Error("invalid_credential");
    return password;
  } catch (_) {
    // Never expose file contents or paths in the export status/logs. Do not
    // silently fall back to an old plaintext password after opting into a file.
    throw Object.assign(new Error("mail_credential_unavailable"), { code: "mail_credential_unavailable" });
  }
}
