import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createLiveRosterFeature } from "./createLiveRosterFeature.js";

test("live roster isolates score updates and releases raw plus projected data", () => {
  const kernel = createApplicationKernel();
  const scope = createResourceScope("live-roster-test");
  const feature = createLiveRosterFeature({ scope });
  let kernelNotifications = 0;
  const unsubscribeKernel = kernel.subscribe(() => {
    kernelNotifications += 1;
  });
  feature.start();

  feature.setPlayers([
    { nick: "Tigre", score: 10, team: "red" },
    { nick: "Test", score: 5, team: "blue" },
  ]);
  feature.setProvisionalRanking([
    { nick: "Tigre", rank: 1, score: 10, team: "red" },
    { nick: "Test", rank: 2, score: 5, team: "blue" },
  ]);

  const initial = feature.store.getState();
  const initialPlayersMetadata = initial.players;
  const initialRankingMetadata = initial.provisionalRanking;
  assert.equal(initial.players[0].nick, "Tigre");
  assert.equal("score" in initial.players[0], false);

  feature.setPlayers([
    { nick: "Tigre", score: 10, team: "red" },
    { nick: "Test", score: 30, team: "blue" },
  ]);
  feature.setProvisionalRanking([
    { nick: "Test", rank: 1, score: 30, team: "blue" },
    { nick: "Tigre", rank: 2, score: 10, team: "red" },
  ]);
  const scoreOnlyUpdate = feature.store.getState();
  assert.notEqual(scoreOnlyUpdate.livePlayers, initial.livePlayers);
  assert.equal(scoreOnlyUpdate.players, initialPlayersMetadata);
  assert.equal(scoreOnlyUpdate.provisionalRanking, initialRankingMetadata);
  assert.equal(scoreOnlyUpdate.livePlayers[1].score, 30);
  assert.equal(kernelNotifications, 0);
  assert.equal(kernel.getState().realtime.players, undefined);
  assert.equal(kernel.getState().realtime.provisionalRanking, undefined);

  feature.setPlayers([
    { nick: "Tigre", score: 10, team: "blue" },
    { nick: "Test", score: 30, team: "blue" },
  ]);
  assert.notEqual(feature.store.getState().players, initialPlayersMetadata);
  assert.equal(feature.store.getState().players[0].team, "blue");

  scope.dispose();
  assert.deepEqual(feature.store.getState(), {
    livePlayers: [],
    liveProvisionalRanking: [],
    players: [],
    provisionalRanking: [],
  });
  unsubscribeKernel();
});
