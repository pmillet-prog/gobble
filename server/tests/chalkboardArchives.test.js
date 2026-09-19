import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { openChalkboardRepository } from "../chalkboard/chalkboardRepository.js";
import { registerChalkboardRoutes } from "../chalkboard/registerChalkboardRoutes.js";

test("weekly gallery survives reopening, excludes manual and incomplete exports, and does not depend on mail delivery", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gobble-archives-"));
  let repository;
  let server;
  try {
    repository = await openChalkboardRepository(path.join(directory, "board.sqlite"));
    const state = weekId => ({ weekId, revision: 1, boards: { free: [] } });
    const image = path.join(directory, "archive.png");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");
    await writeFile(image, png);
    for (const week of ["2026-08-24", "2026-08-31", "2026-09-07"]) {
      await repository.enqueue(state(week), `weekly-${week}`, 1);
      if (week !== "2026-09-07") await repository.setPng(`weekly-${week}`, image);
    }
    await repository.enqueue(state("2026-09-14"), "manual-private", 2, "private-author-id");
    await repository.setPng("manual-private", image);
    await repository.markFailed("weekly-2026-08-31", 3, 1, "mail_not_configured");
    await repository.close();
    repository = await openChalkboardRepository(path.join(directory, "board.sqlite"));
    assert.deepEqual((await repository.listArchives()).map(row => row.week_id), ["2026-08-31", "2026-08-24"]);
    assert.deepEqual((await repository.listArchives("2026-08-31", 1)).map(row => row.week_id), ["2026-08-24"]);
    assert.equal(await repository.getArchive("2026-09-14"), undefined);
    assert.equal(await repository.getArchive("2026-09-07"), undefined);

    // An isolated HTTP fixture; never import or launch the game backend.
    const app = express();
    let maintenance = false;
    registerChalkboardRoutes({ app, service: { repository }, isMaintenanceModeActive: () => maintenance,
      getRequestIdentity: () => { throw new Error("public archives should not need identity"); } });
    server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const url = `http://127.0.0.1:${server.address().port}`;
    const list = await fetch(`${url}/api/chalkboard/archives`);
    assert.equal(list.status, 200); // Must precede the /:board route.
    const payload = await list.json();
    assert.deepEqual(payload, { ok: true, archives: ["2026-08-31", "2026-08-24"].map(weekId => ({ weekId, imageUrl: `/api/chalkboard/archives/${weekId}/image.png` })), next: null });
    const response = await fetch(url + payload.archives[0].imageUrl);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.match(response.headers.get("cache-control"), /immutable/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    for (const week of ["2026-09-14", "2026-09-07", "manual-private", "..%2F..%2Fsecret"]) {
      assert.equal((await fetch(`${url}/api/chalkboard/archives/${week}/image.png`)).status, 404);
    }
    assert.equal((await fetch(`${url}/api/chalkboard/archives?before=not-a-week`)).status, 400);
    await repository.setPng("weekly-2026-08-24", path.join(directory, "missing.png"));
    const missing = await fetch(`${url}/api/chalkboard/archives/2026-08-24/image.png`);
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get("cache-control"), "no-store");
    assert.equal((await missing.json()).error, "archive_unavailable");
    maintenance = true;
    assert.equal((await fetch(url + payload.archives[0].imageUrl)).status, 503);
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await repository?.close();
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("gobble-archives-"));
    await rm(directory, { recursive: true, force: true });
  }
});

test("archive listing paginates metadata without returning private database columns", async () => {
  const routes = new Map();
  let query;
  const rows = Array.from({ length: 31 }, (_, i) => ({ week_id: `2026-08-${String(31 - i).padStart(2, "0")}`, png_path: "/private/path", snapshot: "private", requested_by: "private" }));
  registerChalkboardRoutes({ app: Object.fromEntries(["get", "post", "delete"].map(method => [method, (url, fn) => routes.set(`${method} ${url}`, fn)])),
    service: { repository: { listArchives: async (...args) => { query = args; return rows; } } } });
  const res = { set() { return this; }, json(body) { this.body = body; }, status() { return this; } };
  await routes.get("get /api/chalkboard/archives")({ query: { before: "2026-09-07" } }, res);
  assert.deepEqual(query, ["2026-09-07", 31]);
  assert.equal(res.body.archives.length, 30);
  assert.equal(res.body.next, rows[29].week_id);
  assert.deepEqual(Object.keys(res.body.archives[0]), ["weekId", "imageUrl"]);
});
