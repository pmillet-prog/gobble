import test from "node:test";
import assert from "node:assert/strict";
import { createChalkboardExports } from "../chalkboard/chalkboardExports.js";
import { chalkboardMailConfig, sendChalkboardPng } from "../chalkboard/chalkboardMail.js";

test("PNG generation is durable before delivery; SMTP failure retries the same saved image", async () => {
  const job = { id: "weekly-2026-09-07", week_id: "2026-09-07", snapshot: '{"interventions":[]}', attempts: 0, png_path: null };
  const events = [];
  let fail = true;
  const service = { getSnapshot: async () => events.push("rollover"), repository: {
    nextExport: async () => job,
    setPng: async (id, file) => { events.push("persist_png"); job.png_path = file; },
    markSent: async () => events.push("sent"),
    markFailed: async (id, now, attempts) => { events.push("retry"); job.attempts = attempts; },
  } };
  const exporter = createChalkboardExports({ service, directory: "/exports", configured: () => true, log: () => {}, runWorker: async data => { events.push(data.action); if (data.action === "send" && fail) throw new Error("smtp_unavailable"); } });
  await Promise.all([exporter.tick(), exporter.tick()]);
  assert.deepEqual(events, ["rollover", "render", "persist_png", "send", "retry"]);
  fail = false;
  events.length = 0;
  await exporter.tick();
  assert.deepEqual(events, ["rollover", "send", "sent"]);
  await exporter.stop();
});

test("a missing mail configuration still generates and retains the PNG", async () => {
  const events = [];
  const job = { id: "manual-test", week_id: "2026-09-07", snapshot: '{}', attempts: 0 };
  const exporter = createChalkboardExports({ service: { getSnapshot: async () => {}, repository: {
    nextExport: async () => job, setPng: async () => events.push("saved"),
    markFailed: async (id, now, attempts, reason) => events.push(reason),
  } }, configured: () => false, log: () => {}, runWorker: async ({ action }) => events.push(action) });
  await exporter.tick();
  assert.deepEqual(events, ["render", "saved", "mail_not_configured"]);
  await exporter.stop();
});

test("an unreadable credential keeps export status usable and retains the PNG for retry", async () => {
  const events = [];
  const job = { id: "missing-credential", week_id: "2026-09-07", snapshot: '{}', attempts: 0 };
  const exporter = createChalkboardExports({ service: { getSnapshot: async () => {}, repository: {
    nextExport: async () => job,
    setPng: async () => events.push("saved"),
    markFailed: async (id, now, attempts, reason) => events.push(reason),
  } }, configured: () => { throw new Error("mail_credential_unavailable"); }, log: () => {},
  runWorker: async ({ action }) => events.push(action) });
  assert.equal(exporter.configured(), false);
  await exporter.tick();
  assert.deepEqual(events, ["render", "saved", "mail_credential_unavailable"]);
  await exporter.stop();
});

test("mail supports an existing sendmail relay or authenticated SMTP without client-supplied recipients", async () => {
  assert.equal(chalkboardMailConfig({}), null);
  assert.equal(chalkboardMailConfig({ GOBBLE_MAIL_TRANSPORT: "sendmail" }).transport.path, "/usr/sbin/sendmail");
  const config = chalkboardMailConfig({ SMTP_HOST: "smtp.example.test", SMTP_PORT: "587", SMTP_USER: "support", SMTP_PASSWORD: "test-only" });
  assert.equal(config.transport.requireTLS, true);
  assert.equal(config.transport.auth.user, "support");
  // Stream transport exercises MIME/attachment composition locally. No mail
  // is sent by the tests and no production SMTP configuration is read.
  const result = await sendChalkboardPng({ id: "test", weekId: "2026-09-07", filename: new URL("../../package.json", import.meta.url).pathname.replace(/^\/(\w:)/, "$1") }, { from: "sender@example.test", to: "recipient@example.test", transport: { streamTransport: true, buffer: true } });
  assert.deepEqual(result, { sent: true });
});
