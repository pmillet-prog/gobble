import assert from "node:assert/strict";
import test from "node:test";

import { registerSessionUtilityHandlers } from "../realtime/registerSessionUtilityHandlers.js";

class FakeSocket {
  constructor() {
    this.data = { nick: "Invité" };
    this.handlers = new Map();
  }

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  receive(event, ...args) {
    return this.handlers.get(event)?.(...args);
  }
}

function createHarness({ identity = { userId: "user-1", user: {} } } = {}) {
  const socket = new FakeSocket();
  const calls = { added: [], limits: [] };
  registerSessionUtilityHandlers(socket, {
    addPlaytimeUsage: (payload) => {
      calls.added.push(payload);
      return { ok: true, status: { remainingMs: 20 } };
    },
    getPlaytimeLimitStatus: (userId) => ({ userId, remainingMs: 10 }),
    now: () => 123456,
    requireSocketPlayerIdentity: () => identity,
    setPlaytimeLimit: (payload) => {
      calls.limits.push(payload);
      return { ok: true, status: { limitMs: payload.limitMs } };
    },
  });
  return { calls, socket };
}

test("répond à la synchronisation temporelle sans dépendre d'une session", () => {
  const { socket } = createHarness({ identity: null });
  let response;
  socket.receive("timeSync", null, (value) => {
    response = value;
  });
  assert.deepEqual(response, { ok: true, serverNow: 123456 });
});

test("conserve l'identité et le contrat lors du réglage de limite", () => {
  const identity = {
    userId: "user-2",
    user: { usernameDisplay: "Tigre", usernameNormalized: "tigre" },
  };
  const { calls, socket } = createHarness({ identity });
  let response;
  socket.receive("playtimeLimit:set", { limitMs: 4567.8 }, (value) => {
    response = value;
  });
  assert.deepEqual(calls.limits, [{ userId: "user-2", username: "Tigre", limitMs: 4568 }]);
  assert.deepEqual(response, { ok: true, playtimeLimit: { limitMs: 4568 } });
});

test("borne un incrément d'usage à cinq minutes", () => {
  const { calls, socket } = createHarness();
  let response;
  socket.receive("playtimeLimit:usage", { deltaMs: 999999 }, (value) => {
    response = value;
  });
  assert.deepEqual(calls.added, [
    { userId: "user-1", username: "Invité", deltaMs: 300000 },
  ]);
  assert.equal(socket.data.playtimeUsageLastAt, 123456);
  assert.deepEqual(response, { ok: true, playtimeLimit: { remainingMs: 20 } });
});
