import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chalkboardMailConfig } from "../chalkboard/chalkboardMail.js";

const base = { SMTP_HOST: "smtp.example.test", SMTP_USER: "support", SMTP_PORT: "587" };

test("SMTP can read a systemd runtime credential without putting the password in its environment", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "gobble-mail-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "gobble-smtp-password");
  writeFileSync(filename, "  test-only & $ secret  \r\n", { mode: 0o600 });
  const env = { ...base, SMTP_PASSWORD_FILE: filename, SMTP_PASSWORD: "stale-plaintext" };
  const config = chalkboardMailConfig(env);
  assert.equal(config.transport.auth.pass, "  test-only & $ secret  ");
  assert.equal(env.SMTP_PASSWORD, "stale-plaintext", "reading the credential does not copy it into the environment");
  assert.equal(config.transport.secure, false);
  assert.equal(config.transport.requireTLS, true);
});

test("an unusable credential fails safely instead of falling back to plaintext", t => {
  const directory = mkdtempSync(path.join(tmpdir(), "gobble-mail-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "gobble-smtp-password");
  const check = () => assert.throws(() => chalkboardMailConfig({ ...base, SMTP_PASSWORD_FILE: filename, SMTP_PASS: "old-secret" }), error => {
    assert.equal(error.code, "mail_credential_unavailable");
    assert.equal(error.message, "mail_credential_unavailable");
    assert.equal(error.path, undefined);
    return true;
  });
  check();
  writeFileSync(filename, "\n"); check();
  writeFileSync(filename, "bad\0secret"); check();
});

test("existing mail configuration remains usable and unused secrets are not read", () => {
  assert.equal(chalkboardMailConfig({ ...base, SMTP_PASS: "legacy-test" }).transport.auth.pass, "legacy-test");
  assert.equal(chalkboardMailConfig({ SMTP_PASSWORD_FILE: "/missing" }), null);
  assert.equal(chalkboardMailConfig({ GOBBLE_MAIL_TRANSPORT: "sendmail", SMTP_PASSWORD_FILE: "/missing" }).transport.sendmail, true);
});
