import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createGameplaySessionFeature } from "../gameplay/createGameplaySessionFeature.js";
import { createLiveRoundFeature } from "./createLiveRoundFeature.js";

function createSocket() {
  let handlers = {};
  return {
    bind(nextHandlers) {
      handlers = nextHandlers;
      return () => {
        handlers = {};
      };
    },
    fire(name, payload) {
      handlers[name]?.(payload);
    },
  };
}

function createHarness() {
  const kernel = createApplicationKernel();
  kernel.features.define("gameplaySession", (context) =>
    createGameplaySessionFeature(context)
  );
  kernel.features.define("liveRound", (context) => createLiveRoundFeature(context));
  const gameplayLease = kernel.features.acquire("gameplaySession");
  const liveLease = kernel.features.acquire("liveRound");
  const socket = createSocket();
  const refs = {
    appViewRef: { current: "live" },
    currentRoomIdRef: { current: "room-4x4" },
    isLoggedInRef: { current: true },
    liveSessionReadyRef: { current: true },
    phaseLoopTestEnabledRef: { current: false },
    standaloneTrainingSessionRef: { current: null },
  };
  const calls = [];
  const handlersRef = {
    current: Object.fromEntries(
      [
        "onBreakStarted",
        "onCultureThemeChallenge",
        "onRoundEnded",
        "onRoundPreparing",
        "onRoundStarted",
        "onSpecialHint",
        "onSpecialSolved",
        "onTournamentLobbyUpdate",
      ].map((name) => [name, (payload) => calls.push({ name, payload })])
    ),
  };
  liveLease.feature.configureRealtime({
    ...refs,
    gameplaySession: gameplayLease.feature,
    handlersRef,
    onHydrateSnapshot: (snapshot, meta) => calls.push({ name: "hydrate", payload: snapshot, meta }),
    socket,
  });
  kernel.commands.navigation.go("live");
  return {
    calls,
    gameplay: gameplayLease.feature,
    kernel,
    live: liveLease.feature,
    refs,
    release() {
      liveLease.release();
      gameplayLease.release();
      kernel.dispose();
    },
    socket,
  };
}

test("the live driver starts one session and ignores duplicate starts", () => {
  const harness = createHarness();
  const payload = { roomId: "room-4x4", roundId: "r1", grid: [{ letter: "A" }] };

  harness.socket.fire("roundStarted", payload);
  harness.socket.fire("roundStarted", payload);

  assert.deepEqual(harness.calls.map((entry) => entry.name), ["onRoundStarted"]);
  assert.equal(harness.gameplay.store.getState().roundId, "r1");
  harness.release();
});

test("late events from another round cannot mutate the active session", () => {
  const harness = createHarness();
  harness.socket.fire("roundStarted", {
    roomId: "room-4x4",
    roundId: "r2",
    grid: [{ letter: "A" }],
  });
  harness.socket.fire("roundEnded", { roomId: "room-4x4", roundId: "r1" });
  harness.socket.fire("specialHint", {
    roomId: "room-4x4",
    roundId: "r1",
    pattern: "A _ _",
  });
  harness.socket.fire("breakStarted", {
    roomId: "room-4x4",
    roundId: "r1",
    breakKind: "round",
  });
  harness.socket.fire("roundPreparing", {
    roomId: "room-4x4",
    roundNumber: 3,
  });

  assert.deepEqual(harness.calls.map((entry) => entry.name), ["onRoundStarted"]);
  assert.equal(harness.gameplay.store.getState().phase, "playing");
  harness.release();
});

test("target hints are monotonic inside a round", () => {
  const harness = createHarness();
  harness.socket.fire("roundStarted", {
    roomId: "room-4x4",
    roundId: "r1",
    grid: [{ letter: "A" }],
  });
  harness.socket.fire("specialHint", {
    roomId: "room-4x4",
    roundId: "r1",
    revealWordIndices: [0, 1],
  });
  harness.socket.fire("specialHint", {
    roomId: "room-4x4",
    roundId: "r1",
    revealWordIndices: [0],
  });

  assert.deepEqual(harness.calls.map((entry) => entry.name), ["onRoundStarted", "onSpecialHint"]);
  harness.release();
});

test("an authoritative resume snapshot owns the new generation", () => {
  const harness = createHarness();
  const snapshot = {
    roomId: "room-4x4",
    phase: "playing",
    currentRound: {
      roundId: "r3",
      grid: [{ letter: "A" }],
      status: "running",
    },
    specialHint: { revealWordIndices: [0, 1] },
  };

  assert.equal(harness.live.hydrateSnapshot(snapshot, { entryKind: "join" }), true);
  assert.equal(harness.gameplay.store.getState().entryKind, "join");
  assert.equal(harness.gameplay.store.getState().roundId, "r3");
  assert.deepEqual(harness.calls.map((entry) => entry.name), ["hydrate"]);
  assert.equal(harness.calls[0].meta.entryKind, "join");
  harness.release();
});

test("socket events wait for attachment but authoritative hydration can attach it", () => {
  const harness = createHarness();
  harness.refs.liveSessionReadyRef.current = false;

  harness.socket.fire("roundStarted", {
    roomId: "room-4x4",
    roundId: "stale-round",
    grid: [{ letter: "A" }],
  });
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.gameplay.store.getState().sessionId, null);

  assert.equal(
    harness.live.hydrateSnapshot(
      {
        roomId: "room-4x4",
        phase: "playing",
        currentRound: { roundId: "authoritative-round", grid: [{ letter: "B" }] },
      },
      { entryKind: "resume" }
    ),
    true
  );
  assert.equal(harness.gameplay.store.getState().roundId, "authoritative-round");
  assert.deepEqual(harness.calls.map((entry) => entry.name), ["hydrate"]);
  harness.release();
});

test("phase-loop and standalone training isolate the live driver", () => {
  const harness = createHarness();
  harness.refs.phaseLoopTestEnabledRef.current = true;
  harness.socket.fire("roundStarted", {
    roomId: "room-4x4",
    roundId: "r1",
    grid: [{ letter: "A" }],
  });
  harness.refs.phaseLoopTestEnabledRef.current = false;
  harness.refs.standaloneTrainingSessionRef.current = { sessionId: "training-1" };
  harness.socket.fire("roundStarted", {
    roomId: "room-4x4",
    roundId: "r2",
    grid: [{ letter: "B" }],
  });

  assert.equal(harness.calls.length, 0);
  assert.equal(harness.gameplay.store.getState().phase, "idle");
  harness.release();
});

test("all server and dev forced round plans pass through unchanged", () => {
  const harness = createHarness();
  const forcedTypes = [
    "normal",
    "finale",
    "self_specials_3_words",
    "speed",
    "monstrous",
    "target_long",
    "target_score",
    "bonus_letter",
    "massive_boggle",
    "fake_twins",
    "ocid",
  ];

  forcedTypes.forEach((type, index) => {
    harness.socket.fire("roundStarted", {
      roomId: "room-4x4",
      roundId: `forced-${index}`,
      grid: [{ letter: "A" }],
      special: type === "normal" ? null : { isSpecial: true, type },
    });
  });

  const starts = harness.calls.filter((entry) => entry.name === "onRoundStarted");
  assert.equal(starts.length, forcedTypes.length);
  assert.deepEqual(
    starts.map((entry) => entry.payload.special?.type || "normal"),
    forcedTypes
  );
  harness.release();
});

test("menu navigation rejects late events and a snapshot restores live ownership", () => {
  const harness = createHarness();
  harness.socket.fire("roundStarted", {
    roomId: "room-4x4",
    roundId: "r1",
    grid: [{ letter: "A" }],
  });

  harness.refs.appViewRef.current = "stats";
  harness.kernel.commands.navigation.go("stats");
  harness.socket.fire("roundEnded", { roomId: "room-4x4", roundId: "r1" });
  harness.socket.fire("breakStarted", { roomId: "room-4x4", breakKind: "round" });

  assert.equal(harness.gameplay.store.getState().phase, "idle");
  assert.deepEqual(harness.calls.map((entry) => entry.name), ["onRoundStarted"]);

  harness.refs.appViewRef.current = "live";
  harness.refs.liveSessionReadyRef.current = false;
  harness.kernel.commands.navigation.go("live");
  harness.socket.fire("roundStarted", {
    roomId: "room-4x4",
    roundId: "stale-return-round",
    grid: [{ letter: "C" }],
  });
  harness.socket.fire("breakStarted", { roomId: "room-4x4", breakKind: "round" });
  assert.equal(
    harness.live.hydrateSnapshot(
      {
        roomId: "room-4x4",
        phase: "playing",
        currentRound: { roundId: "r2", grid: [{ letter: "B" }] },
      },
      { entryKind: "resume" }
    ),
    true
  );
  assert.equal(harness.gameplay.store.getState().roundId, "r2");
  assert.deepEqual(harness.calls.map((entry) => entry.name), ["onRoundStarted", "hydrate"]);
  harness.release();
});
