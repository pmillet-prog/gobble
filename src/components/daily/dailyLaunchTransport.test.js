import test from "node:test";
import assert from "node:assert/strict";
import { launchDailyGame, requestDailyLaunch } from "./dailyLaunchTransport.js";

const payload = { pseudo: "Test", dailyMode: "monstrous_grid", launchId: "launch-0000000001" };
const response = data => ({ json: async () => data });
const prepared = { ok: true, prepared: true, launchId: payload.launchId, dateId: "2026-09-20" };

test("a hidden/left/unready game never commits the prepared launch", async () => {
  const requests = [];
  const result = await launchDailyGame(payload, { isReady: () => false, fetchImpl: async (_, options) => {
    requests.push(JSON.parse(options.body));
    return response(prepared);
  } });
  assert.equal(result, null);
  assert.deepEqual(requests.map(item => item.stage), ["prepare"]);
});

test("a lost HTTP start response falls back to the same socket launch with the elapsed time deducted", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const requests = [];
  let socketPayload;
  const result = await launchDailyGame(payload, {
    isReady: () => true,
    fetchImpl: async (_, options) => {
      const request = JSON.parse(options.body);
      requests.push(request);
      if (request.stage === "prepare") return response({ ...prepared, duel: { team: "red" } });
      now += 6000;
      throw new Error("Failed to fetch");
    },
    emitSocketAck: async (event, request) => {
      assert.equal(event, "daily:start");
      socketPayload = request;
      return { ok: true, durationMs: 120000, endsAt: 121000, serverNow: 9000, launchId: request.launchId };
    },
  });
  assert.deepEqual(socketPayload, requests[1]);
  assert.equal(result.remainingMs, 112000);
  assert.deepEqual(result.duel, { team: "red" });
});

test("server refusal is not retried and confirmation uses the authenticated endpoint", async () => {
  let calls = 0;
  await assert.rejects(launchDailyGame(payload, {
    isReady: () => true, fetchImpl: async () => { calls++; return response({ ok: false, error: "already_played" }); },
    emitSocketAck: () => { throw new Error("must not fall back"); },
  }), { code: "already_played" });
  assert.equal(calls, 1);
  await requestDailyLaunch({ ...payload, stage: "confirm" }, { fetchImpl: async (_, options) => {
    assert.equal(options.credentials, "include");
    assert.equal(JSON.parse(options.body).stage, "confirm");
    return response({ ok: true });
  } });
});
