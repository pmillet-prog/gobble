import assert from "node:assert/strict";
import test from "node:test";
import { withRoundTargetMiniGame } from "./roundTargetMiniGame.js";
import { getRoundBonusPresentation } from "./roundBonusPresentation.js";

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

test("both target intros announce the exact shared draw carried by the round", () => {
  for (const type of ["target_long", "target_score"]) {
    for (const kind of ["gotus", "quiz"]) {
      const special = withRoundTargetMiniGame({ isSpecial: true, type }, { kind });
      const bonus = getRoundBonusPresentation(special);
      assert.equal(bonus.kind, kind);
      assert.equal(bonus.label, kind === "gotus" ? "Gotus" : "Qui veut gagner des Gobblars");
      assert.match(bonus.logo, kind === "gotus" ? /gotus-logo/ : /gobblars-logo/);
    }
  }
});

test("intro does not invent a bonus before the draw or on other rounds", () => {
  for (const special of [null, { type: "target_long" },
    { type: "target_score", targetMiniGame: { kind: "toString" } },
    ...["normal", "speed", "ocid", "self_specials_3_words"].map(type => ({ type, targetMiniGame: { kind: "gotus" } })),
  ]) assert.equal(getRoundBonusPresentation(special), null);
});
