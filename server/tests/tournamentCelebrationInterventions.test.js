import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTournamentCelebrationPresenterLines,
  createTournamentRecords,
  recordTournamentWordAchievement,
} from "../bots/tournamentCelebrationInterventions.js";

test("tournament celebration records keep bots out of the longest human word", () => {
  const records = createTournamentRecords();
  recordTournamentWordAchievement(records, {
    isBot: true,
    length: 12,
    nick: "Botus",
    points: 80,
    round: 2,
    word: "robotisation",
  });
  recordTournamentWordAchievement(records, {
    length: 10,
    nick: "Alice",
    points: 42,
    round: 3,
    word: "allocution",
  });
  recordTournamentWordAchievement(records, {
    length: 10,
    nick: "Bob",
    points: 42,
    round: 4,
    word: "allocution",
  });

  assert.equal(records.longestWord.word, "ROBOTISATION");
  assert.deepEqual(records.longestHumanWords, {
    len: 10,
    words: [{ word: "ALLOCUTION", round: 3, finders: ["Alice", "Bob"] }],
  });
});

test("Capello's celebration record excludes the fifth round", () => {
  const records = createTournamentRecords();
  recordTournamentWordAchievement(records, {
    length: 8,
    nick: "Alice",
    points: 48,
    round: 4,
    totalRounds: 5,
    word: "triangle",
  });
  recordTournamentWordAchievement(records, {
    length: 9,
    nick: "Bob",
    points: 120,
    round: 5,
    totalRounds: 5,
    word: "quadrille",
  });

  assert.equal(records.bestWord.word, "QUADRILLE");
  assert.equal(records.bestWordBeforeFinalRound.word, "TRIANGLE");
});

test("the celebration exposes the three requested presenter summaries", () => {
  const records = createTournamentRecords();
  recordTournamentWordAchievement(records, {
    length: 10,
    nick: "Alice",
    points: 48,
    round: 4,
    word: "allocution",
  });
  const lines = buildTournamentCelebrationPresenterLines({
    records,
    totals: new Map([
      ["Alice", { lepersBonus: 2 }],
      ["Bob", { lepersBonus: 2 }],
      ["Botus", { lepersBonus: 0 }],
    ]),
  });

  assert.deepEqual(lines.map((entry) => entry.botKey), ["statistician", "culture", "coach"]);
  assert.match(lines[0].text, /ALLOCUTION.*Alice/);
  assert.equal(lines[1].text, "Nous avons des champions cette semaine : Alice et Bob !");
  assert.match(lines[2].text, /Hors cinquième manche.*ALLOCUTION.*48 points/);
});

test("Lepers stays unavailable when no player solved his bonus", () => {
  const records = createTournamentRecords();
  recordTournamentWordAchievement(records, {
    length: 8,
    nick: "Alice",
    points: 20,
    round: 2,
    word: "triangle",
  });
  const lines = buildTournamentCelebrationPresenterLines({
    records,
    totals: new Map([["Alice", { lepersBonus: 0 }]]),
  });

  assert.deepEqual(lines.map((entry) => entry.botKey), ["statistician", "coach"]);
});
