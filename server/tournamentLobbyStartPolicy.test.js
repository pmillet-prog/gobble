import test from "node:test";
import assert from "node:assert/strict";
import { getTournamentLobbyStartStatus } from "./tournamentLobbyStartPolicy.js";

test("meeting the ready threshold immediately allows the countdown, with no time condition", () => {
  assert.deepEqual(getTournamentLobbyStartStatus({
    activeHumanCount: 4, readyCount: 2, isLobbyOpen: true,
  }), { readyThreshold: 2, readyThresholdMet: true, canStart: true });
  assert.equal(getTournamentLobbyStartStatus({
    activeHumanCount: 4, readyCount: 1, isLobbyOpen: true,
  }).canStart, false);
});

test("the existing threshold remains half the active humans rounded up, at least one", () => {
  for (const [humans, threshold] of [[1, 1], [2, 1], [3, 2], [5, 3], [10, 5]]) {
    const state = { activeHumanCount: humans, readyCount: threshold, isLobbyOpen: true };
    assert.equal(getTournamentLobbyStartStatus(state).readyThreshold, threshold);
    assert.equal(getTournamentLobbyStartStatus(state).canStart, true);
    assert.equal(getTournamentLobbyStartStatus({ ...state, readyCount: threshold - 1 }).canStart, false);
  }
});

test("empty rooms, closed lobbies and maintenance still prevent a start", () => {
  assert.equal(getTournamentLobbyStartStatus({ activeHumanCount: 0, readyCount: 1, isLobbyOpen: true }).canStart, false);
  assert.equal(getTournamentLobbyStartStatus({ activeHumanCount: 4, readyCount: 4, isLobbyOpen: false }).canStart, false);
  assert.equal(getTournamentLobbyStartStatus({ activeHumanCount: 4, readyCount: 4, isLobbyOpen: true, maintenanceMode: true }).canStart, false);
  assert.equal(getTournamentLobbyStartStatus().canStart, false);
});
