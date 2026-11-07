import test from "node:test";
import assert from "node:assert/strict";
import { registerWheelGraphicsRoutes } from "./registerWheelGraphicsRoutes.js";
import { createWheelDiagnosticRepository } from "./wheelDiagnosticRepository.js";

const device = "browser-device-test-1234";
const report = (id, deviceId) => ({ id, environment: { deviceId, userAgent: "Firefox test" },
  runs: ["light", "balanced", "detailed"].map(profile => ({ profile, status: "error" })) });
async function request({ account = { id: 7 }, repository, query = { device }, headers = {} } = {}) {
  let handler;
  registerWheelGraphicsRoutes({ get(_path, fn) { handler = fn; } }, { readAccount: async () => account, repository });
  const result = { status: 200, headers: {} };
  const response = { setHeader(key, value) { result.headers[key] = value; }, status(code) { result.status = code; return this; },
    json(body) { result.body = body; return this; } };
  await handler({ query, headers }, response); return result;
}
test("graphics recovery never exposes another account or assumes a legacy device", async () => {
  const repository = createWheelDiagnosticRepository({ filename: ":memory:" });
  try {
    await repository.save(report("legacy-owner-00001"), { id: 7 });
    await repository.save(report("other-owner-00002", device), { id: 8 });
    let result = await request({ repository });
    assert.equal(result.body.recommendation, null); assert.equal(result.body.legacy.length, 1);
    assert.equal(result.body.legacy[0].reportId, "legacy-owner-00001");
    assert.equal(result.body.legacy[0].recommendation.profile, "flat");
    await repository.save(report("same-owner-000003", device), { id: 7 });
    result = await request({ repository });
    assert.equal(result.body.recommendation.profile, "flat"); assert.deepEqual(result.body.legacy, []);
    assert.equal(result.body.reportId, "same-owner-000003");
    assert.equal(result.body.report, undefined); assert.equal(result.headers["Cache-Control"], "no-store");
  } finally { await repository.close(); }
});
test("anonymous and malformed/cross-site lookups cannot read reports", async () => {
  const repository = { graphicsHistory() { assert.fail("must not access reports"); } };
  assert.deepEqual((await request({ repository, account: null })).body, { ok: true, recommendation: null, legacy: [] });
  assert.equal((await request({ repository, query: { device: "invalid" } })).status, 400);
  assert.equal((await request({ repository, headers: { "sec-fetch-site": "cross-site" } })).status, 403);
});
test("account recovery returns survey choices separately, including incomplete legacy reports", async () => {
  const repository = createWheelDiagnosticRepository({ filename: ":memory:" });
  try {
    await repository.save({ ...report("legacy-choice-00001"), runs: [], survey: { preferred: "detailed" } }, { id: 7 });
    let result = await request({ repository });
    assert.equal(result.body.legacy.length, 1);
    assert.equal(result.body.legacy[0].preference, "detailed"); assert.equal(result.body.legacy[0].recommendation.profile, null);
    await repository.save({ ...report("exact-choice-000002", device), survey: { preferred: "balanced" } }, { id: 7 });
    result = await request({ repository });
    assert.equal(result.body.preference, "balanced"); assert.equal(result.body.recommendation.profile, "flat");
    assert.deepEqual(result.body.legacy, []);
  } finally { await repository.close(); }
});
