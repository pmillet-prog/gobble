import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chalkboardMailConfig, isChalkboardMailEnabled } from "./chalkboardMail.js";
import { createChalkboardExports } from "./chalkboardExports.js";
import { openChalkboardRepository } from "./chalkboardRepository.js";
import { registerChalkboardRoutes } from "./registerChalkboardRoutes.js";

const state = weekId => ({ weekId, revision: 1, boards: { free: [] } });

async function repositoryFixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gobble-chalkboard-mail-policy-"));
  const repository = await openChalkboardRepository(path.join(directory, "board.sqlite"));
  t.after(async () => {
    await repository.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("gobble-chalkboard-mail-policy-"));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, repository };
}

function routeFixture({ enabled, job } = {}) {
  const routes = new Map();
  const calls = [];
  const app = Object.fromEntries(["get", "post", "delete"].map(method => [
    method, (url, handler) => routes.set(`${method} ${url}`, handler),
  ]));
  registerChalkboardRoutes({
    app,
    requireRequestIdentity: async (req, res) => {
      if (req.identity) return req.identity;
      res.status(401).json({ ok: false, error: "authentication_required" });
      return null;
    },
    isModerator: identity => identity.userId === "moderator",
    service: {
      queueExport: async identity => { calls.push(["enqueue", identity.userId]); return { id: "manual-new", weekId: "2026-10-05" }; },
      repository: { exportStatus: async () => job },
    },
    exports: {
      mailEnabled: () => enabled,
      configured: () => enabled,
      tick: async () => { calls.push(["tick"]); },
    },
  });
  return {
    calls,
    async request(route, req = {}) {
      const res = {
        code: 200, headers: {},
        set(key, value) { this.headers[key] = value; return this; },
        status(code) { this.code = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await routes.get(route)(req, res);
      return res;
    },
  };
}

test("chalkboard mail is disabled outside production before any SMTP credential is read", () => {
  for (const NODE_ENV of [undefined, "", "development", "test"]) {
    const env = {
      NODE_ENV,
      get SMTP_PASSWORD_FILE() { throw new Error("local credentials must not be read"); },
      get SMTP_HOST() { throw new Error("local transport must not be resolved"); },
    };
    assert.equal(isChalkboardMailEnabled(env), false);
    assert.equal(chalkboardMailConfig(env), null);
  }
  assert.equal(isChalkboardMailEnabled({ NODE_ENV: "production" }), true);
  const config = chalkboardMailConfig({
    NODE_ENV: "production", SMTP_HOST: "smtp.example.test", SMTP_PORT: "587",
    SMTP_USER: "test-user", SMTP_PASSWORD: "test-only",
    GOBBLE_CHALKBOARD_MAIL_FROM: "sender@example.test", GOBBLE_CHALKBOARD_MAIL_TO: "recipient@example.test",
  });
  assert.equal(config.from, "sender@example.test");
  assert.equal(config.to, "recipient@example.test");
  assert.equal(config.transport.host, "smtp.example.test");
  assert.equal(config.transport.auth.user, "test-user");
  assert.equal(config.transport.requireTLS, true);
});

test("local export ticks skip old pending mail but still render every new archive and manual copy", async t => {
  const { directory, repository } = await repositoryFixture(t);
  await repository.enqueue(state("2026-09-14"), "weekly-2026-09-14", 1);
  await repository.setPng("weekly-2026-09-14", path.join(directory, "already-weekly.png"));
  await repository.enqueue(state("2026-09-21"), "manual-old", 2, "moderator");
  await repository.setPng("manual-old", path.join(directory, "already-manual.png"));
  await repository.enqueue(state("2026-09-28"), "weekly-2026-09-28", 3);
  await repository.enqueue(state("2026-10-05"), "manual-new", 4, "moderator");
  const events = [];
  const exporter = createChalkboardExports({
    service: { repository, getSnapshot: async board => events.push(["rollover", board]) },
    directory, now: () => 100, mailEnabled: () => false,
    configured: () => { throw new Error("local export must not load SMTP configuration"); },
    runWorker: async data => { assert.equal(data.action, "render"); events.push(["render", path.basename(data.filename)]); },
    log: (...args) => assert.fail(`disabled mail must not be treated as a failure: ${args.join(" ")}`),
  });
  assert.equal(exporter.mailEnabled(), false);
  assert.equal(exporter.configured(), false);
  await exporter.tick();
  await exporter.tick();
  await exporter.tick();
  await exporter.stop();
  assert.deepEqual(events, [
    ["rollover", "free"], ["render", "weekly-2026-09-28.png"],
    ["rollover", "free"], ["render", "manual-new.png"],
    ["rollover", "free"],
  ]);
  assert.equal(await repository.nextExport(100, { mailEnabled: false }), undefined);
  assert.equal((await repository.nextExport(100)).id, "weekly-2026-09-14");
  assert.deepEqual((await repository.listArchives()).map(row => row.week_id), ["2026-09-28", "2026-09-14"]);
  for (const id of ["weekly-2026-09-14", "manual-old", "weekly-2026-09-28", "manual-new"]) {
    const job = await repository.exportStatus(id);
    assert.ok(job.png_path);
    assert.equal(job.sent_at, null);
    assert.equal(job.attempts, 0);
    assert.equal(job.error, null);
  }
});

test("production exports retain durable rendering and retry the same PNG after a delivery failure", async t => {
  const { directory, repository } = await repositoryFixture(t);
  await repository.enqueue(state("2026-09-28"), "weekly-2026-09-28", 1);
  const events = [];
  let time = 100;
  let fail = true;
  const exporter = createChalkboardExports({
    service: { repository, getSnapshot: async () => events.push("rollover") },
    directory, now: () => time, mailEnabled: () => true, configured: () => true, log: () => {},
    runWorker: async data => {
      events.push(data.action);
      if (data.action === "send") {
        assert.equal((await repository.exportStatus(data.id)).png_path, data.filename);
        if (fail) throw new Error("smtp_test_failure");
      }
    },
  });
  assert.equal(exporter.mailEnabled(), true);
  assert.equal(exporter.configured(), true);
  await exporter.tick();
  let job = await repository.exportStatus("weekly-2026-09-28");
  assert.deepEqual(events, ["rollover", "render", "send"]);
  assert.equal(job.error, "smtp_test_failure");
  assert.equal(job.attempts, 1);
  assert.equal(job.sent_at, null);
  assert.equal(await repository.nextExport(time, { mailEnabled: true }), undefined);
  time += 60000;
  fail = false;
  await exporter.tick();
  await exporter.stop();
  job = await repository.exportStatus("weekly-2026-09-28");
  assert.deepEqual(events, ["rollover", "render", "send", "rollover", "send"]);
  assert.equal(job.sent_at, time);
  assert.equal(job.error, null);
  assert.equal(await repository.nextExport(time, { mailEnabled: true }), undefined);
});

test("local manual send remains authorized by account but rejects without queueing a message", async () => {
  const fixture = routeFixture({ enabled: false });
  const route = "post /api/chalkboard/admin/send-copy";
  assert.equal((await fixture.request(route)).code, 401);
  assert.equal((await fixture.request(route, { identity: { userId: "player" } })).code, 403);
  const response = await fixture.request(route, { identity: { userId: "moderator" } });
  assert.equal(response.code, 503);
  assert.equal(response.body.error, "chalkboard_mail_disabled");
  assert.deepEqual(fixture.calls, []);
});

test("production manual send still queues the copy and triggers delivery", async () => {
  const fixture = routeFixture({ enabled: true });
  const response = await fixture.request("post /api/chalkboard/admin/send-copy", { identity: { userId: "moderator" } });
  assert.equal(response.code, 202);
  assert.deepEqual(response.body, { ok: true, id: "manual-new", weekId: "2026-10-05", mailConfigured: true });
  assert.deepEqual(fixture.calls, [["enqueue", "moderator"], ["tick"]]);
});

test("local completed PNG reports archived instead of waiting forever for mail", async () => {
  for (const error of [null, "old_smtp_failure"]) {
    const fixture = routeFixture({ enabled: false, job: { id: "manual-old", png_path: "/local/archive.png", sent_at: null, error } });
    const response = await fixture.request("get /api/chalkboard/admin/exports/:id", {
      params: { id: "manual-old" }, identity: { userId: "moderator" },
    });
    assert.equal(response.code, 200);
    assert.equal(response.body.status, "archived");
    assert.equal(response.body.pngReady, true);
    assert.equal(response.body.mailConfigured, false);
  }
});
