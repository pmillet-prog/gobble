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
    onPresenterInterventions: (payload) => calls.push({ name: "presenters", payload }),
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

test("Lepers interventions stay in the live feature and are scoped to the active round", () => {
  const harness = createHarness();
  const interventions = [];
  const unsubscribe = harness.live.subscribeLepersInterventions((payload) => {
    interventions.push(payload);
  });
  harness.socket.fire("roundStarted", {
    roomId: "room-4x4",
    roundId: "massive-3",
    grid: [{ letter: "A" }],
  });
  harness.socket.fire("lepersIntervention", {
    roomId: "room-4x4",
    roundId: "old-round",
    text: "ancienne énigme",
  });
  harness.socket.fire("lepersIntervention", {
    roomId: "room-4x4",
    roundId: "massive-3",
    text: "TOP ! Je suis...",
  });

  assert.deepEqual(interventions.map((entry) => entry.text), ["TOP ! Je suis..."]);
  unsubscribe();
  harness.release();
});

test("a Lepers round exposes its challenge as soon as the intro starts", () => {
  const harness = createHarness();
  const interventions = [];
  harness.live.subscribeLepersInterventions((payload) => interventions.push(payload));
  harness.socket.fire("roundStarted", {
    roomId: "room-4x4",
    roundId: "lepers-intro",
    grid: [{ letter: "A" }],
    status: "intro",
    lepersChallenge: {
      id: "lepers-intro:lepers",
      text: "TOP ! Je suis... une définition.",
      highlights: ["TOP !"],
    },
  });

  assert.deepEqual(interventions, [
    {
      roomId: "room-4x4",
      roundId: "lepers-intro",
      id: "lepers-intro:lepers",
      kind: "challenge",
      text: "TOP ! Je suis... une définition.",
      highlights: ["TOP !"],
    },
  ]);
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

test("an authoritative snapshot restores the current presenter hints", () => {
  const harness = createHarness();
  const presenterInterventions = [
    {
      id: "r4:coach",
      roundId: "r4",
      text: "Cherchez cette terminaison.",
      meta: { category: "coach", kind: "ambient_bot_chat" },
    },
  ];
  const snapshot = {
    roomId: "room-4x4",
    phase: "playing",
    currentRound: {
      roundId: "r4",
      grid: [{ letter: "A" }],
      presenterInterventions,
      status: "running",
    },
  };

  assert.equal(harness.live.hydrateSnapshot(snapshot), true);
  assert.deepEqual(harness.calls.map((entry) => entry.name), ["hydrate", "presenters"]);
  assert.equal(harness.calls[1].payload, presenterInterventions);
  harness.release();
});

test("a results snapshot restores Pivot from lastRoundResults", () => {
  const harness = createHarness();
  const presenterInterventions = [
    {
      id: "r4-results:pivot",
      roundId: "r4-results",
      text: "Une définition et son étymologie.",
      meta: { category: "linguist", kind: "ambient_bot_chat" },
    },
  ];
  const snapshot = {
    roomId: "room-4x4",
    phase: "results",
    currentRound: null,
    lastRoundResults: {
      round: { id: "r4-results" },
      payload: {
        roomId: "room-4x4",
        roundId: "r4-results",
        presenterInterventions,
        results: [],
      },
    },
  };

  assert.equal(harness.live.hydrateSnapshot(snapshot), true);
  assert.deepEqual(harness.calls.map((entry) => entry.name), [
    "hydrate",
    "presenters",
  ]);
  assert.equal(harness.calls[1].payload, presenterInterventions);
  harness.release();
});

test("round results expose a prepared Pivot intervention without a reconnect", () => {
  const harness = createHarness();
  const presenterInterventions = [
    {
      id: "r5:pivot",
      roundId: "r5",
      text: "On pouvait aussi trouver ÉBAHI. Une définition. Étymologie : une origine.",
      meta: { category: "linguist", kind: "ambient_bot_chat" },
    },
  ];
  harness.socket.fire("roundStarted", {
    roomId: "room-4x4",
    roundId: "r5",
    grid: [{ letter: "A" }],
  });
  harness.socket.fire("roundEnded", {
    roomId: "room-4x4",
    roundId: "r5",
    presenterInterventions,
  });

  assert.deepEqual(harness.calls.map((entry) => entry.name), [
    "onRoundStarted",
    "presenters",
    "onRoundEnded",
  ]);
  assert.equal(harness.calls[1].payload, presenterInterventions);
  harness.release();
});

test("resume replays an unsolved Lepers challenge without exposing its answer", () => {
  const harness = createHarness();
  const interventions = [];
  const snapshot = {
    roomId: "room-4x4",
    phase: "playing",
    player: { lepersChallengeFound: false },
    currentRound: {
      roundId: "massive-resume",
      grid: [{ letter: "A" }],
      status: "running",
      lepersChallenge: {
        id: "massive-resume:lepers",
        text: "TOP ! Je suis... une définition.",
        highlights: ["TOP !"],
      },
    },
  };

  assert.equal(harness.live.hydrateSnapshot(snapshot), true);
  harness.live.subscribeLepersInterventions((payload) => interventions.push(payload));
  assert.equal(interventions.length, 1);
  assert.equal(interventions[0].text, snapshot.currentRound.lepersChallenge.text);
  assert.equal("word" in interventions[0], false);
  harness.release();
});

test("resume during results replays the Lepers answer instead of the opening clue", () => {
  const harness = createHarness();
  const interventions = [];
  harness.live.subscribeLepersInterventions((payload) => interventions.push(payload));
  const snapshot = {
    roomId: "room-4x4",
    phase: "break",
    player: { lepersChallengeFound: false },
    currentRound: {
      roundId: "massive-results",
      grid: [{ letter: "A" }],
      status: "finished",
      lepersChallenge: {
        id: "massive-results:lepers",
        text: "TOP ! Je suis... une définition.",
      },
    },
    lastRoundResults: {
      round: { id: "massive-results" },
      payload: {
        roundId: "massive-results",
        lepersResult: {
          id: "massive-results:lepers:answer",
          text: "« ALLOCUTAIRE », bien sûr !",
          highlights: ["ALLOCUTAIRE"],
        },
      },
    },
  };

  assert.equal(harness.live.hydrateSnapshot(snapshot), true);
  assert.deepEqual(interventions.map((entry) => entry.kind), ["answer"]);
  assert.equal(interventions[0].text, "« ALLOCUTAIRE », bien sûr !");
  harness.release();
});

test("resume during the tournament celebration restores only its dedicated presenter scope", () => {
  const harness = createHarness();
  const lepersInterventions = [];
  harness.live.subscribeLepersInterventions((payload) =>
    lepersInterventions.push(payload)
  );
  const snapshot = {
    capturedAt: 60_000,
    roomId: "room-4x4",
    phase: "break",
    currentRound: null,
    breakState: {
      breakKind: "tournament_end",
      tournamentSummaryAt: 50_000,
      tournamentSummary: {
        presenterScopeId: "tournament:finished:celebration",
        presenterInterventions: [
          {
            id: "celebration:romejko",
            roundId: "tournament:finished:celebration",
            text: "Le plus long mot du tournoi.",
            meta: { category: "statistician" },
          },
        ],
      },
    },
    lastRoundResults: {
      round: { id: "final-round" },
      payload: {
        roundId: "final-round",
        tournament: { breakKind: "tournament_end" },
        tournamentSummaryAt: 50_000,
        presenterInterventions: [
          {
            id: "final-round:pivot",
            roundId: "final-round",
            text: "Une dernière définition.",
            meta: { category: "linguist" },
          },
        ],
        lepersResult: {
          id: "final-round:lepers:answer",
          text: "« ALLOCUTAIRE », bien sûr !",
          highlights: ["ALLOCUTAIRE"],
        },
      },
    },
  };

  assert.equal(harness.live.hydrateSnapshot(snapshot), true);
  assert.deepEqual(harness.calls.map((entry) => entry.name), ["hydrate", "presenters"]);
  assert.equal(
    harness.calls[1].payload[0].roundId,
    "tournament:finished:celebration"
  );
  assert.deepEqual(lepersInterventions, []);
  harness.release();
});

test("rehydrating the same results does not replay Lepers' answer", () => {
  const harness = createHarness();
  const interventions = [];
  harness.live.subscribeLepersInterventions((payload) => interventions.push(payload));
  harness.socket.fire("roundStarted", {
    roomId: "room-4x4",
    roundId: "final-round",
    grid: [{ letter: "A" }],
  });
  const answer = {
    roomId: "room-4x4",
    roundId: "final-round",
    id: "final-round:lepers:answer",
    kind: "answer",
    text: "« ALLOCUTAIRE », bien sûr !",
  };
  harness.socket.fire("lepersIntervention", answer);

  assert.equal(
    harness.live.hydrateSnapshot({
      roomId: "room-4x4",
      phase: "break",
      currentRound: {
        roundId: "final-round",
        grid: [{ letter: "A" }],
        status: "finished",
      },
      lastRoundResults: {
        round: { id: "final-round" },
        payload: { roundId: "final-round", lepersResult: answer },
      },
    }),
    true
  );

  assert.deepEqual(interventions.map((entry) => entry.id), [answer.id]);
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

  harness.refs.appViewRef.current = "duel";
  harness.kernel.commands.navigation.go("duel");
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
