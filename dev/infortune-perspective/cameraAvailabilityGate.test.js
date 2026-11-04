import test from "node:test";
import assert from "node:assert/strict";
import { createCameraAvailabilityGate } from "./cameraAvailabilityGate.js";
test("renderer replacement pauses an intro and resumes at exactly the same time, including a hidden tab", () => {
  const gate = createCameraAvailabilityGate();
  let state = { sequence: "intro", time: 3.2, playing: true }, plays = 0;
  const player = { snapshot: () => ({ ...state }), pause() { state.playing = false; }, play() { state.playing = true; plays++; } };
  gate.update(player, false); gate.update(player, false);
  assert.equal(state.playing, false);
  gate.update(player, true); gate.update(player, true);
  assert.deepEqual(state, { sequence: "intro", time: 3.2, playing: true }); assert.equal(plays, 1);
  gate.update(player, false); state = { sequence: "results", time: 0, playing: false };
  gate.update(player, true); assert.equal(state.playing, false); assert.equal(plays, 1);
});
