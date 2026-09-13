import test from "node:test";
import assert from "node:assert/strict";
import { getDailySpecialWordReview, isOwnDailyEntry } from "./dailySpecialRecapModel.js";

test("server verdicts explain rejected words and show unfilled slots", () => {
  const review = getDailySpecialWordReview({ wordReview: [
    { word: "chat", valid: true, points: 42 },
    { word: "chaz", valid: false, points: 0, reason: "not_in_dictionary" },
  ] });
  assert.equal(review.length, 3);
  assert.equal(review[0].points, 42);
  assert.equal(review[1].label, "Non retenu");
  assert.match(review[1].explanation, /dictionnaire/);
  assert.equal(review[2].label, "Non proposé");
  assert.equal(review[2].points, 0);
});

test("legacy results show known verdicts without inventing points or rejection reasons", () => {
  const review = getDailySpecialWordReview({
    words: ["repudiasse"],
    wordSubmissions: [{ word: "RÉPUDIASSE" }, { word: "CHAZ" }],
  });
  assert.equal(review[0].valid, true);
  assert.equal(review[0].points, null);
  assert.match(review[1].explanation, /motif détaillé n’a pas été conservé/);
  assert.equal(getDailySpecialWordReview({ score: 0 }), null);
  assert.equal(getDailySpecialWordReview({ words: ["chat"], wordSubmissions: [] }), null);
  assert.ok(getDailySpecialWordReview({ wordReview: [] }).every(entry => entry.label === "Non proposé"));
});

test("a matching nickname cannot reopen a recap from someone else's ranking row", () => {
  const identity = { installId: "17", selfNick: "Tigre" };
  assert.equal(isOwnDailyEntry({ installId: "17", nick: "Tigre" }, identity), true);
  assert.equal(isOwnDailyEntry({ installId: "18", nick: "Tigre" }, identity), false);
  assert.equal(isOwnDailyEntry({ nick: "Tigre" }, identity), true);
  assert.equal(isOwnDailyEntry({ installId: "17", isPalier: true }, identity), false);
});
