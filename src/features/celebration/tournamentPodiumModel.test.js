import test from "node:test";
import assert from "node:assert/strict";
import { getTournamentPodiumEntries, getTournamentPodiumMedals, resolveTournamentPodiumSummary } from "./tournamentPodiumModel.js";

const ranking = Object.freeze([
  Object.freeze({ nick: "Bernard Pinot", isBot: true, points: 90, pos: 1 }),
  Object.freeze({ nick: "Laurent Bafouille", isBot: true, points: 85, pos: 2 }),
  Object.freeze({ nick: "Lina", installId: "2", points: 80, pos: 3 }),
  Object.freeze({ nick: "Oscar", userId: 3, points: 70, pos: 4 }),
  Object.freeze({ nick: "Moi", points: 60, pos: 5 }),
  Object.freeze({ nick: "Test", points: 0, pos: 6 }),
]);

test("legacy snapshots promote humans for the podium without changing their score ranks or identities", () => {
  const result = getTournamentPodiumEntries({ ranking }, { userId: 4, nick: "Moi", knownPlayers: [{ userId: 4, nick: "Moi" }] });
  assert.deepEqual(result.players.map(entry => [entry.nick, entry.rank, entry.scoreRank, entry.userId]),
    [["Lina", 1, 3, 2], ["Oscar", 2, 4, 3], ["Moi", 3, 5, 4]]);
  assert.equal(result.self.rank, 3);
  assert.equal(result.self.scoreRank, 5);
  assert.equal(result.self.score, 60);
  assert.equal(result.self.totalPlayers, 6);
  assert.equal(ranking[0].nick, "Bernard Pinot");
  assert.equal(ranking[2].podiumRank, undefined);
});

test("an explicit server podium controls ceremony slots, medals and the self result", () => {
  const podium = [ranking[3], ranking[2], ranking[0]].map((entry, index) => ({ ...entry, podiumRank: index + 1 }));
  const summary = { ranking, podium, winnerNick: "Oscar" };
  const result = getTournamentPodiumEntries(summary, { userId: 3, nick: "Oscar" });
  assert.deepEqual(result.players.map(entry => [entry.nick, entry.rank]), [["Oscar", 1], ["Lina", 2], ["Bernard Pinot", 3]]);
  assert.equal(result.players[2].userId, null);
  assert.equal(result.players[2].isBot, true);
  assert.equal(result.self.rank, 1);
  assert.equal(result.self.scoreRank, 4);
  assert.deepEqual(getTournamentPodiumMedals(summary), { Oscar: { gold: 1 }, Lina: { silver: 1 } });
  assert.equal(resolveTournamentPodiumSummary(summary), summary, "authoritative snapshots stay intact");
});

test("a human outside the podium retains the full score-ranking position", () => {
  const result = getTournamentPodiumEntries({ ranking }, { userId: 5, nick: "Test" });
  assert.equal(result.self.rank, 6);
  assert.equal(result.self.scoreRank, 6);
  assert.equal(result.self.totalPlayers, 6);
  assert.equal(result.self.score, 0);
});

test("one human with zero points stands on gold while bots fill the remaining steps", () => {
  const result = getTournamentPodiumEntries([ranking[0], ranking[1], ranking[5]], { userId: 5, nick: "Test" });
  assert.deepEqual(result.players.map(entry => [entry.nick, entry.rank, entry.isBot || false]),
    [["Test", 1, false], ["Bernard Pinot", 2, true], ["Laurent Bafouille", 3, true]]);
  assert.equal(result.self.rank, 1);
  assert.equal(result.self.score, 0);
  assert.deepEqual(getTournamentPodiumMedals([ranking[0], ranking[1], ranking[5]]), { Test: { gold: 1 } });
});

test("old summaries and locally reconstructed rankings announce the same human winner as their medals", () => {
  const old = { ranking, winnerNick: "Bernard Pinot", records: { foundWords: 12 } };
  const summary = resolveTournamentPodiumSummary(old);
  assert.equal(summary.ranking, ranking);
  assert.equal(summary.records, old.records);
  assert.equal(summary.winnerNick, "Lina");
  assert.equal(old.winnerNick, "Bernard Pinot");
  assert.deepEqual(getTournamentPodiumMedals(summary), { Lina: { gold: 1 }, Oscar: { silver: 1 }, Moi: { bronze: 1 } });
});

test("an explicit empty podium is preserved and repeated snapshots produce identical entrants", () => {
  const summary = resolveTournamentPodiumSummary({ ranking });
  const first = getTournamentPodiumEntries(summary, { userId: 2, nick: "Lina" });
  assert.deepEqual(getTournamentPodiumEntries(JSON.parse(JSON.stringify(summary)), { userId: 2, nick: "Lina" }), first);
  assert.deepEqual(getTournamentPodiumEntries({ ranking, podium: [] }).players, []);
  assert.equal(getTournamentPodiumMedals({ ranking, podium: [] }), null);
  assert.deepEqual(getTournamentPodiumEntries(null), { players: [], self: null });
});
