import test from "node:test";
import assert from "node:assert/strict";
import { createCameraTimeline, cameraAt, setCameraKeyframe, removeCameraKeyframe, normalizeCameraTimeline } from "./cameraTimeline.js";
import { createCameraTimelinePlayer } from "./createCameraTimelinePlayer.js";
import { createProjection, updateProjection, projectPoint, unprojectPoint } from "./projection.js";

test("0% at zero and 50% at three seconds interpolate smoothly, then hold", () => {
  let timeline = createCameraTimeline();
  timeline = removeCameraKeyframe(timeline, "intro", "perspective", 5);
  timeline = setCameraKeyframe(timeline, "intro", "perspective", 3, 50);
  assert.equal(cameraAt(timeline, "intro", 0).perspective, 0);
  assert.equal(cameraAt(timeline, "intro", 1.5).perspective, 25);
  assert.ok(cameraAt(timeline, "intro", 0.3).perspective < 2);
  assert.ok(cameraAt(timeline, "intro", 2.7).perspective > 48);
  assert.equal(cameraAt(timeline, "intro", 3).perspective, 50);
  assert.equal(cameraAt(timeline, "intro", 5).perspective, 50);
});

test("tracks have independent times, replacing a point does not duplicate it, and removal restores interpolation", () => {
  let timeline = createCameraTimeline();
  timeline = setCameraKeyframe(timeline, "intro", "elevation", 2, 50);
  timeline = setCameraKeyframe(timeline, "intro", "elevation", 4, 10);
  assert.equal(cameraAt(timeline, "intro", 3).elevation, 30);
  assert.equal(cameraAt(timeline, "intro", 3).focal, 28);
  timeline = setCameraKeyframe(timeline, "intro", "elevation", 2.01, 60);
  assert.equal(timeline.intro.elevation.length, 3);
  assert.equal(cameraAt(timeline, "intro", 2).elevation, 60);
  timeline = removeCameraKeyframe(timeline, "intro", "elevation", 2);
  assert.equal(cameraAt(timeline, "intro", 2).elevation, 15);
});

test("the launch starts at the intro's final camera and can be independently overridden", () => {
  let timeline = setCameraKeyframe(createCameraTimeline(), "intro", "framing", 5, 120);
  assert.deepEqual(cameraAt(timeline, "launch", 0), cameraAt(timeline, "intro", 5));
  timeline = setCameraKeyframe(timeline, "launch", "framing", 3, 200);
  assert.equal(cameraAt(timeline, "launch", 1.5).framing, 160);
  assert.equal(cameraAt(timeline, "launch", 30).framing, 200);
  timeline = setCameraKeyframe(timeline, "launch", "framing", 0, 150);
  assert.equal(cameraAt(timeline, "launch", 0).framing, 150);
});

test("saved points round-trip, while malformed or out-of-range values cannot break the camera", () => {
  const timeline = createCameraTimeline();
  assert.deepEqual(normalizeCameraTimeline(JSON.parse(JSON.stringify(timeline))), timeline);
  timeline.intro.focal = [{ time: -2, value: 1 }, { time: 50, value: 999 }, { time: NaN, value: 30 }];
  const clean = normalizeCameraTimeline(timeline);
  assert.deepEqual(clean.intro.focal, [{ time: 0, value: 14 }, { time: 5, value: 85 }]);
  assert.deepEqual(normalizeCameraTimeline(null), createCameraTimeline());
});

function playerHarness() {
  let time = 0, id = 0;
  const frames = new Map(), commits = [], changes = [], views = [];
  const timeline = setCameraKeyframe(createCameraTimeline(), "launch", "framing", 3, 150);
  const player = createCameraTimelinePlayer({ readTimeline: () => timeline, now: () => time,
    requestFrame(callback) { frames.set(++id, callback); return id; }, cancelFrame: id => frames.delete(id),
    onFrame: (camera, state) => views.push({ camera, ...state }), onCommit: camera => commits.push(camera), onChange: state => changes.push(state),
  });
  return { player, frames, commits, changes, views,
    advance(ms) { time += ms; const work = [...frames.values()]; frames.clear(); work.forEach(callback => callback(time)); },
  };
}

test("the chained preview lasts five, three, then three seconds independently of render frequency", () => {
  const finalViews = [];
  for (const fps of [30, 60, 120]) {
    const app = playerHarness(); app.player.play("intro", { from: 0, together: true });
    for (let i = 0; i < fps * 11 + 2; i++) app.advance(1000 / fps);
    assert.deepEqual(app.player.snapshot(), { sequence: "results", time: 3, playing: false });
    assert.equal(app.frames.size, 0); assert.equal(app.commits.length, 1);
    assert.ok(app.changes.some(state => state.sequence === "launch" && state.playing));
    finalViews.push(app.views.at(-1).camera); app.player.dispose();
  }
  assert.deepEqual(finalViews[0], finalViews[1]); assert.deepEqual(finalViews[1], finalViews[2]);
});

test("pause, scrubbing, sequence changes and disposal cancel scheduled animation work", () => {
  const app = playerHarness(); app.player.play("intro", { from: 0 }); app.advance(1250);
  app.player.pause(); assert.equal(app.frames.size, 0); app.advance(30000);
  assert.equal(app.player.snapshot().time, 1.25);
  app.player.play(); app.advance(250); assert.equal(app.player.snapshot().time, 1.5);
  app.player.seek("launch", 2); assert.equal(app.frames.size, 0);
  assert.deepEqual(app.player.snapshot(), { sequence: "launch", time: 2, playing: false });
  app.player.play(); app.advance(1000); assert.equal(app.player.snapshot().playing, false);
  app.player.play("intro", { from: 0 }); app.player.dispose();
  const count = app.views.length; app.advance(30000); assert.equal(app.views.length, count); assert.equal(app.frames.size, 0);
});

test("resuming the full preview preserves the sequence chain, while a new intro stays independent", () => {
  const app = playerHarness(); app.player.play("intro", { from: 0, together: true }); app.advance(2000);
  app.player.pause(); app.advance(30000); app.player.play(); app.advance(3500);
  assert.equal(app.player.snapshot().sequence, "launch");
  assert.equal(app.player.snapshot().time, 0.5);
  app.player.play("intro", { from: 0 }); app.advance(5000);
  assert.deepEqual(app.player.snapshot(), { sequence: "intro", time: 5, playing: false });
  app.player.dispose();
});

test("adding the return sequence preserves all previously saved intro and launch points", () => {
  let previous = setCameraKeyframe(createCameraTimeline(), "intro", "framing", 5, 120);
  previous = setCameraKeyframe(previous, "launch", "framing", 3, 200);
  delete previous.results;
  const migrated = normalizeCameraTimeline(JSON.parse(JSON.stringify(previous)));
  assert.deepEqual(migrated.intro, previous.intro);
  assert.deepEqual(migrated.launch, previous.launch);
  assert.deepEqual(cameraAt(migrated, "results", 0), cameraAt(migrated, "launch", 3));
  assert.equal(cameraAt(migrated, "results", 1.5).framing, 160);
  assert.deepEqual(cameraAt(migrated, "results", 3), cameraAt(migrated, "intro", 5));
  const edited = setCameraKeyframe(migrated, "results", "framing", 3, 90);
  assert.equal(cameraAt(edited, "results", 3).framing, 90);
});

test("animated projection reuses its camera and keeps finger mapping correct at every sampled pose", () => {
  const timeline = setCameraKeyframe(createCameraTimeline(), "intro", "roll", 5, 30);
  const projection = createProjection(390, 300), originalCamera = projection.camera;
  for (const time of [0, 0.25, 1.5, 3, 5]) {
    const settings = cameraAt(timeline, "intro", time);
    updateProjection(projection, 390, 300, settings);
    assert.equal(projection.camera, originalCamera);
    const screen = projectPoint(425, 162, projection), point = unprojectPoint(screen.x, screen.y, projection);
    assert.ok(Math.abs(point.x - 425) < 1e-8 && Math.abs(point.y - 162) < 1e-8);
    const fresh = createProjection(390, 300, settings);
    assert.deepEqual(projection.camera.projectionMatrix.elements, fresh.camera.projectionMatrix.elements);
  }
});
