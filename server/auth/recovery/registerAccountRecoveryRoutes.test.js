import assert from "node:assert/strict";
import test from "node:test";
import { registerAccountRecoveryRoutes } from "./registerAccountRecoveryRoutes.js";

function setup() {
  const handlers = new Map(), calls = [];
  const recovery = Object.fromEntries(["requestReset", "completeReset", "submitSupport"].map(name => [name, async args => { calls.push([name, args]); return { ok: true }; }]));
  const onPasswordReset = () => {};
  registerAccountRecoveryRoutes({ post: (path, handler) => handlers.set(path, handler) }, { recovery, onPasswordReset });
  async function call(path, { origin = "https://gobble.fr", contentType = "application/json", body = { username: "Coton" }, fetchSite } = {}) {
    const req = { body, ip: "client-ip", is: type => type === contentType, get: name => ({ origin, host: "gobble.fr", "sec-fetch-site": fetchSite })[name] };
    const res = { statusCode: 200, headers: {}, set(name, value) { this.headers[name] = value; return this; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await handlers.get(path)(req, res);
    return res;
  }
  return { call, calls, recovery, onPasswordReset };
}

test("routes accept canonical and www browser origins, block cross-site and form submissions", async () => {
  const s = setup();
  for (const origin of ["https://gobble.fr", "https://www.gobble.fr"]) assert.equal((await s.call("/request-password-reset", { origin })).statusCode, 200);
  for (const origin of ["https://attacker.test", "null", "malformed", "https://gobble.fr.attacker.test"]) assert.equal((await s.call("/request-password-reset", { origin })).statusCode, 403);
  assert.equal((await s.call("/request-password-reset", { contentType: "application/x-www-form-urlencoded" })).statusCode, 403);
  assert.equal((await s.call("/request-password-reset", { fetchSite: "cross-site" })).statusCode, 403);
  assert.equal(s.calls.length, 2);
});

test("routes accept only explicit fields and bind session revocation to the reset handler", async () => {
  const s = setup();
  await s.call("/request-password-reset", { body: { username: "Coton", email: "attacker@example.test", origin: "attacker.test" } });
  assert.deepEqual(s.calls[0], ["requestReset", { username: "Coton", ip: "client-ip" }]);
  await s.call("/reset-password", { body: { token: "test-token", newPassword: "nouveau", userId: 100 } });
  assert.deepEqual(s.calls[1], ["completeReset", { token: "test-token", newPassword: "nouveau", ip: "client-ip", onReset: s.onPasswordReset }]);
});

test("errors are sanitized, rate limits and no-store responses are explicit", async () => {
  const s = setup();
  s.recovery.requestReset = async () => { throw new Error("sensitive provider contents"); };
  const unavailable = await s.call("/request-password-reset");
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.body, { ok: false, error: "recovery_unavailable" });
  assert.equal(unavailable.headers["Cache-Control"], "no-store");
  s.recovery.requestReset = async () => { throw new Error("recovery_rate_limited"); };
  assert.equal((await s.call("/request-password-reset")).statusCode, 429);
  s.recovery.completeReset = async () => { throw new Error("reset_link_invalid"); };
  assert.equal((await s.call("/reset-password")).statusCode, 400);
});
