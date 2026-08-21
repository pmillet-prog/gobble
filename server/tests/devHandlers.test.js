import test from "node:test";
import assert from "node:assert/strict";

import { registerDevHandlers } from "../realtime/registerDevHandlers.js";

function createSocket() {
  const handlers = new Map();
  return {
    data: {},
    roomId: "room-4x4",
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    trigger(eventName, ...args) {
      return handlers.get(eventName)?.(...args);
    },
  };
}

function createHarness({ access = true } = {}) {
  const socket = createSocket();
  const room = {
    id: "room-4x4",
    nextPreparedGrid: { stale: true },
    nextPreparedGridPromise: Promise.resolve(),
    nextPreparedGridPromiseRoundNumber: 4,
    bufferedPreparedGrid: { stale: true },
    bufferedPreparedGridPromise: Promise.resolve(),
    bufferedPreparedGridPromiseMeta: { stale: true },
    devForcedRoundPickCache: new Map([["old", true]]),
  };
  let currentControls = {
    botsEnabled: false,
    animatorBotsEnabled: false,
    chatFill: false,
  };
  const persisted = [];
  const botChanges = [];
  const dependencies = {
    applyDevSelfRewardTargetPatch: () => {},
    applyMaintenanceModeChange: () => {},
    areDevToolsAllowedForSocket: () => access,
    botManager: {
      setBotsEnabled: (value) => botChanges.push(["bots", value]),
      setAnimatorBotsEnabled: (value) => botChanges.push(["animators", value]),
    },
    broadcastCrownUpdate: () => {},
    buildDevControlsPayload: () => ({ controls: currentControls }),
    clearDevChat: () => 0,
    clearPlaytimeLimit: () => ({ ok: true, removed: false }),
    devControlsState: {
      get: () => currentControls,
      set: (next) => {
        currentControls = next;
      },
    },
    emitMedals: () => {},
    ensureDevSelfRewardTarget: () => false,
    fillDevChat: () => 0,
    getRoom: () => room,
    getSocketDevAccount: () => ({ label: "Dev" }),
    getTargetWaitDevCatalog: () => ({ entries: [] }),
    io: { emit: () => {} },
    listActivePlaytimeLimits: () => [],
    normalizeDevControls: (value) => ({ ...value }),
    persistDevControls: () => persisted.push(currentControls),
    requireDevToolsAccess: (_socket, cb) => {
      if (access) return true;
      cb?.({ ok: false, error: "dev_tools_forbidden" });
      return false;
    },
    returnRoomToLiveLobby: () => true,
    rooms: new Map([[room.id, room]]),
    sanitizeDevGlobalAnnouncement: (value) => String(value || "").trim(),
  };

  registerDevHandlers(socket, dependencies);
  return {
    botChanges,
    dependencies,
    getCurrentControls: () => currentControls,
    persisted,
    room,
    socket,
  };
}

test("dev mutations remain behind server-side access control", () => {
  const harness = createHarness({ access: false });
  let response = null;

  harness.socket.trigger("dev:controls:set", { botsEnabled: true }, (value) => {
    response = value;
  });

  assert.deepEqual(response, { ok: false, error: "dev_tools_forbidden" });
  assert.equal(harness.getCurrentControls().botsEnabled, false);
  assert.equal(harness.persisted.length, 0);
  assert.equal(harness.room.nextPreparedGrid?.stale, true);
});

test("dev control replacement propagates to the composition root and invalidates grids", () => {
  const harness = createHarness();
  let response = null;

  harness.socket.trigger(
    "dev:controls:set",
    { botsEnabled: true, animatorBotsEnabled: true },
    (value) => {
      response = value;
    }
  );

  assert.equal(response?.ok, true);
  assert.equal(harness.getCurrentControls().botsEnabled, true);
  assert.equal(harness.getCurrentControls().animatorBotsEnabled, true);
  assert.equal(harness.persisted.length, 1);
  assert.deepEqual(harness.botChanges, [
    ["bots", true],
    ["animators", true],
  ]);
  assert.equal(harness.room.nextPreparedGrid, null);
  assert.equal(harness.room.nextPreparedGridPromise, null);
  assert.equal(harness.room.bufferedPreparedGrid, null);
  assert.equal(harness.room.bufferedPreparedGridPromise, null);
  assert.equal(harness.room.devForcedRoundPickCache.size, 0);
});
