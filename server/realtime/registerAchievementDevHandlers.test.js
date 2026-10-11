import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerAchievementDevHandlers } from "./registerAchievementDevHandlers.js";

function fixture() {
  const handlers = new Map();
  const room = { currentRound: { id: "round-current" } };
  const socket = { roomId: "live", data: { authUser: { id: 7 } },
    on: (event, handler) => handlers.set(event, handler),
    emit: () => assert.fail("simulation must use its private acknowledgement only") };
  let at = 1000;
  let allowed = true;
  let checks = 0;
  let persistenceCalls = 0;
  registerAchievementDevHandlers(socket, {
    requireDevToolsAccess: (_socket, reply) => {
      checks++;
      if (!allowed) reply({ ok: false, error: "dev_tools_unavailable" });
      return allowed;
    },
    getRoom: id => id === "live" ? room : undefined,
    now: () => at,
    persistence: { achievementCollection: () => { persistenceCalls++; assert.fail("no persistent trophy writes"); } },
  });
  function request(event, payload = {}) {
    let response;
    handlers.get(`dev:achievement:${event}`)(payload, value => { assert.equal(response, undefined, "exactly one acknowledgement"); response = value; });
    return response;
  }
  return { socket, room, handlers, request, grant: (payload = {}) => request("grant", { id: "word_16", requestId: randomUUID(), ...payload }),
    advance: (milliseconds = 500) => { at += milliseconds; }, allow: value => { allowed = value; },
    checks: () => checks, persistenceCalls: () => persistenceCalls };
}

test("every action requires current dev access and a valid authenticated account", () => {
  const f = fixture();
  f.allow(false);
  for (const action of ["status", "grant", "reset"]) assert.equal(f.request(action).error, "dev_tools_unavailable");
  f.allow(true);
  for (const id of [null, 0, -1, "guest", 1.5]) {
    f.socket.data.authUser = id === null ? null : { id };
    for (const action of ["status", "grant", "reset"]) assert.equal(f.request(action).error, "auth_required");
  }
  assert.equal(f.checks(), 18);
});

test("status authorizes without granting; grants target only the socket account and its server round", () => {
  const f = fixture();
  assert.deepEqual(f.request("status"), { ok: true, allowed: true });
  const response = f.grant({ userId: 999, roundId: "forged", count: 999, delta: 999, earnedAt: 0, dev: false });
  assert.equal(response.ok, true);
  assert.deepEqual({ ...response.award, eventId: undefined }, { id: "word_16", eventId: undefined,
    userId: 7, delta: 1, count: 1, roundId: "round-current", earnedAt: 1000, dev: true });
  assert.match(response.award.eventId, /^achievement-dev:/);
  f.advance();
  f.socket.roomId = "missing";
  assert.equal(f.grant().award.roundId, null);
  assert.equal(f.persistenceCalls(), 0);
  assert.deepEqual(f.room, { currentRound: { id: "round-current" } });
  assert.deepEqual(f.socket.data, { authUser: { id: 7 } });
});

test("catalogue IDs and UUID requests are required, including prototype-property rejection", () => {
  const f = fixture();
  for (const id of [null, {}, "unknown", "toString", "__proto__"]) assert.equal(f.grant({ id }).error, "invalid_achievement");
  for (const requestId of [null, {}, "", "short", "00000000-0000-0000-0000-000000000000"]) assert.equal(f.grant({ requestId }).error, "invalid_request");
  assert.equal(f.grant().award.count, 1, "rejections do not consume a count or cooldown");
});

test("retries reuse the receipt before rate limiting but still recheck authorization", () => {
  const f = fixture();
  const requestId = randomUUID();
  const first = f.grant({ requestId });
  assert.deepEqual(f.grant({ requestId: requestId.toUpperCase() }), first);
  assert.equal(f.grant({ requestId, id: "word_17" }).error, "invalid_request");
  f.allow(false);
  assert.equal(f.grant({ requestId }).error, "dev_tools_unavailable");
  f.allow(true);
  f.advance();
  assert.equal(f.grant().award.count, 2);
  assert.equal(f.checks(), 5);
});

test("rapid distinct grants are rejected without consuming their request IDs", () => {
  const f = fixture();
  f.grant();
  const requestId = randomUUID();
  assert.deepEqual(f.grant({ requestId }), { ok: false, error: "rate_limited", retryAfterMs: 500 });
  f.advance(499);
  assert.equal(f.grant({ requestId }).retryAfterMs, 1);
  f.advance(1);
  assert.equal(f.grant({ requestId }).award.count, 2);
});

test("tier simulation caps unique rewards and repeats gold without writing real trophies", () => {
  const f = fixture();
  for (const id of ["volume_100", "marathon_10000:bronze", "round_5000:silver"]) {
    assert.equal(f.grant({ id }).award.count, 1);
    f.advance();
    const again = f.grant({ id }).award;
    assert.equal(again.count, 1);
    assert.equal(again.delta, 0);
    f.advance();
  }
  assert.equal(f.grant({ id: "marathon_10000" }).award.count, 1);
  f.advance();
  assert.equal(f.grant({ id: "marathon_10000" }).award.count, 2);
  assert.equal(f.persistenceCalls(), 0);
});

test("temporary counts and deduplication are cleared for reset, account change and disconnect", () => {
  const f = fixture();
  const requestId = randomUUID();
  const first = f.grant({ requestId });
  assert.deepEqual(f.request("reset"), { ok: true });
  const afterReset = f.grant({ requestId });
  assert.equal(afterReset.award.count, 1);
  assert.notEqual(afterReset.award.eventId, first.award.eventId);
  f.socket.data.authUser = { id: 8 };
  const nextAccount = f.grant({ requestId });
  assert.equal(nextAccount.award.userId, 8);
  assert.equal(nextAccount.award.count, 1);
  f.socket.data.authUser = null;
  assert.equal(f.request("status").error, "auth_required");
  f.socket.data.authUser = { id: 7 };
  assert.equal(f.grant({ requestId }).award.count, 1);
  f.handlers.get("disconnect")();
  assert.equal(f.grant({ requestId }).award.count, 1);
});

test("the bounded session retains old receipts at its limit and permits a fresh simulation after reset", () => {
  const f = fixture();
  const requestId = randomUUID();
  const first = f.grant({ requestId });
  for (let index = 1; index < 512; index++) {
    f.advance();
    assert.equal(f.grant().award.count, index + 1);
  }
  f.advance();
  assert.equal(f.grant().error, "dev_achievement_limit");
  assert.deepEqual(f.grant({ requestId }), first, "old receipts never fall out of the bounded cache");
  f.request("reset");
  assert.equal(f.grant().award.count, 1);
  assert.equal(f.persistenceCalls(), 0);
});
