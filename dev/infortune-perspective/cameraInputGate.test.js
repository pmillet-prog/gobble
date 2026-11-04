import test from "node:test";
import assert from "node:assert/strict";
import { createCameraInputGate } from "./cameraInputGate.js";
import { createCameraTimelinePlayer } from "./createCameraTimelinePlayer.js";
import { createCameraTimeline } from "./cameraTimeline.js";
import { createWheelController } from "../../src/features/infortune/createWheelController.js";

test("mouse, touch and click launches stay locked through loading, intro and an intro pause", () => {
  let locked = true, now = 0, frame;
  const controller = createWheelController({ inputLocked: true, launchGame: {}, requestFrame: () => 1, cancelFrame() {} });
  const gate = createCameraInputGate(value => { locked = value; controller.setInputLocked(value); });
  const context = { stageReady: false, automatic: true };
  const player = createCameraTimelinePlayer({ readTimeline: createCameraTimeline, now: () => now,
    requestFrame(callback) { frame = callback; return 1; }, cancelFrame() { frame = null; },
    onFrame(camera, state) { gate.update(state, context); },
  });
  player.seek("intro", 0);
  assert.equal(controller.beginDrag(0), false); assert.equal(controller.clickLaunch(), false);
  context.stageReady = true; player.play("intro", { from: 0 });
  now = 4999; frame(now);
  assert.equal(locked, true); assert.equal(controller.beginDrag(0), false); assert.equal(controller.clickLaunch(), false);
  player.pause(); assert.equal(locked, true);
  player.play(); now = 5000; frame(now);
  assert.equal(locked, false); assert.equal(controller.beginDrag(0), true);
  controller.cancelGesture(); assert.equal(controller.clickLaunch(), true);
  // Starting another intro cancels any gesture already in preparation.
  gate.begin(); assert.equal(locked, true); assert.equal(controller.clickLaunch(), false);
  assert.equal(controller.endDrag(), false);
  player.dispose(); controller.dispose();
});

test("scrubbing does not bypass an unfinished intro; switching automatic direction off explicitly does", () => {
  let locked;
  const gate = createCameraInputGate(value => { locked = value; });
  const context = { stageReady: true, automatic: true };
  gate.update({ sequence: "intro", time: 2, playing: false }, context); assert.equal(locked, true);
  gate.update({ sequence: "launch", time: 0, playing: false }, context); assert.equal(locked, true);
  gate.update(null, { ...context, automatic: false }); assert.equal(locked, false);
  gate.update({ sequence: "intro", time: 5, playing: false }, context); assert.equal(locked, false);
  gate.update(null, { ...context, stageReady: false }); assert.equal(locked, true);
});

test("the original charge control also respects the shared lock", () => {
  const controller = createWheelController({ inputLocked: true, requestFrame: () => 1, cancelFrame() {} });
  assert.equal(controller.beginCharge(), false);
  controller.setInputLocked(false); assert.equal(controller.beginCharge(), true);
  controller.setInputLocked(true); assert.equal(controller.endCharge(), false);
  controller.dispose();
});
