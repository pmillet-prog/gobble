import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDailySpecialWords } from "../daily/dailySpecialReview.js";
import { scoreWordOnGridWithPath } from "../../shared/gameLogic.js";

const grid = ["CHAT", "RIEN", "SONT", "LUNE"].join("").split("").map(letter => ({ letter, bonus: null }));
const dictionary = new Set(["chat", "chats", "rien", "lune"]);
const chat = { word: "chat", path: [0, 1, 2, 3] };
const rien = { word: "rien", path: [4, 5, 6, 7] };

test("the recap uses the submitted path and the placed bonuses for its points", () => {
  const scoringGrid = grid.map((tile, index) => ({ ...tile, bonus: index === 0 ? "M3" : index === 1 ? "L2" : null }));
  const review = evaluateDailySpecialWords([chat, { word: "chaz", path: [0, 1, 2, 7] }, rien], { grid: scoringGrid, dictionary });
  assert.deepEqual(review.map(entry => entry.valid), [true, false, true]);
  assert.equal(review[0].points, scoreWordOnGridWithPath("chat", scoringGrid, chat.path).pts);
  assert.equal(review[1].reason, "duplicate_start");
  assert.equal(review[1].points, 0);
  assert.equal(review[2].points, scoreWordOnGridWithPath("rien", scoringGrid, rien.path).pts);
});

test("unknown words and broken paths do not reserve a starting tile", () => {
  const review = evaluateDailySpecialWords([
    { word: "chaz", path: chat.path },
    { word: "rien", path: [0, 5, 6, 7] },
    chat,
  ], { grid, dictionary });
  assert.deepEqual(review.map(entry => entry.reason), ["not_in_dictionary", "invalid_path", null]);
  assert.equal(review[2].valid, true);
});

test("duplicate words and shared starts explain why points were rejected", () => {
  const review = evaluateDailySpecialWords([chat, chat, { word: "chats", path: [0, 1, 2, 3, 7] }], { grid, dictionary });
  assert.deepEqual(review.map(entry => entry.reason), [null, "duplicate_word", "duplicate_start"]);
  assert.equal(review.filter(entry => entry.valid).length, 1);
});

test("an empty round produces an empty review and a missing path retains legacy scoring", () => {
  assert.deepEqual(evaluateDailySpecialWords([], { grid, dictionary }), []);
  assert.equal(evaluateDailySpecialWords([{ word: "chat", path: null }], { grid, dictionary })[0].valid, true);
});
