import test from "node:test";
import assert from "node:assert/strict";

import { registerModerationHandlers } from "../realtime/registerModerationHandlers.js";

function createSocket() {
  const handlers = new Map();
  return {
    id: "moderator-socket",
    roomId: "room-4x4",
    data: {},
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    trigger(eventName, ...args) {
      return handlers.get(eventName)?.(...args);
    },
  };
}

function createHarness() {
  const socket = createSocket();
  const target = {
    socketId: "target-socket",
    player: { nick: "Cible", userId: 22, installId: "install-target" },
  };
  const room = { id: "room-4x4" };
  const logs = [];
  const removals = [];
  const dependencies = {
    MODERATION_BAN_5_MIN_MS: 300_000,
    appendModerationLog: (entry) => logs.push(entry),
    buildModerationPayload: () => ({ moderationAllowed: true }),
    findModerationTarget: () => target,
    getClientIpFromSocket: () => "127.0.0.1",
    getRoom: () => room,
    getSocketPlayerIdentity: () => ({ userId: 11, installId: "install-moderator" }),
    listModerationPlayers: () => [{ nick: "Cible" }],
    moderationInstallBans: new Map(),
    moderationUserBans: new Map(),
    normalizeInstallId: (value) => String(value || "").trim(),
    removeSocketPlayerFromRoom: (...args) => removals.push(args),
    requireModerationAccess: () => ({ userId: 11, label: "Modo" }),
  };

  registerModerationHandlers(socket, dependencies);
  return { dependencies, logs, removals, room, socket, target };
}

test("moderation handlers keep authorization as the first server-side gate", () => {
  const harness = createHarness();
  let roomLookupCount = 0;
  harness.dependencies.getRoom = () => {
    roomLookupCount += 1;
    return harness.room;
  };
  harness.dependencies.requireModerationAccess = (_socket, cb) => {
    cb?.({ ok: false, error: "moderation_forbidden" });
    return null;
  };
  registerModerationHandlers(harness.socket, harness.dependencies);
  let response = null;

  harness.socket.trigger("moderation:action", { action: "kick" }, (value) => {
    response = value;
  });

  assert.deepEqual(response, { ok: false, error: "moderation_forbidden" });
  assert.equal(roomLookupCount, 0);
  assert.equal(harness.removals.length, 0);
});

test("a moderator can never target their own authenticated identity", () => {
  const harness = createHarness();
  harness.dependencies.getSocketPlayerIdentity = () => ({
    userId: harness.target.player.userId,
    installId: "another-install",
  });
  registerModerationHandlers(harness.socket, harness.dependencies);
  let response = null;

  harness.socket.trigger("moderation:action", { action: "kick" }, (value) => {
    response = value;
  });

  assert.equal(response?.ok, false);
  assert.equal(response?.error, "cannot_target_self");
  assert.equal(harness.removals.length, 0);
});

test("a temporary ban records both identities, audit data and the client notice", () => {
  const harness = createHarness();
  const before = Date.now();
  let response = null;

  harness.socket.trigger("moderation:action", { action: "ban_5m" }, (value) => {
    response = value;
  });

  const after = Date.now();
  const installBan = harness.dependencies.moderationInstallBans.get("install-target");
  const userBan = harness.dependencies.moderationUserBans.get("22");
  assert.equal(response?.ok, true);
  assert.equal(response?.targetNick, "Cible");
  assert.ok(response.until >= before + 300_000);
  assert.ok(response.until <= after + 300_000);
  assert.equal(installBan.expiresAt, response.until);
  assert.equal(userBan.expiresAt, response.until);
  assert.equal(harness.logs.length, 1);
  assert.equal(harness.logs[0].moderator, "Modo");
  assert.equal(harness.logs[0].targetInstallId, "install-target");
  assert.equal(harness.removals.length, 1);
  assert.equal(harness.removals[0][1], "target-socket");
  assert.deepEqual(harness.removals[0][2], {
    action: "ban_5m",
    roomId: "room-4x4",
    message: "Tu as été exclu du live pendant 5 minutes par modération.",
    until: response.until,
    durationMs: 300_000,
    targetNick: "Cible",
  });
});
