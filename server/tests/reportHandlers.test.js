import test from "node:test";
import assert from "node:assert/strict";

import { registerReportHandlers } from "../realtime/registerReportHandlers.js";

function createSocket() {
  const handlers = new Map();
  return {
    roomId: "room-4x4",
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    trigger(eventName, ...args) {
      return handlers.get(eventName)?.(...args);
    },
  };
}

function createHarness({ reportCount = 1 } = {}) {
  const socket = createSocket();
  const room = {
    id: "room-4x4",
    chatMessages: [{ id: "message-1", text: "message signalé" }],
  };
  const reportEntries = [];
  const appended = [];
  const muted = [];
  const dependencies = {
    REPORT_MUTE_THRESHOLD: 3,
    appendReportLog: (entry) => appended.push(entry),
    getRoom: () => room,
    muteInstallId: (installId, now) => {
      muted.push({ installId, now });
      return now + 60_000;
    },
    normalizeInstallId: (value) => String(value || "").trim(),
    registerReportForInstallId: () => reportCount,
    reportEntries,
    requireSocketPlayerIdentity: () => ({ installId: "reporter-1" }),
    sanitizeReportReason: (value) => String(value || "").trim().slice(0, 120),
  };
  registerReportHandlers(socket, dependencies);
  return { appended, dependencies, muted, reportEntries, room, socket };
}

test("reports require an authenticated socket identity before writing", () => {
  const harness = createHarness();
  harness.dependencies.requireSocketPlayerIdentity = (_socket, cb) => {
    cb?.({ ok: false, error: "not_authenticated" });
    return null;
  };
  registerReportHandlers(harness.socket, harness.dependencies);
  let response = null;

  harness.socket.trigger(
    "reportMessage",
    { reportedInstallId: "target-1", reason: "spam" },
    (value) => {
      response = value;
    }
  );

  assert.deepEqual(response, { ok: false, error: "not_authenticated" });
  assert.equal(harness.reportEntries.length, 0);
  assert.equal(harness.appended.length, 0);
});

test("a valid report preserves the audit snippet and stays below the mute threshold", () => {
  const harness = createHarness({ reportCount: 2 });
  let response = null;

  harness.socket.trigger(
    "reportMessage",
    { reportedInstallId: " target-1 ", messageId: "message-1", reason: " spam " },
    (value) => {
      response = value;
    }
  );

  assert.deepEqual(response, { ok: true, mutedUntil: null });
  assert.equal(harness.reportEntries.length, 1);
  assert.equal(harness.appended[0], harness.reportEntries[0]);
  assert.equal(harness.reportEntries[0].reporterInstallId, "reporter-1");
  assert.equal(harness.reportEntries[0].reportedInstallId, "target-1");
  assert.equal(harness.reportEntries[0].snippet, "message signalé");
  assert.equal(harness.muted.length, 0);
});

test("reaching the report threshold delegates the temporary mute", () => {
  const harness = createHarness({ reportCount: 3 });
  let response = null;

  harness.socket.trigger(
    "reportMessage",
    { reportedInstallId: "target-1", reason: "spam" },
    (value) => {
      response = value;
    }
  );

  assert.equal(harness.muted.length, 1);
  assert.equal(harness.muted[0].installId, "target-1");
  assert.equal(response?.mutedUntil, harness.muted[0].now + 60_000);
});
