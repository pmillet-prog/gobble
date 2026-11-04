import test from "node:test";
import assert from "node:assert/strict";
import { areRoundResultsPending } from "./roundResultsReadiness.js";

test("only a received payload for this live round permits an absent-player verdict", () => {
  const current = { live: true, roomId: "room", roundId: "r1" };
  assert.equal(areRoundResultsPending(current), true);
  assert.equal(areRoundResultsPending({ ...current, receivedRound: { roomId: "room", roundId: "r0" } }), true);
  assert.equal(areRoundResultsPending({ ...current, receivedRound: { roomId: "other", roundId: "r1" } }), true);
  assert.equal(areRoundResultsPending({ ...current, receivedRound: { roomId: "room", roundId: "r1" } }), false);
  assert.equal(areRoundResultsPending({ ...current, live: false }), false);
  assert.equal(areRoundResultsPending({ ...current, training: true }), false);
});
