import test from "node:test";
import assert from "node:assert/strict";
import { GOBBLARS_SOUND_START, scheduleGobblarsRewardSound } from "./gobblarsRewardSoundCue.js";
import { GOBBLARS_COUNT_START } from "./gobblarsRewardAnimation.js";

function setup(elapsed = 0) {
  let time = 1000 + elapsed, visible = true, played = 0, stopped = 0;
  const timers = new Map();
  const cancel = scheduleGobblarsRewardSound({ startedAt: 1000 }, {
    now: () => time, visible: () => visible,
    play: () => { played++; return { stop: () => stopped++ }; },
    setTimeoutFn: (fn, delay) => { timers.set(1, { fn, delay }); return 1; },
    clearTimeoutFn: id => timers.delete(id),
  });
  return { cancel, timers, played: () => played, stopped: () => stopped,
    hide: () => { visible = false; },
    fire: (late = 0) => { const timer = timers.get(1); timers.delete(1); time += timer.delay + late; timer.fn(); } };
}

test("the original coin sounds when the counter starts", () => {
  const cue = setup();
  assert.equal(cue.timers.get(1).delay, GOBBLARS_SOUND_START);
  assert.equal(GOBBLARS_SOUND_START, GOBBLARS_COUNT_START);
  assert.equal(cue.played(), 0);
  cue.fire();
  assert.equal(cue.played(), 1);
  cue.cancel(); cue.cancel();
  assert.equal(cue.stopped(), 1);
});

test("cancelling removes the pending sound, and a remount keeps the original timing", () => {
  const cancelled = setup();
  cancelled.cancel();
  assert.equal(cancelled.timers.size, 0);
  assert.equal(cancelled.played(), 0);
  const resumed = setup(700);
  assert.equal(resumed.timers.get(1).delay, GOBBLARS_COUNT_START - 700);
  resumed.fire();
  assert.equal(resumed.played(), 1);
});

test("hidden, delayed or already elapsed celebrations never play a late sound", () => {
  const hidden = setup(); hidden.hide(); hidden.fire();
  assert.equal(hidden.played(), 0);
  const delayed = setup(); delayed.fire(5000);
  assert.equal(delayed.played(), 0);
  const old = setup(2800);
  assert.equal(old.timers.size, 0);
  assert.equal(old.played(), 0);
});
