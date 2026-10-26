import test from "node:test";
import assert from "node:assert/strict";
import { createAuthAccountController } from "./createAuthAccountController.js";

function harness(initial = { loading: false, status: "authenticated", user: { id: 7, usernameDisplay: "Paul" }, legacyProfile: null }) {
  let state = initial, notice = "";
  const runtime = Array.from({ length: 29 }, () => () => {});
  runtime[5] = initial;
  runtime[13] = "install";
  runtime[14] = value => { state = typeof value === "function" ? value(state) : value; };
  runtime[15] = value => { notice = typeof value === "function" ? value(notice) : value; };
  runtime[16] = "server unavailable";
  const controller = createAuthAccountController(runtime);
  return { refresh: controller[9], state: () => state, notice: () => notice };
}

test("unavailable or malformed auth responses preserve the account until a valid response arrives", async t => {
  const h = harness();
  let response;
  t.mock.method(globalThis, "fetch", async () => response.clone());
  for (const [status, body] of [[502, '<meta name="gobble-page" content="maintenance">'], [503, "Unavailable"], [500, '{"ok":false}'], [200, "<html>wrong page</html>"], [200, '{"ok":true}']]) {
    response = new Response(body, { status });
    assert.equal(await h.refresh({ silent: true }), null);
    assert.equal(h.state().status, "authenticated");
    assert.equal(h.state().user.id, 7);
    assert.equal(h.state().unavailable, true);
    assert.equal(h.notice(), "server unavailable");
  }
  response = Response.json({ ok: true, status: "authenticated", user: { id: 7 } });
  await h.refresh();
  assert.equal(h.state().status, "authenticated");
  assert.equal(h.state().unavailable, undefined);
  assert.equal(h.notice(), "");
});

test("initial server failure cannot announce a new account; confirmed no_account still can", async t => {
  const h = harness({ loading: true, status: "loading", user: null });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await h.refresh();
  assert.equal(h.state().status, "unavailable");
  assert.equal(h.state().loading, false);
  fetchMock.mock.mockImplementation(async () => Response.json({ ok: true, status: "no_account" }));
  await h.refresh();
  assert.equal(h.state().status, "no_account");
  assert.equal(h.state().unavailable, undefined);
});
