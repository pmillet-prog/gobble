import test from "node:test";
import assert from "node:assert/strict";
import { getLiveThreeWordsRecap } from "./liveThreeWordsRecap.js";

test("the live recap shows the player's three final verdicts, including a rejected word and an empty slot", () => {
  const self = {
    userId: 4, nick: "Ancien pseudo", score: 28, words: ["zebre"], wordScores: { zebre: 28 },
    specialWordSlots: [
      { word: "zebre", display: "ZÈBRE", pts: 999, valid: true, reason: null },
      { word: "ribre", pts: 999, valid: false, reason: "not_in_dictionary" },
      { word: "", pts: null },
    ],
  };
  const { result, review } = getLiveThreeWordsRecap([{ userId: 5, score: 100 }, self], { userId: 4, nickname: "Nouveau pseudo" });
  assert.equal(result.score, 28);
  assert.deepEqual(review.map(entry => [entry.word, entry.valid, entry.points]), [
    ["ZÈBRE", true, 28], ["ribre", false, 0], ["", false, 0],
  ]);
  assert.match(review[1].explanation, /dictionnaire/);
});

test("existing server results without detailed verdicts still use accepted words and final points", () => {
  const recap = getLiveThreeWordsRecap([{
    nick: "Tigre", words: ["chat"], score: 9,
    specialWordSlots: [{ word: "chat", pts: 9 }, { word: "chaz", pts: 0 }],
  }], { nickname: " tigre " });
  assert.deepEqual(recap.review.map(entry => entry.valid), [true, false, false]);
  assert.equal(recap.review[0].points, 9);
  assert.equal(getLiveThreeWordsRecap([{ nick: "Autre", specialWordSlots: [] }], { nickname: "Tigre" }), null);
  assert.equal(getLiveThreeWordsRecap([{ nick: "Tigre", words: [] }], { nickname: "Tigre" }), null);
});

test("all-invalid submissions remain visible and explain why the final score is zero", () => {
  const recap = getLiveThreeWordsRecap([{
    nick: "Tigre", words: [], score: 0,
    specialWordSlots: [{ word: "chaz", pts: 0, valid: false, reason: "not_in_dictionary" }],
  }], { nickname: "Tigre" });
  assert.equal(recap.result.score, 0);
  assert.equal(recap.review[0].word, "chaz");
  assert.equal(recap.review[0].label, "Non retenu");
});

test("Gobble uses the official grid maximum only after the final word verdict", () => {
  const results = [{ userId: 7, words: ["zebre", "chat"], score: 30, specialWordSlots: [
    { word: "zebre", display: "ZÈBRE", valid: true, pts: 20 },
    { word: "chazz", valid: false, pts: 999, reason: "not_in_dictionary", gobble: true },
    { word: "chat", valid: true, pts: 10 },
  ] }];
  const recap = getLiveThreeWordsRecap(results, { userId: 7, maxWordLength: 5 });
  assert.deepEqual(recap.review.map(entry => entry.gobble), [true, false, false]);
  assert.ok(recap.review.every(entry => !entry.doubleGobble), "live 3 words awards no score Gobble");
  assert.ok(getLiveThreeWordsRecap(results, { userId: 7, maxWordLength: 6 }).review.every(entry => !entry.gobble));
  assert.ok(getLiveThreeWordsRecap(results, { userId: 7 }).review.every(entry => !entry.gobble),
    "the longest proposal alone cannot establish a Gobble");
});
