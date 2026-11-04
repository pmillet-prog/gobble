import test from "node:test";
import assert from "node:assert/strict";
import { createCameraSpinDirector } from "./createCameraSpinDirector.js";
import { createCameraTimelinePlayer } from "./createCameraTimelinePlayer.js";
import { createCameraTimeline } from "./cameraTimeline.js";

function harness() {
  let now = 0, frameId = 0, director, threshold = 0.5, automatic = true;
  const frames = new Map(), changes = [];
  const player = createCameraTimelinePlayer({ readTimeline: createCameraTimeline, now: () => now,
    requestFrame(callback) { frames.set(++frameId, callback); return frameId; }, cancelFrame: id => frames.delete(id),
    onFrame() {}, onChange(state) { changes.push(state); director?.onTransportChange(); },
  });
  director = createCameraSpinDirector({ player, enabled: () => automatic, readSpeedThreshold: () => threshold });
  return { player, director, changes, frames,
    speed(value, id = 1, phase = "spinning") { director.update({ id, phase, velocity: value * Math.PI * 2 }); },
    advance(ms) { now += ms; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(now)); },
    setThreshold(value) { threshold = value; }, setAutomatic(value) { automatic = value; },
  };
}

test("launch triggers once under the adjustable speed threshold in either direction", () => {
  for (const direction of [-1, 1]) {
    const app = harness(); app.speed(direction * 2);
    assert.deepEqual(app.player.snapshot(), { sequence: "intro", time: 5, playing: false });
    app.speed(direction * 0.6); assert.equal(app.player.snapshot().sequence, "intro");
    app.setThreshold(0.7); app.speed(direction * 0.6);
    assert.deepEqual(app.player.snapshot(), { sequence: "launch", time: 0, playing: true });
    app.advance(1000); app.speed(-direction * 0.8); app.speed(direction * 0.2);
    assert.equal(app.player.snapshot().time, 1);
    assert.equal(app.changes.filter(state => state.sequence === "launch" && state.time === 0).length, 1);
    app.player.dispose();
  }
});

test("a completed launch holds until actual wheel rest, then returns to the plateau", () => {
  const app = harness(); app.speed(1); app.speed(0.4); app.advance(3000);
  assert.deepEqual(app.player.snapshot(), { sequence: "launch", time: 3, playing: false });
  app.speed(0.1); app.advance(3000); assert.equal(app.player.snapshot().sequence, "launch");
  app.speed(0, 1, "finished"); assert.equal(app.player.snapshot().sequence, "results");
  app.advance(3000); assert.deepEqual(app.player.snapshot(), { sequence: "results", time: 3, playing: false });
  app.player.dispose();
});

test("early wheel rest waits for the entire launch shot, including a suspended tab", () => {
  const app = harness(); app.speed(1); app.speed(0.1); app.advance(500); app.speed(0, 1, "finished");
  app.player.pause(); app.advance(30000);
  assert.deepEqual(app.player.snapshot(), { sequence: "launch", time: 0.5, playing: false });
  app.player.play(); app.advance(2400); assert.equal(app.player.snapshot().sequence, "launch");
  app.advance(100); assert.deepEqual(app.player.snapshot(), { sequence: "results", time: 0, playing: true });
  assert.equal(app.frames.size, 1); app.player.dispose();
});

test("manual editing cancels automatic direction until the next throw", () => {
  const app = harness(); app.speed(0.4); app.director.override(); app.player.seek("intro", 2);
  app.speed(0.1); app.speed(0, 1, "finished"); app.advance(5000);
  assert.deepEqual(app.player.snapshot(), { sequence: "intro", time: 2, playing: false });
  app.speed(1, 2); app.speed(0.4, 2); assert.equal(app.player.snapshot().sequence, "launch");
  app.player.dispose();
});

test("a new round cancels a pending return, and disabling automatic animation leaves editing alone", () => {
  const app = harness(); app.speed(0.2); app.speed(0, 1, "finished");
  app.speed(0, 1, "ready"); app.player.play("intro", { from: 0 }); app.advance(5000);
  assert.deepEqual(app.player.snapshot(), { sequence: "intro", time: 5, playing: false });
  app.setAutomatic(false); app.speed(0.4, 2); app.speed(0, 2, "finished");
  assert.equal(app.player.snapshot().sequence, "intro"); app.player.dispose();
});
