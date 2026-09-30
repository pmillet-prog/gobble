import test from "node:test";
import assert from "node:assert/strict";
import { capturePlayersOverlaySnapshot } from "./playersOverlaySnapshot.js";

function setup() {
  const rosterState = {
    // These metadata lists deliberately contain no score or bonus.
    players: [{ nick: "Alice" }, { nick: "Zoé" }],
    provisionalRanking: [{ nick: "Zoé" }, { nick: "Alice" }],
    livePlayers: [
      { nick: "Alice", userId: "alice", deviceKind: "mobile", team: "blue" },
      { nick: "Zoé", userId: "zoe", deviceKind: "desktop" },
    ],
    liveProvisionalRanking: [
      { nick: "Zoé", rank: 1, score: 90, gobbles: 2, lepersBonus: 1 },
      { nick: "Alice", rank: 2, score: 45, gobbles: 0, lepersBonus: 0 },
    ],
  };
  const progressState = { score: 50 };
  const options = {
    roster: { store: { getState: () => rosterState } },
    progress: { store: { getState: () => progressState } },
    rankingConfig: {
      authenticatedUserId: "alice",
      selfNick: "Alice",
      installId: "alice-device",
      normalizeUserIdForProfile: (id) => id || null,
    },
    gobbleAwards: new Map(),
  };
  return { rosterState, progressState, options };
}

test("opening during play captures the actual ranking, score, Gobbles and question bonus", () => {
  const { options } = setup();
  const snapshot = capturePlayersOverlaySnapshot(options);
  assert.deepEqual(
    snapshot.map(({ nick, rank, score, gobbleAwardCount, lepersBonus }) =>
      ({ nick, rank, score, gobbleAwardCount, lepersBonus })),
    [
      { nick: "Zoé", rank: 1, score: 90, gobbleAwardCount: 2, lepersBonus: 1 },
      { nick: "Alice", rank: 2, score: 50, gobbleAwardCount: 0, lepersBonus: 0 },
    ]
  );
  assert.equal(snapshot[1].userId, "alice");
  assert.equal(snapshot[1].deviceKind, "mobile");
  assert.equal(snapshot[1].team, "blue");
});

test("the photo stays frozen, including zero awards, and reopening captures the latest stores", () => {
  const { options, rosterState, progressState } = setup();
  const snapshot = capturePlayersOverlaySnapshot(options);
  rosterState.liveProvisionalRanking = [
    { nick: "Alice", rank: 1, score: 100, gobbles: 1, lepersBonus: 1 },
    { nick: "Zoé", rank: 2, score: 90, gobbles: 2, lepersBonus: 1 },
  ];
  progressState.score = 105;
  options.gobbleAwards.set("Alice", { bestWord: true, longestWord: true });
  assert.equal(snapshot[0].nick, "Zoé");
  assert.equal(snapshot[1].score, 50);
  assert.equal(snapshot[1].gobbleAwardCount, 0);
  assert.equal(snapshot[1].lepersBonus, 0);
  const reopened = capturePlayersOverlaySnapshot(options);
  assert.equal(reopened[0].nick, "Alice");
  assert.equal(reopened[0].score, 105);
  assert.equal(reopened[0].gobbleAwardCount, 2);
  assert.equal(reopened[0].lepersBonus, 1);
});

test("a supplied ranking keeps its order by rank and does not double-count awards or include thresholds", () => {
  const { options } = setup();
  options.gobbleAwards.set("Zoé", { bestWord: true });
  options.ranking = [
    { nick: "Alice", rank: 2, score: 50 },
    { nick: "Zoé", rank: 1, score: 90, gobbles: 2, lepersBonus: 1 },
    { nick: "Zoé", rank: 1, score: 90 },
    { nick: "Palier", isPalier: true, score: 75 },
  ];
  const snapshot = capturePlayersOverlaySnapshot(options);
  assert.deepEqual(snapshot.map((entry) => entry.nick), ["Zoé", "Alice"]);
  assert.equal(snapshot[0].gobbleAwardCount, 2);
  options.ranking[1].score = 150;
  assert.equal(snapshot[0].score, 90);
});

test("players in training do not receive live Gobbles or question cards", () => {
  const { options, rosterState } = setup();
  rosterState.livePlayers.push({ nick: "Test", inTraining: true, score: 999 });
  options.gobbleAwards.set("Test", { bestWord: true, longestWord: true });
  const trainee = capturePlayersOverlaySnapshot(options).find((entry) => entry.nick === "Test");
  assert.equal(trainee.score, null);
  assert.equal(trainee.gobbleAwardCount, 0);
  assert.equal(trainee.lepersBonus, 0);
});
