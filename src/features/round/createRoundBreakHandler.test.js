import assert from "node:assert/strict";
import test from "node:test";

import { createPresenterHintsController } from "../presenters/createPresenterHintsController.js";
import { createRoundBreakHandler } from "./createRoundBreakHandler.js";

const pivot = {
  id: "round-2:pivot",
  roundId: "round-2",
  text: "Une définition et son étymologie.",
  meta: { category: "linguist" },
};
const breakPayload = {
  roomId: "room-4x4",
  roundId: "round-2",
  breakKind: "round",
  nextStartAt: 90_000,
};

function createHarness({ roundId = "round-2", phase = "playing" } = {}) {
  const presenters = createPresenterHintsController({ storage: null });
  const state = { roundId, phase };
  const setters = Object.fromEntries([
    "roundId", "phase", "nextStartAt", "tournamentLobby", "roundPreparing",
    "breakKind", "tournamentFinaleHoldUntil", "serverStatus", "serverEndsAt",
    "serverRoundDurationMs", "tournament", "upcomingSpecial", "tournamentSummary",
    "tournamentSummaryAt", "targetSummary",
  ].map((key) => [
    `set${key[0].toUpperCase()}${key.slice(1)}`,
    (value) => { state[key] = value; },
  ]));
  const onBreak = createRoundBreakHandler({
    ...setters,
    appViewRef: { current: "live" },
    isLoggedInRef: { current: true },
    currentRoomIdRef: { current: "room-4x4" },
    phaseRef: { current: phase },
    ensureTournamentBaseline() {},
  });
  const render = () => presenters.setScope(state.roundId, state.phase);
  render();
  return { onBreak, presenters, render, state };
}

function assertPivotAvailable(harness) {
  harness.render();
  assert.equal(harness.state.phase, "results");
  assert.equal(harness.state.roundId, pivot.roundId);
  assert.equal(harness.presenters.getSnapshot().entries.pivot.hasHint, true);
  assert.equal(harness.presenters.request("pivot"), true);
  const restored = [];
  const unsubscribe = harness.presenters.subscribeInterventions("pivot", (event) => {
    restored.push(event);
  });
  assert.equal(restored[0]?.text, pivot.text);
  unsubscribe();
}

test("Pivot remains activatable when the end-of-round payload is followed by the break", () => {
  const harness = createHarness();
  harness.presenters.hydrateInterventions([pivot]);
  harness.state.phase = "results";
  harness.render();
  harness.onBreak(breakPayload);

  assertPivotAvailable(harness);
  assert.equal(harness.state.nextStartAt, breakPayload.nextStartAt);
  assert.equal(harness.state.serverStatus, "break");
});

test("returning from the lobby restores Pivot for the displayed results", () => {
  const harness = createHarness();
  harness.presenters.hydrateInterventions([pivot]);
  harness.state.phase = "lobby";
  harness.state.roundId = null;
  harness.render();
  harness.onBreak(breakPayload);

  assertPivotAvailable(harness);
});

test("a fresh results snapshot restores Pivot even when its intervention arrives after the break", () => {
  const harness = createHarness({ roundId: null, phase: "lobby" });
  harness.onBreak(breakPayload);
  harness.render();
  harness.presenters.hydrateInterventions([pivot]);

  assertPivotAvailable(harness);
});

test("a break snapshot without roundId keeps the round restored from the results", () => {
  const harness = createHarness({ phase: "results" });
  harness.presenters.hydrateInterventions([pivot]);
  harness.onBreak({ ...breakPayload, roundId: undefined });

  assertPivotAvailable(harness);
});

test("the final tournament break keeps Pivot and the completed tournament", () => {
  const harness = createHarness({ phase: "results" });
  harness.state.tournament = { id: "completed-tournament" };
  harness.state.tournamentFinaleHoldUntil = 95_000;
  harness.presenters.hydrateInterventions([pivot]);
  harness.onBreak({
    ...breakPayload,
    breakKind: "tournament_end",
    tournament: { id: "next-tournament" },
  });

  assertPivotAvailable(harness);
  assert.equal(harness.state.tournament.id, "completed-tournament");
  assert.equal(harness.state.tournamentFinaleHoldUntil, 95_000);
});

test("another room cannot replace the displayed results", () => {
  const harness = createHarness({ phase: "results" });
  harness.onBreak({ ...breakPayload, roomId: "room-5x5", roundId: "other-round" });

  assert.deepEqual(harness.state, { phase: "results", roundId: "round-2" });
});

test("Pivot is cleared when the next round starts", () => {
  const harness = createHarness();
  harness.presenters.hydrateInterventions([pivot]);
  harness.onBreak(breakPayload);
  assertPivotAvailable(harness);

  harness.state.roundId = "round-3";
  harness.state.phase = "playing";
  harness.render();
  assert.equal(harness.presenters.getSnapshot().entries.pivot.hasHint, false);
  assert.equal(harness.presenters.request("pivot"), false);
});
