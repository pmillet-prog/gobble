import test from "node:test";
import assert from "node:assert/strict";
import { createWheelDiagnosticRepository } from "./wheelDiagnosticRepository.js";
import { registerWheelDiagnosticRoutes } from "./registerWheelDiagnosticRoutes.js";
import { WHEEL_SURVEY, WHEEL_DIAGNOSTIC_STEPS } from "../../shared/wheelDiagnostic.js";

const report = id => ({ version: 1, id: id || "wheel-diagnostic-test-001", environment: { userAgent: "test" },
  runs: [{ profile: "flat", status: "complete", attempt: 1 }],
  survey: { ...Object.fromEntries(WHEEL_SURVEY.map(q => [q.id, Object.keys(q.options)[0]])),
    fluidity: Object.fromEntries(WHEEL_DIAGNOSTIC_STEPS.map(s => [s.profile, "unseen"])) } });
function harness({ account = null, allowed = false, repository, now } = {}) {
  const routes = new Map(), saved = [];
  registerWheelDiagnosticRoutes({ get: (path, fn) => routes.set(`GET ${path}`, fn), post: (path, fn) => routes.set(`POST ${path}`, fn) }, {
    readAccount: async () => account, isAllowed: () => allowed,
    repository: repository || { save: async (...args) => saved.push(args), list: async () => ({ entries: [], total: 0 }) }, now,
  });
  return { saved, async request(method, body, query = {}, headers = {}) {
    const result = { status: 200, headers: {} };
    const res = { setHeader(k, v) { result.headers[k] = v; }, status(v) { result.status = v; return this; }, json(v) { result.body = v; return this; } };
    await routes.get(`${method} ${method === "POST" ? "/api/infortune/diagnostics" : "/api/dev/infortune/diagnostics"}`)(
      { body, query, headers: { "content-type": "application/json", ...headers }, ip: "test-client" }, res);
    return result;
  } };
}
test("reading reports always needs server-side dev account authorization", async () => {
  for (const [account, allowed, status] of [[null, true, 401], [{ id: 7 }, false, 403], [{ id: 7 }, true, 200]]) {
    const result = await harness({ account, allowed }).request("GET");
    assert.equal(result.status, status); assert.equal(result.headers["Cache-Control"], "no-store");
  }
  assert.equal((await harness({ account: { id: 7 }, allowed: true }).request("GET", null, { before: "NaN" })).status, 400);
});
test("volunteers can submit; account identity comes only from their session", async () => {
  const account = { id: 7, usernameDisplay: "Test" }, h = harness({ account });
  assert.equal((await h.request("POST", { ...report(), userId: 999, nick: "fake" })).status, 200);
  assert.equal(h.saved[0][0].userId, undefined); assert.equal(h.saved[0][1], account);
  assert.equal((await harness().request("POST", report())).status, 200);
  assert.equal((await h.request("POST", { runs: [] })).status, 400);
  assert.equal((await h.request("POST", report(), {}, { "sec-fetch-site": "cross-site" })).status, 403);
});
test("submission throttling permits idempotent retries and recovers after the window", async () => {
  let time = 0; const h = harness({ now: () => time });
  for (let i = 0; i < 8; i++) assert.equal((await h.request("POST", report(`wheel-diagnostic-${i}`))).status, 200);
  assert.equal((await h.request("POST", report("wheel-diagnostic-extra"))).status, 429);
  assert.equal((await h.request("POST", report("wheel-diagnostic-0"))).status, 200);
  time = 3600001; assert.equal((await h.request("POST", report("wheel-diagnostic-extra"))).status, 200);
});
test("stored feedback survives repository queries without duplication and paginates", async () => {
  const repository = createWheelDiagnosticRepository({ filename: ":memory:", now: () => 123 });
  try {
    const h = harness({ account: { id: 7, usernameDisplay: "Test" }, allowed: true, repository });
    for (let i = 0; i < 27; i++) await repository.save(report(`wheel-diagnostic-${i}`), { id: 7, usernameDisplay: "Test" });
    await repository.save(report("wheel-diagnostic-26"), { id: 8, usernameDisplay: "Other" });
    const first = (await h.request("GET")).body;
    assert.equal(first.total, 27); assert.equal(first.entries.length, 25); assert.equal(first.entries[0].userId, 7);
    assert.equal(first.entries[0].createdAt, 123); assert.equal(first.entries[0].report.id, "wheel-diagnostic-26");
    const next = (await h.request("GET", null, { before: first.nextBefore })).body;
    assert.equal(next.entries.length, 2); assert.equal(next.nextBefore, null);
  } finally { await repository.close(); }
});
