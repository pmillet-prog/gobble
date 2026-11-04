import test from "node:test";
import assert from "node:assert/strict";
import { infortuneStageReady, startInfortuneIntro } from "./startInfortuneIntro.js";
import { createCameraTimelinePlayer } from "../../../dev/infortune-perspective/createCameraTimelinePlayer.js";
import { createCameraTimeline, CAMERA_SEQUENCES } from "../../../dev/infortune-perspective/cameraTimeline.js";

test("2D bypasses missing sound and camera loading, but never bypasses wheel readiness/errors", () => {
  const state = { flat: true, stageReady: true, cameraLoaded: false, soundReady: false };
  assert.equal(infortuneStageReady(state), true);
  assert.equal(infortuneStageReady({ ...state, stageReady: false }), false);
  assert.equal(infortuneStageReady({ ...state, renderError: "context lost" }), false);
  assert.equal(infortuneStageReady({ ...state, flat: false }), false);
  assert.equal(infortuneStageReady({ ...state, flat: false, cameraLoaded: true, soundReady: true }), true);
});

test("2D applies the final intro state immediately without scheduling animation or intro audio", () => {
  const frames = []; let requested = 0;
  const player = createCameraTimelinePlayer({ readTimeline: createCameraTimeline, onFrame: (_camera, state) => frames.push(state),
    requestFrame: () => ++requested, cancelFrame() {}, now: () => 0 });
  startInfortuneIntro(player, true);
  assert.deepEqual(frames, [{ sequence: "intro", time: CAMERA_SEQUENCES.intro.duration, playing: false }]);
  assert.equal(requested, 0);
  startInfortuneIntro(player, false);
  assert.deepEqual(player.snapshot(), { sequence: "intro", time: 0, playing: true });
  assert.equal(requested, 1);
  player.dispose();
});
