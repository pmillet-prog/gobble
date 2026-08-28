import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import {
  createInitialStatsState,
  createStatsFeature,
} from "./createStatsFeature.js";

test("stats satellite owns scoped trophy updates and socket cleanup", () => {
  const handlers = new Map();
  const socket = {
    bind(nextHandlers) {
      for (const [eventName, handler] of Object.entries(nextHandlers)) {
        handlers.set(eventName, handler);
      }
      return () => {
        for (const [eventName, handler] of Object.entries(nextHandlers)) {
          if (handlers.get(eventName) === handler) handlers.delete(eventName);
        }
      };
    },
    fire(eventName, payload) {
      handlers.get(eventName)?.(payload);
    },
  };
  const scope = createResourceScope("stats-realtime-test");
  const feature = createStatsFeature(
    { ports: { realtime: socket }, scope },
    { now: () => 1234 }
  );
  const phaseLoopTestEnabledRef = { current: false };
  feature.configureRealtime({
    appViewRef: { current: "live" },
    currentRoomIdRef: { current: "room-1" },
    installIdRef: { current: "install-self" },
    isLoggedInRef: { current: true },
    phaseLoopTestEnabledRef,
    socket,
    standaloneTrainingSessionRef: { current: null },
  });
  feature.start();

  assert.deepEqual([...handlers.keys()], ["trophiesUpdated"]);

  socket.fire("trophiesUpdated", {
    roomId: "room-2",
    tournamentId: "tournament-ignored",
    updates: [
      {
        delta: 99,
        installId: "install-self",
        league: "or",
        newTrophies: 999,
      },
    ],
  });
  assert.equal(feature.store.getState().trophyStatus, null);

  socket.fire("trophiesUpdated", {
    roomId: "room-1",
    tournamentId: "tournament-1",
    updates: [
      {
        delta: 3,
        installId: "install-other",
        league: "argent",
        newTrophies: 20,
      },
      {
        delta: 5,
        installId: "install-self",
        league: "or",
        newTrophies: 42,
        progress: { current: 2, target: 10 },
        shieldCount: 1,
        shieldFloor: 30,
      },
    ],
  });
  assert.deepEqual(feature.store.getState().trophyStatus, {
    lastDelta: 5,
    lastTournamentId: "tournament-1",
    league: "or",
    progress: { current: 2, target: 10 },
    shieldCount: 1,
    shieldFloor: 30,
    trophies: 42,
    updatedAt: 1234,
  });
  assert.deepEqual(feature.store.getState().trophyHistory, [
    {
      delta: 5,
      league: "or",
      tournamentId: "tournament-1",
      trophies: 42,
      ts: 1234,
    },
  ]);

  phaseLoopTestEnabledRef.current = true;
  socket.fire("trophiesUpdated", {
    roomId: "room-1",
    updates: [
      {
        delta: 100,
        installId: "install-self",
        newTrophies: 142,
      },
    ],
  });
  assert.equal(feature.store.getState().trophyStatus.trophies, 42);

  scope.dispose();
  assert.equal(handlers.size, 0);
  assert.deepEqual(feature.store.getState(), createInitialStatsState());
});
