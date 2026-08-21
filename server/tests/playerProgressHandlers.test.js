import test from "node:test";
import assert from "node:assert/strict";

import { registerPlayerProgressHandlers } from "../realtime/registerPlayerProgressHandlers.js";

function createSocket() {
  const handlers = new Map();
  return {
    data: { nick: "Tigre" },
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
  const calls = [];
  const identity = {
    installId: "install-current",
    userId: 7,
    user: { primaryInstallId: "install-primary" },
  };
  const dependencies = {
    ensureUserIdentityMigration: async (user) => calls.push(["migration", user]),
    getTrophyStatus: async (installId) => ({ installId, trophies: 4 }),
    getVocabularyCountForInstallIds: async (installIds) => {
      calls.push(["vocab", installIds]);
      return 123;
    },
    getWeeklyVocabularyCountForInstallIds: async (installIds) => {
      calls.push(["weekly-vocab", installIds]);
      return 17;
    },
    listIdentityInstallIds: async (query) => {
      calls.push(["identities", query]);
      return ["install-current", "install-primary"];
    },
    requireSocketPlayerIdentity: () => identity,
    runDailyStartFlow: async (payload) => ({ ok: true, startedWith: payload }),
    runDailySubmitFlow: async (payload) => {
      calls.push(["daily-submit", payload]);
      return { ok: true, score: 42 };
    },
    sanitizeDailyMode: (value) => String(value || "standard"),
    sanitizeDailyNick: (value) => String(value || "").trim(),
  };
  registerPlayerProgressHandlers(socket, dependencies);
  return { calls, dependencies, identity, socket };
}

test("vocabulary count aggregates every install linked to the authenticated account", async () => {
  const harness = createHarness();
  let response = null;

  await harness.socket.trigger("getVocabCount", (value) => {
    response = value;
  });

  assert.deepEqual(response, { count: 123, weeklyCount: 17 });
  assert.deepEqual(harness.calls, [
    ["migration", harness.identity.user],
    [
      "identities",
      {
        userId: 7,
        currentInstallId: "install-current",
        primaryInstallId: "install-primary",
      },
    ],
    ["vocab", ["install-current", "install-primary"]],
    ["weekly-vocab", ["install-current", "install-primary"]],
  ]);
});

test("daily submission keeps the authenticated install id and the full scoring payload", async () => {
  const harness = createHarness();
  let response = null;
  const payload = {
    dateId: "2026-08-21",
    pseudo: " Tigre ",
    dailyMode: "special",
    foundWords: ["CHAT"],
    wordSubmissions: [{ word: "CHAT", path: [0, 1, 2, 3] }],
    specialPlacements: { L2: 3 },
    durationMs: 12_345,
  };

  await harness.socket.trigger("daily:submit", payload, (value) => {
    response = value;
  });

  assert.deepEqual(response, { ok: true, score: 42 });
  assert.deepEqual(harness.calls.at(-1), [
    "daily-submit",
    {
      dateId: "2026-08-21",
      installId: "install-current",
      pseudo: "Tigre",
      foundWords: ["CHAT"],
      wordSubmissions: [{ word: "CHAT", path: [0, 1, 2, 3] }],
      specialPlacements: { L2: 3 },
      dailyMode: "special",
      durationMs: 12_345,
    },
  ]);
});

test("daily start refuses an empty sanitized nickname before entering the flow", async () => {
  const harness = createHarness();
  harness.socket.data.nick = "";
  let startCalls = 0;
  harness.dependencies.runDailyStartFlow = async () => {
    startCalls += 1;
    return { ok: true };
  };
  registerPlayerProgressHandlers(harness.socket, harness.dependencies);
  let response = null;

  await harness.socket.trigger("daily:start", { pseudo: "   " }, (value) => {
    response = value;
  });

  assert.deepEqual(response, { ok: false, error: "bad_request" });
  assert.equal(startCalls, 0);
});
