import test from "node:test";
import assert from "node:assert/strict";
import { getNativeHost, getOrientationPort } from "./nativeHost.js";
import { createScreenOrientationController } from "../layout/screenOrientation.js";

test("ordinary web and TWA clients keep the browser orientation API", () => {
  const orientation = {};
  for (const windowObject of [{}, { GobbleNative: {} }, { GobbleNative: { protocol: 2, ownsAssets: true } }]) {
    assert.equal(getNativeHost(windowObject), null);
    assert.equal(getOrientationPort({ windowObject, orientation }), orientation);
  }
});

test("hybrid delegates orientation to Android without requesting fullscreen or browser locks", async () => {
  const calls = [];
  const document = new EventTarget(), windowObject = new EventTarget(), orientation = new EventTarget();
  orientation.type = "portrait-primary";
  orientation.lock = () => { throw new Error("Browser API must not be used"); };
  windowObject.GobbleNative = { protocol: 1, ownsAssets: true, setOrientation: async mode => { calls.push(mode); } };
  const controller = createScreenOrientationController({ orientation: getOrientationPort({ windowObject, orientation }), document, window: windowObject });
  controller.setMode("portrait"); controller.start(); await Promise.resolve();
  controller.setMode("any"); await Promise.resolve();
  controller.setMode("portrait"); await Promise.resolve();
  controller.stop();
  assert.deepEqual(calls, ["portrait", "any", "portrait"]);
});
