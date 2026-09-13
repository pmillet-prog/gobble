import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import parser from "@babel/parser";
import {
  buildLepersBonusAnnouncement,
  buildLepersSolvedIntervention,
  getLepersBonusForNick,
} from "../bots/lepersChallenge.js";

// Exercise the actual server handlers without importing index.js or starting a backend.
const source = fs.readFileSync(new URL("../index.js", import.meta.url), "utf8");
const functionNames = ["buildLiveRanking", "buildRankingUpdatePayload", "maybeAwardLepersChallenge"];
const declarations = parser.parse(source, { sourceType: "module" }).program.body
  .filter((node) => node.type === "FunctionDeclaration" && functionNames.includes(node.id.name))
  .map((node) => source.slice(node.start, node.end)).join("\n");

function setup() {
  const announcements = [];
  const interventions = [];
  const context = vm.createContext({
    Map, Set,
    buildLepersBonusAnnouncement, buildLepersSolvedIntervention, getLepersBonusForNick,
    isStandaloneTrainingPlayer: (player) => !!player.inTraining,
    isPlayerConnected: () => true,
    isBotToken: () => false,
    hasPlayerActivity: () => true,
    getTeamForInstallCached: () => null,
    isPlayerAfk: () => false,
    isDailyChampionPlayer: () => false,
    getWeeklyVocabPodiumRankForPlayer: () => 0,
    isWeeklyVocabChampionPlayer: () => false,
    bumpRoomPerfCounter: () => {},
    PERF_RANKING_BUILD_WARN_MS: Infinity,
    normalizeWord: (word) => String(word).trim().toLowerCase(),
    normalizeInstallId: (id) => id,
    pushAnnouncement: (_room, entry) => announcements.push(entry),
    emitLepersIntervention: (_room, entry, recipient) => interventions.push({ entry, recipient }),
  });
  vm.runInContext(declarations, context);
  const room = {
    id: "room-1",
    currentRound: {
      id: "round-1", status: "running", gobbles: new Map([["Test", 1]]),
      lepersChallenge: { id: "round-1:lepers", word: "balustre", foundBy: new Set() },
    },
    players: new Map([
      ["Test", { nick: "Test", installId: "test-install" }],
      ["Tigre", { nick: "Tigre", installId: "tigre-install" }],
    ]),
    submissions: new Map([["round-1", new Map([
      ["Test", { score: 100 }], ["Tigre", { score: 90 }],
    ])]]),
  };
  return { context, room, announcements, interventions };
}

test("Julien awards one public card event per finder without disclosing the answer", () => {
  const { context, room, announcements, interventions } = setup();
  const attempt = { nick: "Test", player: room.players.get("Test"), socketId: "socket-test", word: "BALUSTRE" };
  assert.equal(context.maybeAwardLepersChallenge(room, { ...attempt, word: "incorrect" }), false);
  assert.equal(context.maybeAwardLepersChallenge(room, { ...attempt, isBotPlayer: true }), false);
  assert.equal(announcements.length, 0);
  assert.equal(context.maybeAwardLepersChallenge(room, attempt), true);
  assert.equal(context.maybeAwardLepersChallenge(room, attempt), false);
  assert.equal(announcements.length, 1);
  assert.equal(announcements[0].type, "lepers_bonus_awarded");
  assert.equal(announcements[0].nick, "Test");
  assert.equal(announcements[0].bonus, 2);
  assert.match(announcements[0].text, /Julien Lechéper/);
  assert.doesNotMatch(JSON.stringify(announcements[0]), /balustre|highlights|definition/i);
  assert.equal(interventions.length, 1);
  assert.equal(interventions[0].recipient.socketId, "socket-test");
  assert.equal(context.maybeAwardLepersChallenge(room, { ...attempt, nick: "Tigre" }), true);
  assert.equal(announcements.length, 2);
  assert.notEqual(announcements[0].id, announcements[1].id);
});

test("live ranking and reconnect snapshot retain the card without changing round points", () => {
  const { context, room } = setup();
  const before = context.buildRankingUpdatePayload(room);
  assert.equal(before.payload.ranking[0].lepersBonus, 0);
  room.currentRound.lepersChallenge.foundBy.add("Test");
  const after = context.buildRankingUpdatePayload(room);
  assert.notEqual(after.signature, before.signature);
  for (const ranking of [after.payload.ranking, context.buildLiveRanking(room, "round-1")]) {
    assert.equal(ranking[0].lepersBonus, 2);
    assert.equal(ranking[0].score, 100);
    assert.equal(ranking[0].gobbles, 1);
    assert.equal(ranking[1].lepersBonus, 0);
  }
  room.currentRound.lepersChallenge = null;
  assert.equal(context.buildRankingUpdatePayload(room).payload.ranking[0].lepersBonus, 0);
});
