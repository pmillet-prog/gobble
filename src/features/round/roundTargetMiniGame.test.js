import assert from "node:assert/strict";
import test from "node:test";
import { withRoundTargetMiniGame } from "./roundTargetMiniGame.js";

test("server Gotus selection survives round start and snapshot hydration without mutating the plan", () => {
  const special = Object.freeze({ isSpecial: true, type: "target_long", label: "Mot cible" });
  const snapshot = { currentRound: { special, targetMiniGame: { kind: "gotus", wordLength: 6, maxAttempts: 6 } } };
  const hydrated = withRoundTargetMiniGame(snapshot.currentRound.special, snapshot.currentRound.targetMiniGame);
  assert.equal(hydrated.type, "target_long");
  assert.deepEqual(hydrated.targetMiniGame, { kind: "gotus", wordLength: 6, maxAttempts: 6 });
  assert.equal(special.targetMiniGame, undefined);
  assert.equal(withRoundTargetMiniGame(special, { kind: "quiz" }).targetMiniGame.kind, "quiz");
});

test("old payloads retain the quiz and non-target rounds cannot inherit Gotus", () => {
  assert.equal(withRoundTargetMiniGame({ isSpecial: true, type: "target_score" }, null).targetMiniGame.kind, "quiz");
  const ordinary = { isSpecial: true, type: "speed" };
  assert.equal(withRoundTargetMiniGame(ordinary, { kind: "gotus" }), ordinary);
  assert.equal(withRoundTargetMiniGame(null, { kind: "gotus" }), null);
});
