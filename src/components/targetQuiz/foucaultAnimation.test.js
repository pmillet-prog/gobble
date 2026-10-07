import assert from "node:assert/strict";
import test from "node:test";
import {
  FOUCAULT_ANIMATION_MS,
  createFoucaultTimeline,
  getFoucaultQuestionViewBox,
  getFoucaultReactionViewBox,
  scheduleFoucaultAnimation,
} from "./foucaultAnimation.js";

function fakeClock() {
  let time = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimer: (callback, delay) => {
      const id = ++nextId;
      timers.set(id, { callback, at: time + delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    pending: () => timers.size,
    advance: (duration) => {
      const end = time + duration;
      let first;
      while ((first = [...timers].sort((a, b) => a[1].at - b[1].at)[0]) && first[1].at <= end) {
        time = first[1].at;
        timers.delete(first[0]);
        first[1].callback();
      }
      time = end;
    },
    stall: (duration) => { time += duration; },
    flush: () => {
      const pending = [...timers];
      timers.clear();
      for (const [, timer] of pending) timer.callback();
    },
  };
}

test("each question follows poses 1, 3, 2, 6, 5, 4, 7 over two seconds", () => {
  const timeline = createFoucaultTimeline();
  assert.deepEqual(timeline.map(({ frame }) => frame), [0, 2, 1, 5, 4, 3, 6]);
  assert.deepEqual(timeline.map(({ at }) => Math.round(at)), [0, 333, 667, 1000, 1333, 1667, 2000]);
});

test("sprite viewports select the seven portraits and the matching reaction without changing source images", () => {
  assert.equal(getFoucaultQuestionViewBox(0), "-3.5 108 332 512");
  assert.equal(getFoucaultQuestionViewBox(6), "1845 108 332 512");
  assert.equal(getFoucaultQuestionViewBox(20), getFoucaultQuestionViewBox(6));
  assert.equal(getFoucaultReactionViewBox(false), "0 35 887 830");
  assert.equal(getFoucaultReactionViewBox(true), "887 35 887 830");
});

test("animation keeps one pending timer and stops on the serious pose at its deadline", () => {
  const clock = fakeClock();
  const seen = [];
  scheduleFoucaultAnimation({ ...clock, onFrame: (frame) => seen.push(frame) });
  assert.deepEqual(seen, [0]);
  assert.equal(clock.pending(), 1);
  clock.advance(FOUCAULT_ANIMATION_MS - 1);
  assert.notEqual(seen.at(-1), 6);
  assert.equal(clock.pending(), 1);
  clock.advance(1);
  assert.equal(seen.at(-1), 6);
  assert.equal(clock.pending(), 0);
});

test("cleanup cancels pending animation, including when an answer interrupts a question", () => {
  const clock = fakeClock();
  const seen = [];
  const cancel = scheduleFoucaultAnimation({ ...clock, onFrame: (frame) => seen.push(frame) });
  clock.advance(800);
  cancel();
  const count = seen.length;
  clock.advance(4000);
  assert.equal(seen.length, count);
  assert.equal(clock.pending(), 0);
});

test("a delayed browser timer catches up to the final pose without extending the animation", () => {
  const clock = fakeClock();
  const seen = [];
  scheduleFoucaultAnimation({ ...clock, onFrame: (frame) => seen.push(frame) });
  clock.stall(FOUCAULT_ANIMATION_MS + 500);
  clock.flush();
  assert.deepEqual(seen, [0, 6]);
  assert.equal(clock.pending(), 0);
});
