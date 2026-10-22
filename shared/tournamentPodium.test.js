import test from "node:test";
import assert from "node:assert/strict";
import { selectTournamentPodium, getTournamentPodiumMedalAwards } from "./tournamentPodium.js";

const entry = (nick, isBot, points, pos) => ({ nick, isBot, points, pos });
const names = entries => entries.map(player => player.nick);

test("one human wins gold even below every bot; the best bots fill silver and bronze", () => {
  const ranking = [entry("Bot 1", true, 90, 1), entry("Bot 2", true, 80, 2), entry("Bot 3", true, 70, 3), entry("Pounie", false, 10, 4)];
  const podium = selectTournamentPodium(ranking);
  assert.deepEqual(names(podium), ["Pounie", "Bot 1", "Bot 2"]);
  assert.deepEqual(podium.map(player => player.podiumRank), [1, 2, 3]);
  assert.equal(podium[0].pos, 4);
  assert.deepEqual(getTournamentPodiumMedalAwards(podium), [{ nick: "Pounie", type: "gold", podiumRank: 1 }]);
});

test("two humans take gold and silver in their score order, then the highest ranked bot", () => {
  const podium = selectTournamentPodium([
    entry("Bot 1", true, 90, 1), entry("Paul", false, 80, 2), entry("Bot 2", true, 70, 3), entry("Pounie", false, 10, 4),
  ]);
  assert.deepEqual(names(podium), ["Paul", "Pounie", "Bot 1"]);
  assert.deepEqual(getTournamentPodiumMedalAwards(podium).map(player => [player.nick, player.type]), [["Paul", "gold"], ["Pounie", "silver"]]);
});

test("three or more humans fill every podium place, preserving existing tie-breakers", () => {
  const podium = selectTournamentPodium([
    entry("Bot", true, 100, 1), entry("Zoé", false, 30, 2), entry("Alice", false, 30, 3), entry("Paul", false, 20, 4), entry("Test", false, 10, 5),
  ]);
  assert.deepEqual(names(podium), ["Zoé", "Alice", "Paul"]);
  assert.deepEqual(getTournamentPodiumMedalAwards(podium).map(player => player.type), ["gold", "silver", "bronze"]);
});

test("a ranked human with zero points still precedes bots and receives the corresponding medal", () => {
  const podium = selectTournamentPodium([entry("Bot", true, 100, 1), entry("Test", false, 0, 2)]);
  assert.deepEqual(names(podium), ["Test", "Bot"]);
  assert.equal(getTournamentPodiumMedalAwards(podium)[0].type, "gold");
});

test("bot-only podiums preserve score order without account rewards", () => {
  const podium = selectTournamentPodium([entry("Bot 1", true, 10, 1), entry("Bot 2", true, 0, 2)]);
  assert.deepEqual(names(podium), ["Bot 1", "Bot 2"]);
  assert.deepEqual(getTournamentPodiumMedalAwards(podium), []);
  assert.deepEqual(selectTournamentPodium(null), []);
  assert.deepEqual(getTournamentPodiumMedalAwards([]), []);
});

test("selecting the podium never mutates scores, source order, positions or identities", () => {
  const ranking = Object.freeze([Object.freeze({ ...entry("Bot", true, 90, 1), userId: null }), Object.freeze({ ...entry("Paul", false, 60, 2), userId: 7 })]);
  const before = JSON.stringify(ranking);
  const podium = selectTournamentPodium(ranking);
  assert.equal(JSON.stringify(ranking), before);
  assert.equal(podium[0].userId, 7);
  assert.equal(podium[0].points, 60);
  assert.notEqual(podium[0], ranking[1]);
});
