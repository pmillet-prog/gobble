import test from "node:test";
import assert from "node:assert/strict";
import { buildTrainingThreeWordsResult } from "./trainingThreeWordsResults.js";
import { getLiveThreeWordsRecap } from "../live/liveThreeWordsRecap.js";

const grid = Array.from("CHATEZRIBOUSNMLP", letter => ({ letter, bonus: null }));
const training = { grid, solutions: [{ word: "chat" }, { word: "cha" }] };
const finish = (wordSlots, placements = {}, session = training) =>
  buildTrainingThreeWordsResult({ training: session, wordSlots, placements, nick: "Tigre", userId: 7 });

test("training reveals valid, invalid and empty slots through the live recap with final bonus points", () => {
  const slots = [{ word: "chat", display: "CHAT", path: [0, 1, 2, 3], pts: 999 },
    { word: "ez", path: [4, 5], pts: 999 }];
  const base = finish(slots);
  const result = finish(slots, { M3: 1 });
  const recap = getLiveThreeWordsRecap([result], { userId: 7 });
  assert.deepEqual(result.words, ["chat"]);
  assert.equal(result.score, base.score * 3);
  assert.equal(result.wordScores.chat, result.score);
  assert.deepEqual(recap.review.map(entry => [entry.word, entry.valid, entry.points]), [
    ["CHAT", true, result.score], ["ez", false, 0], ["", false, 0],
  ]);
  assert.match(recap.review[1].explanation, /dictionnaire/);
  assert.equal(slots[0].pts, 999, "finalization does not mutate the provisional slots");
  assert.equal(grid[1].bonus, null);
});

test("training rejects duplicate words, reused start tiles and invalid paths", () => {
  const result = finish([
    { word: "chat", path: [0, 1, 2, 3] },
    { word: "chat", path: [0, 1, 2, 3] },
    { word: "cha", path: [0, 1, 2] },
  ]);
  assert.deepEqual(result.specialWordSlots.map(slot => slot.reason), [null, "duplicate_word", "duplicate_start"]);
  const invalid = finish([{ word: "chat", path: [3, 2, 1, 0] }]);
  assert.equal(invalid.score, 0);
  assert.equal(invalid.specialWordSlots[0].reason, "invalid_path");
  assert.deepEqual(invalid.words, []);
});

test("an empty round still has a recap, and compact training solutions are accepted", () => {
  const empty = getLiveThreeWordsRecap([finish([])], { nickname: "Tigre" });
  assert.equal(empty.result.score, 0);
  assert.equal(empty.review.length, 3);
  assert.ok(empty.review.every(entry => !entry.word && !entry.valid));
  assert.ok(finish([{ word: "chat", path: [0, 1, 2, 3] }], {}, {
    grid, solutions: [["chat", 999, [0, 1, 2, 3]]],
  }).score > 0);
});
