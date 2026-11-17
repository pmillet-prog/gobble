import assert from "node:assert/strict";
import test from "node:test";

import { createPresenterHintsController } from "../presenters/createPresenterHintsController.js";
import { createRoundBreakHandler } from "./createRoundBreakHandler.js";
import { createTournamentWheelFinale } from "../../../server/infortune/tournamentFinale.js";
import { scheduleFinaleBreak } from "../../../server/infortune/scheduleFinaleBreak.js";

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
  const render = () => {
    presenters.setScope(state.roundId, state.phase);
    // These checks cover round ownership after the vocabulary presentation.
    presenters.setResultsAvailability({ roundId: state.roundId, vocabReady: true });
  };
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

test("the podium gate follows the real shortened finale and opens before the next lobby", () => {
  for (const lastAnswerAt of [50_000, 160_999, null]) {
    const client = createHarness({ phase: "results" });
    let now = 1000, sequence = 0, lobbyEntered = false, scheduler;
    const jobs = new Map();
    const timers = {
      setTimeout(fn, delay) { jobs.set(++sequence, { at: now + delay, fn }); return sequence; },
      clearTimeout(id) { jobs.delete(id); },
    };
    const at = target => {
      while (true) {
        const next = [...jobs].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; jobs.delete(next[0]); next[1].fn();
      }
      now = target;
    };
    const room = { id: "room-4x4", currentRound: {}, lastRoundResults: { payload: {} } };
    const ranking = [1, 2].map(userId => ({ userId, nick: `Joueur ${userId}`, points: 30 - userId,
      basePoints: 30 - userId, gobbles: 0, roundScoreSum: 100 - userId, pos: userId }));
    const finale = createTournamentWheelFinale({ roomId: room.id, tournamentId: "t", startsAt: 41_000,
      puzzle: { clue: "Mon aiguille indique le nord.", answer: "boussole" }, freeLetters: [], ranking,
      now: () => now, timers, onChange: value => scheduler?.update(value),
      onFinish: value => {
        room.breakState.tournamentSummary = { id: "t", ranking: value.ranking };
        client.onBreak({ roomId: room.id, ...room.breakState });
      },
    });
    room.infortuneFinale = finale;
    room.breakState = { ...breakPayload, breakKind: "tournament_end", tournamentSummaryAt: finale.publicSnapshot().podiumAt,
      tournamentSummary: { id: "t", ranking, pendingWheel: true } };
    // The roundEnded handler retains the original server deadline in this guard.
    client.state.tournamentFinaleHoldUntil = room.breakState.tournamentSummaryAt;
    client.onBreak(room.breakState);
    const canShowPodium = () => client.state.phase === "results" && !client.state.tournamentSummary.pendingWheel
      && now >= Math.max(client.state.tournamentSummaryAt, client.state.tournamentFinaleHoldUntil);
    scheduler = scheduleFinaleBreak({ room, finale, afterPodiumMs: 17_500, now: () => now, timers,
      publish: client.onBreak, enterLobby: () => { lobbyEntered = true; client.state.phase = "lobby"; } });
    try {
      at(41_000);
      finale.submit("user:1", { type: "answer", answer: "boussole" });
      if (lastAnswerAt !== null) {
        at(lastAnswerAt);
        finale.submit("user:2", { type: "answer", answer: "soleil" });
      }
      const podiumAt = lastAnswerAt === null ? 176_000 : lastAnswerAt + 5000;
      at(podiumAt - 1);
      assert.equal(canShowPodium(), false, "keep the full result presentation before the ceremony");
      at(podiumAt);
      assert.equal(canShowPodium(), true, `podium must open at ${podiumAt}, before the lobby`);
      assert.equal(lobbyEntered, false);
      assert.equal(client.state.tournamentSummary.ranking[0].points, 39, "use the final ranking including the wheel bonus");
      client.onBreak({ roomId: room.id, ...room.breakState });
      assert.equal(canShowPodium(), true, "repeated/reconnect snapshots must not postpone the podium");
      at(podiumAt + 17_499); assert.equal(canShowPodium(), true);
      at(podiumAt + 17_500); assert.equal(lobbyEntered, true);
    } finally { scheduler.dispose(); finale.dispose(); }
    assert.equal(jobs.size, 0);
  }
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
