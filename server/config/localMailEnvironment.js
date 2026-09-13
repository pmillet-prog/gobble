import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const MAIL_KEYS = new Set([
  "GOBBLE_MAIL_TRANSPORT", "GOBBLE_SENDMAIL_PATH",
  "GOBBLE_CHALKBOARD_MAIL_FROM", "GOBBLE_CHALKBOARD_MAIL_TO",
  "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_FROM",
  "SMTP_PASSWORD", "SMTP_PASS", "SMTP_PASSWORD_FILE",
]);

export async function loadLocalMailEnvironment({
  env = process.env,
  filename = new URL("../../.tmp/chalkboard-mail.env", import.meta.url),
} = {}) {
  // Production credentials belong to the service manager, outside the checkout.
  if (env.NODE_ENV === "production") return false;
  let contents;
  try { contents = await readFile(filename, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") return false;
    throw new Error("local_mail_config_unreadable", { cause: error });
  }
  for (const [key, value] of Object.entries(parseEnv(contents))) {
    if (MAIL_KEYS.has(key) && env[key] === undefined) env[key] = value;
  }
  return true;
}
