import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import { accountRecoveryMailConfig, accountSupportMessage, passwordResetMessage, sendAccountRecoveryMail } from "./accountRecoveryMail.js";

test("account mail uses the existing TLS SMTP settings, canonical origin and support sender", () => {
  const config = accountRecoveryMailConfig({ SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "support", SMTP_PASS: "test-only" });
  assert.equal(config.from, "support@gobble.fr");
  assert.equal(config.supportTo, "pmillet@gmail.com");
  assert.equal(config.origin, "https://gobble.fr");
  assert.equal(config.transport.requireTLS, true);
  assert.equal(config.transport.auth.pass, "test-only");
  assert.throws(() => accountRecoveryMailConfig({}), /mail_unavailable/);
  assert.throws(() => accountRecoveryMailConfig({ GOBBLE_MAIL_TRANSPORT: "sendmail", NODE_ENV: "production", GOBBLE_PUBLIC_URL: "http://gobble.fr" }), /mail_unavailable/);
});

test("generated MIME contains a usable fragment link and can use the local in-memory transport", async () => {
  const config = { from: "support@gobble.fr", supportTo: "pmillet@gmail.com", origin: "https://gobble.fr", transport: { streamTransport: true, buffer: true } };
  const token = "a".repeat(64);
  const message = passwordResetMessage({ username: "Coton", email: "coton@example.test", token }, config);
  const transport = nodemailer.createTransport(config.transport);
  try {
    const result = await transport.sendMail(message);
    assert.deepEqual(result.envelope.to, ["coton@example.test"]);
    assert.match(result.message.toString(), /Content-Type: text\/plain/);
    const url = new URL(message.text.match(/https:\/\/[^\s]+/)[0]);
    assert.equal(url.pathname, "/reset-password");
    assert.equal(url.search, "");
    assert.equal(new URLSearchParams(url.hash.slice(1)).get("token"), token);
  } finally { transport.close(); }
  await sendAccountRecoveryMail(message, config);
  await sendAccountRecoveryMail(accountSupportMessage({ username: "Coton", message: "Un message de test.", replyEmail: "" }, config), config);
});
