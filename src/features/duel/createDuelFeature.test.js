import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import {
  createDuelFeature,
  createInitialDuelState,
} from "./createDuelFeature.js";

function createDeferred() {
  let reject;
  let resolve;
  const promise = new Promise((nextResolve, nextReject) => {
    reject = nextReject;
    resolve = nextResolve;
  });
  return { promise, reject, resolve };
}

function createTimerHarness() {
  let nextId = 1;
  const timers = new Map();
  return {
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    runDelay(delayMs) {
      const entry = [...timers.entries()].find(([, timer]) => timer.delayMs === delayMs);
      assert.ok(entry, `missing timer with delay ${delayMs}`);
      const [id, timer] = entry;
      timers.delete(id);
      timer.callback();
    },
    setTimeoutFn(callback, delayMs) {
      const id = nextId++;
      timers.set(id, { callback, delayMs });
      return id;
    },
    timers,
  };
}

async function waitForTimer(timers, delayMs) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if ([...timers.timers.values()].some((timer) => timer.delayMs === delayMs)) {
      return;
    }
    await Promise.resolve();
  }
  assert.fail(`timer with delay ${delayMs} was not scheduled`);
}

function parsedResponse({ data, isLikelyHtml = false, ok = true, status = 200 }) {
  return {
    ok,
    parsed: {
      data,
      isLikelyHtml,
      parseOk: !!(data && typeof data === "object"),
    },
    status,
  };
}

const readJsonResponse = async (response) => response.parsed;

test("duel satellite retries a rejected status payload and applies success", async () => {
  let clock = 5000;
  const calls = [];
  const timers = createTimerHarness();
  const responses = [
    parsedResponse({ data: { error: "temporary" }, ok: false, status: 503 }),
    parsedResponse({
      data: {
        crowned: true,
        dateId: "2026-08-31",
        team: "blue",
        weekId: "2026-W36",
        weekly: { blue: 12, red: 9 },
      },
    }),
  ];
  const scope = createResourceScope("duel-status-retry-test");
  const feature = createDuelFeature(
    { ports: {}, scope },
    {
      clearTimeoutFn: timers.clearTimeoutFn,
      fetchImpl(url, options) {
        calls.push({ options, url });
        return Promise.resolve(responses.shift());
      },
      now: () => clock,
      setTimeoutFn: timers.setTimeoutFn,
    }
  );
  feature.start();

  const request = feature.fetchStatus({
    dateId: "2026-08-31",
    installId: "user:7",
    isAuthenticated: true,
    readJsonResponse,
  });
  await waitForTimer(timers, 120);
  clock = 5120;
  timers.runDelay(120);
  assert.deepEqual(await request, {
    crowned: true,
    dateId: "2026-08-31",
    team: "blue",
    weekId: "2026-W36",
    weekly: { blue: 12, red: 9 },
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /installId=user%3A7/);
  assert.match(calls[0].url, /dateId=2026-08-31/);
  assert.match(calls[1].url, /r=5120/);
  assert.deepEqual(feature.store.getState().status, {
    crowned: true,
    dailyBattle: null,
    dateId: "2026-08-31",
    error: "",
    lastWeekSummary: null,
    loading: false,
    objectives: null,
    team: "blue",
    tutorialVersion: null,
    weekId: "2026-W36",
    weekly: { blue: 12, red: 9 },
  });
  assert.equal(timers.timers.size, 0);
  scope.dispose();
});

test("duel satellite force-replaces a request and ignores its late response", async () => {
  const calls = [];
  const timers = createTimerHarness();
  const scope = createResourceScope("duel-status-replacement-test");
  const feature = createDuelFeature(
    { ports: {}, scope },
    {
      clearTimeoutFn: timers.clearTimeoutFn,
      fetchImpl(url, options) {
        const deferred = createDeferred();
        calls.push({ deferred, options, url });
        return deferred.promise;
      },
      setTimeoutFn: timers.setTimeoutFn,
    }
  );
  feature.start();

  const firstRequest = feature.fetchStatus({
    installId: "user:8",
    isAuthenticated: true,
    readJsonResponse,
  });
  const replacementRequest = feature.fetchStatus({
    force: true,
    installId: "user:8",
    isAuthenticated: true,
    readJsonResponse,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.signal.aborted, true);
  assert.equal(await firstRequest, null);

  calls[0].deferred.resolve(parsedResponse({ data: { team: "stale" } }));
  await Promise.resolve();
  assert.equal(feature.store.getState().status.loading, true);
  calls[1].deferred.resolve(parsedResponse({ data: { team: "red" } }));
  assert.deepEqual(await replacementRequest, { team: "red" });
  assert.equal(feature.store.getState().status.team, "red");
  assert.equal(timers.timers.size, 0);
  scope.dispose();
});

test("duel satellite owns the twelve-second timeout and disposal", async () => {
  const warnings = [];
  const timers = createTimerHarness();
  const scope = createResourceScope("duel-status-timeout-test");
  const feature = createDuelFeature(
    { ports: {}, scope },
    {
      clearTimeoutFn: timers.clearTimeoutFn,
      fetchImpl(_url, { signal }) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
      setTimeoutFn: timers.setTimeoutFn,
      warn: (...args) => warnings.push(args),
    }
  );
  feature.start();

  const request = feature.fetchStatus({
    installId: "user:9",
    isAuthenticated: true,
    readJsonResponse,
  });
  timers.runDelay(12000);
  assert.equal(await request, null);
  assert.equal(feature.store.getState().status.error, "aborted");
  assert.equal(feature.store.getState().status.loading, false);
  assert.equal(warnings.length, 1);

  const pendingRequest = feature.fetchStatus({
    force: true,
    installId: "user:9",
    isAuthenticated: true,
    readJsonResponse,
  });
  scope.dispose();
  assert.equal(await pendingRequest, null);
  assert.equal(timers.timers.size, 0);
  assert.deepEqual(feature.store.getState(), createInitialDuelState());
});

test("duel satellite refreshes authentication once before retrying status", async () => {
  let refreshCount = 0;
  let successCount = 0;
  const timers = createTimerHarness();
  const responses = [
    parsedResponse({ data: { error: "auth_required" }, ok: false, status: 401 }),
    parsedResponse({ data: { error: "auth_required" }, ok: false, status: 401 }),
    parsedResponse({ data: { team: "blue" } }),
  ];
  const scope = createResourceScope("duel-status-auth-retry-test");
  const feature = createDuelFeature(
    { ports: {}, scope },
    {
      clearTimeoutFn: timers.clearTimeoutFn,
      fetchImpl: () => Promise.resolve(responses.shift()),
      setTimeoutFn: timers.setTimeoutFn,
      warn: () => {},
    }
  );
  feature.start();

  const request = feature.fetchStatus({
    installId: "user:10",
    isAuthenticated: true,
    onSuccess: () => {
      successCount += 1;
    },
    readJsonResponse,
    refreshAuthStatus: async () => {
      refreshCount += 1;
      return { status: "authenticated", user: { id: 10 } };
    },
  });
  await waitForTimer(timers, 120);
  timers.runDelay(120);
  assert.deepEqual(await request, { team: "blue" });
  assert.equal(refreshCount, 1);
  assert.equal(successCount, 1);
  assert.equal(feature.store.getState().status.error, "");
  scope.dispose();
});
