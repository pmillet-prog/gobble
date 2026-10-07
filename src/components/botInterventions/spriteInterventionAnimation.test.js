import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterventionTextSegments,
  getNextPresenterHitReaction,
  isInterventionForActiveRound,
  resolveInterventionAppearanceSfxKey,
  schedulePresenterHitExit,
  schedulePresenterMouthAnimation,
  PRESENTER_HIT_IDLE_MS,
  PRESENTER_SPEAKING_DURATION_MS,
  PRESENTER_STARS_HOLD_MS,
} from "./spriteInterventionAnimation.js";
import { CAPELLO_INTERVENTION_CONFIG } from "../capello/capelloAnimation.js";
import { LEPERS_INTERVENTION_CONFIG } from "../lepers/lepersAnimation.js";
import { PIVOT_INTERVENTION_CONFIG } from "../pivot/pivotAnimation.js";
import { ROMEJKO_INTERVENTION_CONFIG } from "../romejko/romejkoAnimation.js";

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

function createMouthAnimationClock(config) {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const frames = [];
  schedulePresenterMouthAnimation({
    config,
    schedule(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    cancelTimer: id => timers.delete(id),
    setFrame: frame => frames.push([now, frame]),
    random: () => 0.5,
  });
  return {
    frames,
    timers,
    advanceTo(target) {
      while (true) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)
          .find(([, timer]) => timer.at <= target);
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].callback();
      }
      now = target;
    },
  };
}

for (const config of [
  CAPELLO_INTERVENTION_CONFIG,
  LEPERS_INTERVENTION_CONFIG,
  PIVOT_INTERVENTION_CONFIG,
  ROMEJKO_INTERVENTION_CONFIG,
]) {
  test(`${config.key} moves for 3 seconds at its usual cadence then stays neutral`, () => {
    const clock = createMouthAnimationClock(config);
    clock.advanceTo(2999);
    assert.ok(clock.frames.length > 20);
    for (let index = 1; index < clock.frames.length; index += 1) {
      const delay = clock.frames[index][0] - clock.frames[index - 1][0];
      assert.ok(delay >= config.mouthDelayMinMs && delay <= config.mouthDelayMaxMs);
    }
    clock.advanceTo(PRESENTER_SPEAKING_DURATION_MS);
    assert.deepEqual(clock.frames.at(-1), [3000, config.neutralFrame]);
    assert.equal(clock.timers.size, 0);
    const frameCount = clock.frames.length;
    clock.advanceTo(10000);
    assert.equal(clock.frames.length, frameCount);
  });
}

test("closing or hitting a presenter can still cancel all remaining sprite timers", () => {
  const clock = createMouthAnimationClock(LEPERS_INTERVENTION_CONFIG);
  clock.advanceTo(500);
  clock.timers.clear();
  const frameCount = clock.frames.length;
  clock.advanceTo(10000);
  assert.equal(clock.frames.length, frameCount);
});
