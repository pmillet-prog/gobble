import test from "node:test";
import assert from "node:assert/strict";
import { registerChalkboardRoutes } from "../chalkboard/registerChalkboardRoutes.js";

const admin = { userId: 17 };
const player = { userId: 23 };

function harness({ onIdentity = () => {} } = {}) {
  let maintenance = false;
  const routes = new Map();
  const calls = [];
  const snapshot = { ok: true, board: "free", weekId: "2026-09-07", revision: 1, interventions: [] };
  registerChalkboardRoutes({
    app: Object.fromEntries(["get", "post", "delete"].map(method => [
      method, (path, handler) => routes.set(`${method} ${path}`, handler),
    ])),
    getRequestIdentity: async req => { onIdentity(); return req.identity; },
    requireRequestIdentity: async (req, res) => {
      onIdentity();
      if (req.identity) return req.identity;
      res.status(401).json({ ok: false, error: "authentication_required" });
      return null;
    },
    isModerator: identity => identity?.userId === admin.userId,
    isMaintenanceModeActive: () => maintenance,
    service: {
      getFonts() { calls.push(["fonts"]); return [{ id: "nouvelle-craie", src: "/chalkfont/nouvelle-craie.woff2" }]; },
      canUndoDeletion(board, identity) { return identity?.userId === admin.userId; },
      deleteIntervention(id, identity) { calls.push(["delete", id, identity]); return { ok: true }; },
      undoLastDeletion(board, identity) { calls.push(["undo", board, identity]); return { ok: true, intervention: { id: "restored" } }; },
      getSnapshot(board) { calls.push(["read", board]); return snapshot; },
      exportSealedAudit() { calls.push(["audit"]); return { entries: [] }; },
      addIntervention(board, body, identity) {
        calls.push(["publish", board, body, identity]);
        return { ok: true, intervention: { id: "published" } };
      },
      async queueExport(identity) { calls.push(["export", identity]); return { id: "manual-test", weekId: snapshot.weekId }; },
      repository: { async exportStatus(id) { calls.push(["export-status", id]); return { id, png_path: "/private/runtime/tableau.png", sent_at: 1 }; } },
    },
    exports: { tick: async () => {}, configured: () => true },
  });
  async function request(route, identity, extra = {}) {
    const res = {
      statusCode: 200,
      headers: {},
      set(name, value) { this.headers[name] = value; return this; },
      status(value) { this.statusCode = value; return this; },
      json(body) { this.body = body; return this; },
    };
    await routes.get(route)({ identity, params: { board: "free" }, ...extra }, res);
    return res;
  }
  return { request, calls, routes, setMaintenance: value => { maintenance = value; } };
}

test("maintenance blocks every chalkboard route for visitors, players and admins, then reopens public access", async () => {
  const { request, calls, routes, setMaintenance } = harness();
  setMaintenance(true);
  for (const route of routes.keys()) {
    for (const identity of [null, player, admin]) {
      const res = await request(route, identity);
      assert.equal(res.statusCode, 503, route);
      assert.equal(res.body.error, "maintenance_mode", route);
      assert.equal(res.body.canAccess, false, route);
      assert.equal(res.headers["Cache-Control"], "no-store", route);
    }
  }
  assert.deepEqual(calls, []);
  setMaintenance(false);
  assert.equal((await request("get /api/chalkboard/access", null)).body.canAccess, true);
  assert.equal((await request("get /api/chalkboard/:board", null)).statusCode, 200);
  assert.equal((await request("post /api/chalkboard/:board/interventions", player)).statusCode, 201);
});

test("maintenance enabled during authentication also prevents an already-open board from writing", async () => {
  const board = harness({ onIdentity: () => board.setMaintenance(true) });
  for (const route of [
    "get /api/chalkboard/:board",
    "post /api/chalkboard/:board/interventions",
    "delete /api/chalkboard/interventions/:id",
    "post /api/chalkboard/:board/undo-delete",
  ]) {
    board.setMaintenance(false);
    assert.equal((await board.request(route, admin)).statusCode, 503, route);
  }
  assert.deepEqual(board.calls, []);
});

test("chalkboard home access is public and is never cached", async () => {
  const { request, calls } = harness();
  for (const identity of [null, player, admin]) {
    const res = await request("get /api/chalkboard/access", identity);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true, canAccess: true });
    assert.equal(res.headers["Cache-Control"], "no-store");
  }
  assert.deepEqual(calls, []);
});

test("visitors and ordinary players can read the board without moderation rights, including unchanged revisions", async () => {
  const { request, calls } = harness();
  for (const identity of [null, player]) {
    const read = await request("get /api/chalkboard/:board", identity);
    assert.equal(read.statusCode, 200);
    assert.deepEqual(read.body.interventions, []);
    assert.equal(read.body.canModerate, false);
    assert.equal(read.body.canUndoDelete, false);
    const unchanged = await request("get /api/chalkboard/:board", identity, {
      query: { weekId: "2026-09-07", revision: "1" },
    });
    assert.equal(unchanged.body.unchanged, true);
    assert.equal(unchanged.body.canModerate, false);
    assert.equal(unchanged.body.canUndoDelete, false);
  }
  assert.equal(calls.length, 4);
});

test("only signed-in players can publish, with identity taken from the server session", async () => {
  const { request, calls } = harness();
  const body = { elements: [{ type: "text", text: "Mon idée" }], userId: admin.userId };
  const guest = await request("post /api/chalkboard/:board/interventions", null, { body });
  assert.equal(guest.statusCode, 401);
  assert.deepEqual(calls, []);
  const published = await request("post /api/chalkboard/:board/interventions", player, { body });
  assert.equal(published.statusCode, 201);
  assert.deepEqual(calls, [["publish", "free", body, player]]);
});

test("the font catalog is public and returns discovered fonts", async () => {
  const { request, calls } = harness();
  for (const identity of [null, player, admin]) {
    const res = await request("get /api/chalkboard/fonts", identity);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["Cache-Control"], "no-store");
    assert.deepEqual(res.body.fonts, [{ id: "nouvelle-craie", src: "/chalkfont/nouvelle-craie.woff2" }]);
  }
  assert.deepEqual(calls, [["fonts"], ["fonts"], ["fonts"]]);
});

test("admins retain reading, revision polling and publication", async () => {
  const { request, calls } = harness();
  const read = await request("get /api/chalkboard/:board", admin);
  assert.equal(read.statusCode, 200);
  assert.deepEqual(read.body.interventions, []);
  assert.equal(read.body.canModerate, true);
  const unchanged = await request("get /api/chalkboard/:board", admin, {
    query: { weekId: "2026-09-07", revision: "1" },
  });
  assert.equal(unchanged.body.unchanged, true);
  assert.equal(unchanged.body.canModerate, true);
  assert.equal(unchanged.body.canUndoDelete, true);
  const body = { elements: [{ type: "stroke", points: [] }] };
  const publish = await request("post /api/chalkboard/:board/interventions", admin, { body });
  assert.equal(publish.statusCode, 201);
  assert.equal(publish.body.intervention.id, "published");
  assert.deepEqual(calls, [["read", "free"], ["read", "free"], ["publish", "free", body, admin]]);
});

test("deletion and restoration require server-side moderator authorization", async () => {
  const { request, calls } = harness();
  for (const route of ["delete /api/chalkboard/interventions/:id", "post /api/chalkboard/:board/undo-delete"]) {
    for (const identity of [null, player]) {
      const result = await request(route, identity);
      assert.equal(result.statusCode, identity ? 403 : 401);
    }
  }
  assert.deepEqual(calls, []);
  await request("delete /api/chalkboard/interventions/:id", admin, { params: { id: "chosen" } });
  const restored = await request("post /api/chalkboard/:board/undo-delete", admin);
  assert.equal(restored.body.intervention.id, "restored");
  assert.deepEqual(calls, [["delete", "chosen", admin], ["undo", "free", admin]]);
});

test("public board access never grants access to the sealed moderation audit", async () => {
  const { request, calls } = harness();
  for (const identity of [null, player]) {
    const res = await request("get /api/chalkboard/admin/audit", identity);
    assert.equal(res.statusCode, identity ? 403 : 401);
  }
  assert.deepEqual(calls, []);
  assert.equal((await request("get /api/chalkboard/admin/audit", admin)).statusCode, 200);
  assert.deepEqual(calls, [["audit"]]);
});

test("manual PNG requests and their delivery status require admin authorization and do not expose private paths", async () => {
  const { request, calls } = harness();
  for (const route of ["post /api/chalkboard/admin/send-copy", "get /api/chalkboard/admin/exports/:id"]) {
    for (const identity of [null, player]) {
      assert.equal((await request(route, identity, { params: { id: "manual-test" } })).statusCode, identity ? 403 : 401);
    }
  }
  assert.deepEqual(calls, []);
  const queued = await request("post /api/chalkboard/admin/send-copy", admin, { body: { to: "untrusted@example.test" } });
  assert.equal(queued.statusCode, 202);
  assert.equal(queued.body.id, "manual-test");
  assert.deepEqual(calls, [["export", admin]]);
  const status = await request("get /api/chalkboard/admin/exports/:id", admin, { params: { id: "manual-test" } });
  assert.equal(status.body.status, "sent");
  assert.equal(status.body.pngReady, true);
  assert.equal("png_path" in status.body, false);
  assert.equal((await request("post /api/chalkboard/admin/send-copy", admin)).statusCode, 429);
});
