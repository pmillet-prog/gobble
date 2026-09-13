import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterventionTextSegments,
  getNextPresenterHitReaction,
  isInterventionForActiveRound,
  resolveInterventionAppearanceSfxKey,
  schedulePresenterHitExit,
  PRESENTER_HIT_IDLE_MS,
  PRESENTER_STARS_HOLD_MS,
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

test("stars appear at the presenter after the last hit timeout, before its exit", () => {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const events = [];
  const schedule = (callback, delay) => timers.set(++nextId, { callback, at: now + delay });
  function advanceTo(target) {
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at).find(([, timer]) => timer.at <= target);
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].callback();
    }
    now = target;
  }
  const hit = () => {
    // SpriteIntervention cancels the owned timers on each new hit and on unmount.
    timers.clear();
    schedulePresenterHitExit({
      schedule, showStars: () => events.push(["stars", now]),
      startExit: () => events.push(["exit", now]), complete: () => events.push(["complete", now]), exitMs: 240,
    });
  };
  hit();
  advanceTo(PRESENTER_HIT_IDLE_MS - 100);
  hit();
  const starsAt = now + PRESENTER_HIT_IDLE_MS;
  advanceTo(starsAt - 1);
  assert.deepEqual(events, []);
  advanceTo(starsAt);
  assert.deepEqual(events, [["stars", starsAt]]);
  advanceTo(starsAt + PRESENTER_STARS_HOLD_MS - 1);
  assert.equal(events.length, 1);
  advanceTo(starsAt + PRESENTER_STARS_HOLD_MS + 240);
  assert.deepEqual(events, [
    ["stars", starsAt], ["exit", starsAt + PRESENTER_STARS_HOLD_MS],
    ["complete", starsAt + PRESENTER_STARS_HOLD_MS + 240],
  ]);
  hit();
  timers.clear();
  advanceTo(now + 10000);
  assert.equal(events.length, 3);
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
  assert.equal(isInterventionForActiveRound("round-3", null), false);
  assert.equal(isInterventionForActiveRound(null, null), false);
});
