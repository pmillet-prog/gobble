import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalTournamentEnvironment } from "./localTournamentEnvironment.js";
import { infortuneTournamentEnabled } from "../../shared/releaseScope.js";

const localConfig = async () => JSON.stringify({ version: 1, infortuneTournament: true });

test("the usual npm start enables the full wheel tournament with this checkout's opt-in", async () => {
  const env = {};
  assert.equal(await loadLocalTournamentEnvironment({ env, args: [], readFileImpl: localConfig }), true);
  assert.equal(env.NODE_ENV, undefined, "enabling the wheel must not enable unrelated development-only round overrides");
  assert.equal(infortuneTournamentEnabled(env), true);
});

test("without an explicit opt-in, the usual start preserves release settings", async () => {
  for (const readFileImpl of [async () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); },
    async () => "{}", async () => '{"version":1,"infortuneTournament":false}']) {
    const env = {};
    assert.equal(await loadLocalTournamentEnvironment({ env, args: [], readFileImpl }), false);
    assert.equal(infortuneTournamentEnabled(env), false);
    assert.deepEqual(env, {});
  }
});

test("production never reads local settings and rejects an explicit local launch", async () => {
  const env = { NODE_ENV: "production" };
  const readFileImpl = () => { throw new Error("must not read"); };
  assert.equal(await loadLocalTournamentEnvironment({ env, args: [], readFileImpl }), false);
  assert.equal(infortuneTournamentEnabled(env), false);
  await assert.rejects(loadLocalTournamentEnvironment({ env, args: ["--local"], readFileImpl }), /production/);
  assert.deepEqual(env, { NODE_ENV: "production" });
});

test("the explicit start:local command still works without a local configuration file", async () => {
  const env = {};
  assert.equal(await loadLocalTournamentEnvironment({ env, args: ["--local"],
    readFileImpl: () => { throw new Error("must not read"); } }), true);
  assert.equal(infortuneTournamentEnabled(env), true);
});
