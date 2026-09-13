import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadLocalMailEnvironment } from "../config/localMailEnvironment.js";

test("local startup loads mail settings without overriding the launcher or unrelated configuration", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "gobble-mail-env-"));
  const filename = path.join(directory, "mail.env");
  try {
    await writeFile(filename, 'SMTP_HOST=smtp.example.test\nSMTP_PORT=587\nSMTP_PASSWORD="test # with spaces"\nNODE_ENV=production\nGOBBLE_DATA_DIR=unrelated\n');
    const env = { SMTP_HOST: "provided.example.test" };
    assert.equal(await loadLocalMailEnvironment({ env, filename }), true);
    assert.deepEqual(env, { SMTP_HOST: "provided.example.test", SMTP_PORT: "587", SMTP_PASSWORD: "test # with spaces" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("production never reads the local secret and an absent local file does not block startup", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "gobble-mail-env-"));
  try {
    const env = { NODE_ENV: "production" };
    // Reading a directory would fail; production must not even try.
    assert.equal(await loadLocalMailEnvironment({ env, filename: directory }), false);
    assert.deepEqual(env, { NODE_ENV: "production" });
    assert.equal(await loadLocalMailEnvironment({ env: {}, filename: path.join(directory, "missing.env") }), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
