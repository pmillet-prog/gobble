import test from "node:test";
import assert from "node:assert/strict";
import { annotateDailySpecialGobbles } from "./dailySpecialReview.js";
import { getDailySpecialWordReview } from "../../src/components/daily/dailySpecialRecapModel.js";

test("daily Gobble metadata follows the existing score and length rules on valid words only", () => {
  const source = [
    { word: "chats", valid: true, points: 25 },
    { word: "chat", valid: true, points: 40 },
    { word: "chazz", valid: false, points: 999, reason: "not_in_dictionary" },
  ];
  const annotated = annotateDailySpecialGobbles(source, { maxWordLen: 5, maxWordPts: 40 });
  assert.deepEqual(annotated.map(entry => [entry.gobble, entry.doubleGobble]), [[true, false], [true, false], [false, false]]);
  assert.deepEqual(annotated.map(({ gobble, doubleGobble, ...entry }) => entry), source,
    "presentation annotations do not change scores or verdicts");
  assert.equal(source[0].gobble, undefined);
  assert.deepEqual(getDailySpecialWordReview({ wordReview: annotated }).map(entry => entry.gobble), [true, true, false]);
});

test("both official daily criteria on the same word identify a double Gobble; unknown thresholds do not", () => {
  const review = [{ word: "chats", valid: true, points: 40 }];
  assert.deepEqual(annotateDailySpecialGobbles(review, { maxWordLen: 5, maxWordPts: 40 })[0],
    { ...review[0], gobble: true, doubleGobble: true });
  assert.equal(annotateDailySpecialGobbles(review, { maxWordLen: null, maxWordPts: null })[0].gobble, false);
  assert.equal(annotateDailySpecialGobbles(review, { maxWordLen: 6, maxWordPts: 50 })[0].gobble, false);
});
