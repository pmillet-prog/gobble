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

test("live roster owns throttling, trace holds and queued timer cleanup", () => {
  const timers = new Map();
  const events = [];
  let nextTimerId = 1;
  let nowMs = 1000;
  let traceActive = false;
  let transitions = 0;
  const scope = createResourceScope("live-roster-queue-test");
  const feature = createLiveRosterFeature(
    { scope },
    {
      clearTimeoutFn: (id) => timers.delete(id),
      now: () => nowMs,
      setTimeoutFn: (callback, delayMs) => {
        const id = nextTimerId++;
        timers.set(id, {
          callback: () => {
            timers.delete(id);
            callback();
          },
          delayMs,
        });
        return id;
      },
    }
  );
  const queueOptions = {
    isTraceActive: () => traceActive,
    onEvent: (label, payload) => events.push({ label, payload }),
    startTransition: (apply) => {
      transitions += 1;
      apply();
    },
  };
  feature.start();

  feature.queuePlayers([{ nick: "Tigre", team: "red" }], queueOptions);
  assert.equal(feature.store.getState().livePlayers[0].team, "red");

  nowMs = 1050;
  feature.queuePlayers([{ nick: "Tigre", team: "blue" }], queueOptions);
  const playersTimer = [...timers.values()].find((timer) => timer.delayMs === 70);
  assert.ok(playersTimer);
  traceActive = true;
  playersTimer.callback();
  assert.equal(feature.store.getState().livePlayers[0].team, "red");
  feature.queuePlayers([{ nick: "Tigre", team: "blue" }], queueOptions);
  traceActive = false;
  assert.deepEqual(feature.flushQueuedUpdates(), { players: 1, ranking: 0 });
  assert.equal(feature.store.getState().livePlayers[0].team, "blue");

  nowMs = 2000;
  feature.queueRanking([{ nick: "Tigre", rank: 1, score: 10 }], queueOptions);
  traceActive = true;
  nowMs = 2050;
  feature.queueRanking([{ nick: "Test", rank: 1, score: 20 }], queueOptions);
  const freshnessTimer = [...timers.values()].find((timer) => timer.delayMs === 600);
  assert.ok(freshnessTimer);
  freshnessTimer.callback();
  assert.equal(transitions, 1);
  assert.equal(feature.store.getState().liveProvisionalRanking[0].nick, "Test");
  assert.ok(events.some((entry) => entry.label === "players-held"));
  assert.ok(events.some((entry) => entry.label === "ranking-freshness-flush"));

  traceActive = false;
  nowMs = 1100;
  feature.queuePlayers([{ nick: "Test", team: "green" }], queueOptions);
  assert.ok(timers.size > 0);
  scope.dispose();
  assert.equal(timers.size, 0);
  assert.deepEqual(feature.store.getState(), {
    livePlayers: [],
    liveProvisionalRanking: [],
    players: [],
    provisionalRanking: [],
  });
});
