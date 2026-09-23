import test from "node:test";
import assert from "node:assert/strict";
import { createScreenOrientationController, isOrientationMobileDevice, resolveScreenOrientationMode } from "./screenOrientation.js";
import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";

function harness(lock = () => Promise.resolve()) {
  const document = new EventTarget(), window = new EventTarget(), orientation = new EventTarget(), calls = [];
  document.visibilityState = "visible"; orientation.type = "portrait-primary";
  orientation.lock = mode => { calls.push(mode); return lock(mode); };
  orientation.unlock = () => calls.push("unlocked");
  const controller = createScreenOrientationController({ orientation, document, window });
  return { controller, orientation, document, window, calls };
}

test("Android phones remain mobile without a wrapper referrer, including a wide landscape viewport", () => {
  const isMobileDevice = isOrientationMobileDevice({ userAgent: "Mozilla/5.0 (Linux; Android 16; SM-F741B) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36" });
  assert.equal(isMobileDevice, true);
  assert.equal(resolveScreenOrientationMode({ isMobileLayout: false, isMobileDevice, allowLandscape: false }), "portrait");
  assert.equal(resolveScreenOrientationMode({ isMobileLayout: false, isMobileDevice, allowLandscape: true }), "any");
  assert.equal(isOrientationMobileDevice({ userAgent: "Macintosh", maxTouchPoints: 5 }), true);
  assert.equal(isOrientationMobileDevice({ userAgent: "Windows NT", maxTouchPoints: 5 }), false);
  assert.equal(resolveScreenOrientationMode({ isMobileLayout: false, allowLandscape: true }), null);
});

test("navigation requests portrait at boot and after leaving the board without an unrestricted interval", () => {
  const { controller, calls } = harness(), kernel = createApplicationKernel();
  const update = () => controller.setMode(resolveScreenOrientationMode({ isMobileDevice: true,
    allowLandscape: kernel.getState().navigation.view === "chalkboard" }));
  const unsubscribe = kernel.subscribe(update); update(); controller.start();
  assert.equal(kernel.getState().boot.ready, false);
  for (const view of ["chalkboard", "home", "chalkboard", "live", "training", "daily", "vault"]) kernel.commands.navigation.go(view);
  assert.deepEqual(calls, ["portrait", "any", "portrait", "any", "portrait"]);
  unsubscribe(); controller.stop(); kernel.dispose();
});

test("portrait is reapplied after foregrounding, fullscreen changes and an OS rotation reset", async () => {
  const { controller, calls, document, window, orientation } = harness();
  controller.setMode("portrait"); controller.start(); await Promise.resolve();
  document.visibilityState = "hidden"; document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls.length, 1);
  document.visibilityState = "visible"; document.dispatchEvent(new Event("visibilitychange"));
  window.dispatchEvent(new Event("focus")); // Coalesce lifecycle events while a request is pending.
  await Promise.resolve();
  document.dispatchEvent(new Event("fullscreenchange")); await Promise.resolve();
  window.dispatchEvent(new Event("pageshow")); await Promise.resolve();
  orientation.type = "landscape-primary"; orientation.dispatchEvent(new Event("change")); await Promise.resolve();
  assert.deepEqual(calls, Array(5).fill("portrait"));
  controller.setMode("any"); await Promise.resolve();
  orientation.dispatchEvent(new Event("change"));
  assert.deepEqual(calls, [...Array(5).fill("portrait"), "any"]);
  controller.stop(); assert.equal(calls.at(-1), "portrait");
});

test("an early refusal is retried on interaction, then successful locks are left alone", async () => {
  let attempts = 0;
  const { controller, calls, document } = harness(() => ++attempts === 1 ? Promise.reject(new Error("SecurityError")) : Promise.resolve());
  controller.setMode("portrait"); controller.start(); await Promise.resolve();
  document.dispatchEvent(new Event("pointerup")); await Promise.resolve();
  document.dispatchEvent(new Event("pointerup")); document.dispatchEvent(new Event("keydown"));
  assert.deepEqual(calls, ["portrait", "portrait"]);
  controller.stop();
});

test("a late board rejection cannot unlock the portrait requested on exit", async () => {
  let reject;
  const { controller, calls } = harness(mode => mode === "any" ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve());
  controller.setMode("any"); controller.start(); controller.setMode("portrait");
  reject(new Error("not_allowed")); await Promise.resolve();
  assert.deepEqual(calls, ["any", "portrait"]); controller.stop();
});

test("cleanup removes listeners and unsupported browsers remain usable", async () => {
  const { controller, calls, document, window, orientation } = harness();
  controller.setMode("portrait"); controller.start(); controller.stop(); await Promise.resolve();
  for (const name of ["visibilitychange", "fullscreenchange", "pointerup", "keydown"]) document.dispatchEvent(new Event(name));
  window.dispatchEvent(new Event("pageshow")); window.dispatchEvent(new Event("focus"));
  orientation.type = "landscape-primary"; orientation.dispatchEvent(new Event("change"));
  assert.deepEqual(calls, ["portrait"]);
  const unsupported = createScreenOrientationController({ orientation: {}, document, window });
  unsupported.setMode("portrait"); unsupported.start(); unsupported.setMode("any"); unsupported.stop();
});
