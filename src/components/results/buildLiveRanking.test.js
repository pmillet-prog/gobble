import assert from "node:assert/strict";
import test from "node:test";
import { buildLiveRanking } from "./buildLiveRanking.js";

const normalizeUserIdForProfile = (value) => {
  const userId = String(value ?? "").trim();
  return userId || null;
};

function buildRanking(overrides = {}) {
  return buildLiveRanking({
    authenticatedUserId: null,
    duelStatus: null,
    installId: "",
    normalizeUserIdForProfile,
    players: [],
    provisionalRanking: [],
    score: null,
    selfNick: "",
    ...overrides,
  });
}

test("server ranks take priority over local scores and unranked ties use nick order", () => {
  const ranking = buildRanking({
    selfNick: "Tigre",
    score: 200,
    players: [
      { nick: "Tigre", score: 40 },
      { nick: "Zoé", score: 500 },
      { nick: "Alice", score: 500 },
    ],
    provisionalRanking: [
      { nick: "Tigre", score: 30, rank: 2 },
      { nick: "Test", score: 10, rank: 1 },
    ],
  });

  assert.deepEqual(
    ranking.map(({ nick, score, rank }) => ({ nick, score, rank })),
    [
      { nick: "Test", score: 10, rank: 1 },
      { nick: "Tigre", score: 200, rank: 2 },
      { nick: "Alice", score: 500, rank: 3 },
      { nick: "Zoé", score: 500, rank: 4 },
    ],
  );
});

test("ranking reconciles roster identity and medals without changing its source entries", () => {
  const players = Object.freeze([
    Object.freeze({
      nick: "Tigre",
      userId: " roster-user ",
      installId: 123,
      playerKey: "roster-key",
      team: "blue",
      isBot: true,
      weeklyVocabPodiumRank: 2,
      isWeeklyVocabChampion: true,
    }),
    Object.freeze({ nick: "Test", userId: "roster-test", installId: "test-device" }),
  ]);
  const provisionalRanking = Object.freeze([
    Object.freeze({ nick: "Tigre", score: 90, rank: 1, gobbles: 3, lepersBonus: 7 }),
    Object.freeze({
      nick: "Test",
      userId: " ranking-test ",
      installId: "ranking-device",
      playerKey: "ranking-key",
      score: 50,
      rank: 2,
    }),
  ]);

  const ranking = buildRanking({
    authenticatedUserId: "auth-user",
    duelStatus: { crowned: true },
    installId: "123",
    selfNick: "Tigre",
    score: 70,
    players,
    provisionalRanking,
  });

  assert.deepEqual(ranking[0], {
    nick: "Tigre",
    userId: "roster-user",
    installId: "123",
    playerKey: "install:roster-user",
    score: 90,
    gobbles: 3,
    lepersBonus: 7,
    rank: 1,
    team: "blue",
    isBot: true,
    inTraining: false,
    trainingMode: null,
    weeklyVocabPodiumRank: 2,
    isWeeklyVocabChampion: true,
    isDailyChampion: true,
  });
  assert.equal(ranking[1].userId, "ranking-test");
  assert.equal(ranking[1].installId, "ranking-device");
  assert.equal(ranking[1].playerKey, "ranking-key");
  assert.equal(provisionalRanking[0].userId, undefined);
  assert.equal(provisionalRanking[0].score, 90);
});

test("local score fills missing self identity and creates self before the roster arrives", () => {
  const existing = buildRanking({
    authenticatedUserId: " local-user ",
    installId: "local-device",
    selfNick: "Tigre",
    score: 40,
    provisionalRanking: [{ nick: "Tigre", score: null }],
  });
  assert.equal(existing[0].score, 40);
  assert.equal(existing[0].userId, "local-user");
  assert.equal(existing[0].installId, "local-device");
  assert.equal(existing[0].playerKey, "install:local-user");

  const fresh = buildRanking({
    authenticatedUserId: "local-user",
    installId: "local-device",
    selfNick: "Tigre",
    duelStatus: { team: "blue", crowned: true },
    score: 40,
  });
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].nick, "Tigre");
  assert.equal(fresh[0].score, 40);
  assert.equal(fresh[0].rank, 1);
  assert.equal(fresh[0].team, "blue");
  assert.equal(fresh[0].isDailyChampion, true);

  const fallback = buildRanking();
  assert.equal(fallback[0].nick, "Moi");
  assert.equal(fallback[0].score, 0);
  assert.equal(fallback[0].rank, 1);
});

test("training entries stay after live players and retain current local-score reconciliation", () => {
  const ranking = buildRanking({
    selfNick: "Tigre",
    score: 80,
    players: [
      { nick: "Tigre", inTraining: true, trainingMode: "solo" },
      { nick: "Bob", inTraining: true, score: 300, gobbles: 7, lepersBonus: 9 },
      { nick: "Live", score: 10 },
    ],
    provisionalRanking: [
      { nick: "Alice", inTraining: true, score: 500, rank: 1, gobbles: 8, lepersBonus: 4 },
      { nick: "Tigre", score: 400, rank: 2, gobbles: 6, lepersBonus: 3 },
    ],
  });

  assert.deepEqual(
    ranking.map(({ nick, score, rank, gobbles, lepersBonus }) => ({
      nick, score, rank, gobbles, lepersBonus,
    })),
    [
      { nick: "Live", score: 10, rank: 1, gobbles: 0, lepersBonus: 0 },
      { nick: "Tigre", score: 80, rank: 2, gobbles: 0, lepersBonus: 0 },
      { nick: "Alice", score: null, rank: 3, gobbles: 0, lepersBonus: 0 },
      { nick: "Bob", score: null, rank: 4, gobbles: 0, lepersBonus: 0 },
    ],
  );
  assert.equal(ranking[1].trainingMode, "solo");
  assert.ok(ranking.slice(1).every((entry) => entry.inTraining));
});
