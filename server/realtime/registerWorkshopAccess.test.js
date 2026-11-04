import test from "node:test";
import assert from "node:assert/strict";
import { registerWorkshopAccess } from "./registerWorkshopAccess.js";
import { canOpenWorkshop } from "../../dev/shared/workshopAccess.js";

async function requestAccess(account, allowed = false, error = false) {
  let handler, result = { status: 200, headers: {} };
  registerWorkshopAccess({ get(path, run) { assert.equal(path, "/api/dev/workshops/access"); handler = run; } }, {
    readAccount: async () => { if (error) throw new Error("unavailable"); return account; },
    isAllowed: user => user.id === 7 && allowed,
  });
  const response = { setHeader(key, value) { result.headers[key] = value; },
    status(value) { result.status = value; return this; }, json(value) { result.body = value; return this; } };
  await handler({ headers: {} }, response);
  const opens = await canOpenWorkshop({ request: async () => ({ ok: result.status === 200, json: async () => result.body }) });
  return { ...result, opens };
}

test("workshops require an authenticated account with current server dev authorization", async () => {
  for (const [account, allowed, status, opens] of [[null, true, 401, false], [{ id: 8 }, true, 403, false],
    [{ id: 7 }, false, 403, false], [{ id: 7 }, true, 200, true]]) {
    const result = await requestAccess(account, allowed);
    assert.equal(result.status, status); assert.equal(result.opens, opens);
    assert.equal(result.headers["Cache-Control"], "no-store");
  }
});

test("missing, broken and unreachable authorization never open a production workshop", async () => {
  assert.equal((await requestAccess({ id: 7 }, true, true)).opens, false);
  for (const request of [async () => { throw new Error("offline"); }, async () => ({ ok: true, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ allowed: "true", ok: true }) })]) {
    assert.equal(await canOpenWorkshop({ request }), false);
  }
  assert.equal(await canOpenWorkshop({ development: true, request: () => assert.fail("Standalone local workshops need no backend") }), true);
});
