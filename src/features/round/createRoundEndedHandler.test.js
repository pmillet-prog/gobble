import assert from "node:assert/strict";
import test from "node:test";
import { createRoundEndedHandler } from "./createRoundEndedHandler.js";

const lepersResult = {
  id: "round:lepers:answer", kind: "answer", word: "allocutaire",
  definition: "Personne à qui s’adresse un énoncé.",
};

for (const phase of ["playing", "results"]) {
  test(`QPUC answer and chosen definition survive the ${phase} result route`, () => {
    const calls = [];
    const handler = createRoundEndedHandler({
      shouldHandleLiveRoundSocketEvents: roomId => roomId === "room",
      phaseRef: { current: phase },
      processRoundEndedRef: { current: payload => calls.push({ route: "results", payload }) },
      playOutroThenResultsRef: {
        current: (payload, options) => calls.push({ route: "outro", payload, options }),
      },
    });
    const payload = { roomId: "room", roundId: "round", lepersResult, results: [] };
    handler(payload);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.lepersResult, lepersResult);
    assert.equal(calls[0].route, phase === "playing" ? "outro" : "results");
    if (phase === "playing") assert.deepEqual(calls[0].options, { fallback: false });
    handler({ ...payload, roomId: "other-room" });
    assert.equal(calls.length, 1);
  });
}

test("OCID results retain their direct route without an outro", () => {
  const calls = [];
  const handler = createRoundEndedHandler({
    shouldHandleLiveRoundSocketEvents: () => true,
    phaseRef: { current: "playing" },
    processRoundEndedRef: { current: payload => calls.push(payload) },
    playOutroThenResultsRef: { current: () => assert.fail("OCID must not play the outro") },
  });
  const payload = { roomId: "room", roundId: "round", targetSummary: { ocid: true } };
  handler(payload);
  assert.deepEqual(calls, [payload]);
});
