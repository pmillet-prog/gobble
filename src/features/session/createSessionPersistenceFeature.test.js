import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createSessionPersistenceFeature } from "./createSessionPersistenceFeature.js";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function createWindowTarget() {
  const listeners = new Map();
  return {
    addEventListener(eventName, listener) {
      const bucket = listeners.get(eventName) || new Set();
      bucket.add(listener);
      listeners.set(eventName, bucket);
    },
    emit(eventName) {
      for (const listener of listeners.get(eventName) || []) listener();
    },
    listenerCount(eventName) {
      return listeners.get(eventName)?.size || 0;
    },
    removeEventListener(eventName, listener) {
      listeners.get(eventName)?.delete(listener);
    },
  };
}

test("session persistence owns storage, boot guard and activity heartbeat", () => {
  const storageKey = "gobble_session_v1";
  const initialSession = {
    nick: "Tigre",
    roomId: "room-4x4",
    installId: "install-1",
    lastLoginAt: 90_000,
    lastActiveAt: 99_000,
  };
  const storage = createStorage({
    [storageKey]: JSON.stringify(initialSession),
  });
  const windowTarget = createWindowTarget();
  const intervals = new Map();
  const scope = createResourceScope("session-persistence-test");
  let currentTime = 100_000;
  let nextTimerId = 1;
  const feature = createSessionPersistenceFeature(
    { scope },
    {
      clearIntervalFn: (id) => intervals.delete(id),
      now: () => currentTime,
      setIntervalFn: (callback, delayMs) => {
        const id = nextTimerId++;
        intervals.set(id, { callback, delayMs });
        return id;
      },
      storage,
      windowTarget,
    }
  );
  feature.start();

  assert.deepEqual(feature.hydrateStoredSession(), initialSession);
  assert.equal(feature.refs.autoResumeEnabled.current, true);
  assert.equal(feature.claimBootResumeAttempt("account|Tigre|room-4x4|install-1"), true);
  assert.equal(feature.claimBootResumeAttempt("account|Tigre|room-4x4|install-1"), false);

  feature.configureActivity({ enabled: true });
  assert.equal([...intervals.values()][0].delayMs, 15_000);
  assert.equal(windowTarget.listenerCount("pagehide"), 1);
  currentTime += 6_000;
  [...intervals.values()][0].callback();
  assert.equal(feature.refs.session.current.lastActiveAt, currentTime);

  const persisted = feature.persistSession(
    { nick: "Tigre", roomId: "room-5x5" },
    { fallbackInstallId: "install-2" }
  );
  assert.equal(persisted.installId, "install-2");
  assert.equal(persisted.lastLoginAt, initialSession.lastLoginAt);
  assert.equal(feature.hasSavedSession(), true);

  feature.configureActivity({ enabled: false });
  assert.equal(intervals.size, 0);
  assert.equal(windowTarget.listenerCount("pagehide"), 0);
  feature.clearSavedSession();
  assert.equal(storage.getItem(storageKey), null);
  assert.equal(feature.hasSavedSession(), false);
  assert.equal(feature.refs.autoResumeEnabled.current, false);

  feature.configureActivity({ enabled: true });
  assert.equal(intervals.size, 1);
  scope.dispose();
  assert.equal(intervals.size, 0);
  assert.equal(windowTarget.listenerCount("pagehide"), 0);
  assert.equal(feature.refs.session.current, null);
});
