import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterventionTextSegments,
  getNextPresenterHitReaction,
  isInterventionForActiveRound,
  resolveInterventionAppearanceSfxKey,
} from "./spriteInterventionAnimation.js";

function highlightedText(text, explicitHighlights = []) {
  return buildInterventionTextSegments(text, explicitHighlights)
    .filter((segment) => segment.highlighted)
    .map((segment) => segment.text);
}

test("important presenter facts are split into blue-ready segments", () => {
  assert.deepEqual(
    highlightedText("Je conseille la terminaison -able : 4 mots possibles."),
    ["-able", "4 mots"]
  );
  assert.deepEqual(
    highlightedText("Il y a 3 mots de 10 lettres à trouver."),
    ["3 mots", "10 lettres"]
  );
});

test("quoted answers and explicit highlights keep the original text intact", () => {
  const text = "Bravo ! C'était « ALLOCUTAIRE » !";
  const segments = buildInterventionTextSegments(text, ["ALLOCUTAIRE"]);
  assert.equal(segments.map((segment) => segment.text).join(""), text);
  assert.deepEqual(
    segments.filter((segment) => segment.highlighted).map((segment) => segment.text),
    ["ALLOCUTAIRE"]
  );
});

test("presenter hits alternate forever between the two reaction poses", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(getNextPresenterHitReaction),
    ["hit1", "hit2", "hit1", "hit2", "hit1"]
  );
});

test("a presenter can reserve a distinct appearance sound for manual activation", () => {
  const config = { manualAppearanceSfxKey: "buzzer" };
  assert.equal(
    resolveInterventionAppearanceSfxKey(config, {
      manualActivation: false,
      fallbackKey: "presenter-appearance",
    }),
    "presenter-appearance"
  );
  assert.equal(
    resolveInterventionAppearanceSfxKey(config, {
      manualActivation: true,
      fallbackKey: "presenter-appearance",
    }),
    "buzzer"
  );
});

test("a retained intervention never crosses into another round", () => {
  assert.equal(isInterventionForActiveRound("round-4", "round-4"), true);
  assert.equal(isInterventionForActiveRound("round-3", "round-4"), false);
  assert.equal(isInterventionForActiveRound(null, "round-4"), true);
});
