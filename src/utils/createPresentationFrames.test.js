import test from "node:test";
import assert from "node:assert/strict";
import { createPresentationFrames } from "./createPresentationFrames.js";
import { createCameraTimelinePlayer } from "../../dev/infortune-perspective/createCameraTimelinePlayer.js";
import { createCameraTimeline } from "../../dev/infortune-perspective/cameraTimeline.js";
import { finishPresentation } from "./finishPresentation.js";

function harness() {
  let time = 0, id = 0; const raf = new Map(), jobs = new Map(), listeners = new Map();
  const doc = { hidden: false, visibilityState: "visible", addEventListener(e, fn) { listeners.set(fn, e); }, removeEventListener(e, fn) { listeners.delete(fn); } };
  const timers = { setTimeout(fn) { jobs.set(++id, fn); return id; }, clearTimeout(key) { jobs.delete(key); } };
  const frames = createPresentationFrames({ documentTarget: doc, now: () => time, timers,
    requestFrame(fn) { raf.set(++id, fn); return id; }, cancelFrame(key) { raf.delete(key); } });
  return { frames, doc, jobs, raf, listeners, timers, now: () => time,
    advance(ms) { time += ms; }, visible(value) { doc.hidden = !value; doc.visibilityState = value ? "visible" : "hidden"; for (const fn of [...listeners.keys()]) fn(); } };
}
test("hidden shots use a coarse timer; a suspended shot completes at elapsed time on return", () => {
  const h = harness(), changes = [];
  const player = createCameraTimelinePlayer({ ...h.frames, readTimeline: createCameraTimeline, onFrame() {}, onChange: state => changes.push(state) });
  player.play("intro", { from: 0 }); assert.equal(h.raf.size, 1);
  h.visible(false); assert.equal(h.raf.size, 0); assert.equal(h.jobs.size, 1);
  h.advance(10_000); h.visible(true);
  assert.deepEqual(player.snapshot(), { sequence: "intro", time: 5, playing: false });
  assert.equal(changes.filter(state => !state.playing).length, 1);
  player.dispose(); h.frames.dispose(); assert.equal(h.jobs.size + h.raf.size + h.listeners.size, 0);
});
test("hidden tasks can finish without a paint and cancellation releases all callbacks", () => {
  const h = harness(); h.visible(false); let received = 0;
  h.frames.requestFrame(at => { received = at; }); h.advance(2000);
  const jobs = [...h.jobs.values()]; h.jobs.clear(); jobs.forEach(fn => fn()); assert.equal(received, 2000);
  const key = h.frames.requestFrame(() => assert.fail("cancelled")); h.frames.cancelFrame(key);
  h.frames.dispose(); assert.equal(h.jobs.size + h.listeners.size, 0);
});
test("an animation promise stalled by hidden rendering cannot delay results past its duration", async () => {
  const h = harness(); let finished = 0;
  const animation = { currentTime: 0, effect: { getComputedTiming: () => ({ endTime: 6000 }) }, finished: new Promise(() => {}), finish() { finished++; } };
  const waiting = finishPresentation([animation], { now: h.now, timers: h.timers, documentTarget: h.doc, windowTarget: null });
  h.visible(false); h.advance(7000); h.visible(true); await waiting;
  assert.equal(finished, 1); h.frames.dispose(); assert.equal(h.jobs.size + h.listeners.size, 0);
});
