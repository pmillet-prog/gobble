import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createLiveRosterFeature } from "./createLiveRosterFeature.js";

test("live roster ignores score-only updates and releases retained metadata", () => {
  let state = {
    realtime: {
      players: [
        { nick: "Tigre", score: 10, team: "red" },
        { nick: "Test", score: 5, team: "blue" },
      ],
      provisionalRanking: [
        { nick: "Tigre", rank: 1, score: 10, team: "red" },
        { nick: "Test", rank: 2, score: 5, team: "blue" },
      ],
    },
  };
  const listeners = new Set();
  const kernel = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const publish = (nextState) => {
    state = nextState;
    for (const listener of listeners) listener();
  };
  const scope = createResourceScope("live-roster-test");
  const feature = createLiveRosterFeature({ getKernel: () => kernel, scope });
  feature.start();

  const initial = feature.store.getState();
  assert.equal(initial.players[0].nick, "Tigre");
  assert.equal("score" in initial.players[0], false);

  publish({
    realtime: {
      players: [
        { nick: "Tigre", score: 10, team: "red" },
        { nick: "Test", score: 30, team: "blue" },
      ],
      provisionalRanking: [
        { nick: "Test", rank: 1, score: 30, team: "blue" },
        { nick: "Tigre", rank: 2, score: 10, team: "red" },
      ],
    },
  });
  assert.equal(feature.store.getState(), initial);

  publish({
    realtime: {
      players: [
        { nick: "Tigre", score: 10, team: "blue" },
        { nick: "Test", score: 30, team: "blue" },
      ],
      provisionalRanking: [
        { nick: "Test", rank: 1, score: 30, team: "blue" },
        { nick: "Tigre", rank: 2, score: 10, team: "blue" },
      ],
    },
  });
  assert.notEqual(feature.store.getState(), initial);
  assert.equal(feature.store.getState().players[0].team, "blue");

  scope.dispose();
  assert.deepEqual(feature.store.getState(), {
    players: [],
    provisionalRanking: [],
  });
  assert.equal(listeners.size, 0);
});
