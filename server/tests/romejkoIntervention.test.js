import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRomejkoInterventionText,
  getRomejkoLongestWordSummary,
  getRomejkoScheduleDelayMs,
  hasPlayerFoundLongestWordGobble,
} from "../bots/romejkoIntervention.js";

test("makes the round-start presenters available together before the countdown ends", () => {
  assert.equal(getRomejkoScheduleDelayMs(7_800, 120_000), 650);
  assert.equal(getRomejkoScheduleDelayMs(900, 60_000), 250);
  assert.equal(getRomejkoScheduleDelayMs(0, 60_000), 0);
});

test("counts every distinct longest word in the prepared grid", () => {
  assert.deepEqual(
    getRomejkoLongestWordSummary([
      { word: "chat" },
      { word: "maisons" },
      { word: "soleils" },
      { word: "MAISONS" },
      { word: "route" },
    ]),
    { count: 2, length: 7 }
  );
});

test("announces both the count and maximum length with correct grammar", () => {
  assert.equal(
    buildRomejkoInterventionText({ count: 1, length: 9 }),
    "Il y a 1 mot de 9 lettres à trouver : c'est le plus long de la grille."
  );
  assert.equal(
    buildRomejkoInterventionText({ count: 4, length: 10 }),
    "Il y a 4 mots de 10 lettres à trouver : ce sont les plus longs de la grille."
  );
});

test("recognizes the live and special-three longest-word Gobble states", () => {
  assert.equal(
    hasPlayerFoundLongestWordGobble({
      gobbleFlags: new Map(),
      longestLength: 8,
      longestPossiblePlayers: new Set(["Alice"]),
      nick: "Alice",
      words: [],
    }),
    true
  );
  assert.equal(
    hasPlayerFoundLongestWordGobble({
      gobbleFlags: new Map([["Bob", { len: true, score: false }]]),
      longestLength: 8,
      longestPossiblePlayers: new Set(),
      nick: "Bob",
      words: [],
    }),
    true
  );
  assert.equal(
    hasPlayerFoundLongestWordGobble({
      gobbleFlags: new Map(),
      longestLength: 8,
      longestPossiblePlayers: new Set(),
      nick: "Chloé",
      words: ["route", "abcdefgh"],
    }),
    true
  );
  assert.equal(
    hasPlayerFoundLongestWordGobble({
      gobbleFlags: new Map(),
      longestLength: 8,
      longestPossiblePlayers: new Set(),
      nick: "David",
      words: ["route", "soleil"],
    }),
    false
  );
});
