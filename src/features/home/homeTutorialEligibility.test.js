import test from "node:test";
import assert from "node:assert/strict";
import { getProfileRoundCount, isHomeTutorialEligible } from "./homeTutorialEligibility.js";

test("the home tutorial is offered through game 49 and hidden from game 50", () => {
  for (const count of [0, 1, 49]) assert.equal(isHomeTutorialEligible(count), true);
  for (const count of [50, 51, 1200, null, undefined, NaN, -1]) assert.equal(isHomeTutorialEligible(count), false);
});

test("older players retain their recorded history instead of adding overlapping totals", () => {
  assert.equal(getProfileRoundCount({ lifetime: { roundsPlayed: 12 }, weekly: { allTime: { roundsPlayed: 130 } } }), 130);
  assert.equal(getProfileRoundCount({ lifetime: { roundsPlayed: 30 }, weekly: { allTime: { roundsPlayed: 25 } } }), 30);
  assert.equal(getProfileRoundCount({ lifetime: { roundsPlayed: "0" } }), 0);
  assert.equal(getProfileRoundCount({ lifetime: { roundsPlayed: null } }), null);
  assert.equal(getProfileRoundCount({}), null);
});
