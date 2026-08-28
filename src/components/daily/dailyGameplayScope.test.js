import test from "node:test";
import assert from "node:assert/strict";

import {
  isCurrentDailyGameplaySession,
  isCurrentDailyStartRequest,
} from "./dailyGameplayScope.js";

test("a daily start response becomes stale after navigation or a newer request", () => {
  const appViewRef = { current: "daily" };
  const dailyLifecycleRef = { current: { startGeneration: 3 } };

  assert.equal(
    isCurrentDailyStartRequest({ appViewRef, dailyLifecycleRef, startGeneration: 3 }),
    true
  );
  dailyLifecycleRef.current.startGeneration = 4;
  assert.equal(
    isCurrentDailyStartRequest({ appViewRef, dailyLifecycleRef, startGeneration: 3 }),
    false
  );
  dailyLifecycleRef.current.startGeneration = 3;
  appViewRef.current = "stats";
  assert.equal(
    isCurrentDailyStartRequest({ appViewRef, dailyLifecycleRef, startGeneration: 3 }),
    false
  );
});

test("a daily submit response only owns its still-active daily session", () => {
  const appViewRef = { current: "daily_play" };
  const state = { origin: "daily" };
  const gameplaySession = {
    isCurrent: (sessionId) => sessionId === "daily:4",
    store: { getState: () => state },
  };

  assert.equal(
    isCurrentDailyGameplaySession({
      appViewRef,
      gameplaySession,
      sessionId: "daily:4",
    }),
    true
  );
  appViewRef.current = "live";
  assert.equal(
    isCurrentDailyGameplaySession({
      appViewRef,
      gameplaySession,
      sessionId: "daily:4",
    }),
    false
  );
  appViewRef.current = "daily_play";
  state.origin = "live";
  assert.equal(
    isCurrentDailyGameplaySession({
      appViewRef,
      gameplaySession,
      sessionId: "daily:4",
    }),
    false
  );
});

