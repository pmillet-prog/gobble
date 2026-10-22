import test from "node:test";
import assert from "node:assert/strict";
import { getRoundResultParticipation } from "./roundResultParticipation.js";

test("training observers with no live activity cannot receive passive round points", () => {
  for (const training of [
    { standaloneTraining: { sessionId: "gotus", mode: "gotus" } },
    { standaloneTraining: { sessionId: "classic", mode: "normal" } },
    { trainingPresenceOnly: true },
  ]) {
    assert.deepEqual(getRoundResultParticipation({ connected: true, ...training }), { connected: false, included: false });
  }
});

test("live activity acquired before entering training remains like a disconnected player's result", () => {
  const training = { connected: true, standaloneTraining: { sessionId: "gotus", mode: "gotus" } };
  assert.deepEqual(getRoundResultParticipation(training, { participated: true }), { connected: false, included: true });
  assert.deepEqual(getRoundResultParticipation({ connected: false }, { participated: true }), { connected: false, included: true });
  assert.deepEqual(getRoundResultParticipation(null, { participated: true }), { connected: false, included: true });
});

test("connected live players and bots keep their previous eligibility", () => {
  assert.deepEqual(getRoundResultParticipation({ connected: true }), { connected: true, included: true });
  assert.deepEqual(getRoundResultParticipation(null, { isBot: true }), { connected: true, included: true });
  assert.deepEqual(getRoundResultParticipation({ connected: false }), { connected: false, included: false });
});

test("target results still require current live presence, even with previous activity", () => {
  const training = { connected: true, standaloneTraining: { sessionId: "gotus" } };
  assert.equal(getRoundResultParticipation(training, { participated: true }).connected, false);
  assert.equal(getRoundResultParticipation({ connected: false }, { participated: true }).connected, false);
});
