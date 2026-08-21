import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "./createApplicationKernel.js";

test("application kernel owns boot lifecycle without React", () => {
  const initialTracks = [{ id: "initial" }];
  const resolvedTracks = [{ id: "resolved" }];
  const kernel = createApplicationKernel({ ambientTracks: initialTracks });
  let notifications = 0;
  const unsubscribe = kernel.subscribe(() => {
    notifications += 1;
  });

  assert.deepEqual(kernel.getState().boot, {
    ambientTracks: initialTracks,
    overlayVisible: true,
    ready: false,
  });

  kernel.commands.boot.resolveAmbientTracks(resolvedTracks);
  kernel.commands.boot.setReady();
  kernel.commands.boot.setOverlayVisible(false);

  assert.deepEqual(kernel.getState().boot, {
    ambientTracks: resolvedTracks,
    overlayVisible: false,
    ready: true,
  });
  assert.equal(notifications, 3);
  unsubscribe();
});

test("application navigation rejects unknown views and keeps history", () => {
  const kernel = createApplicationKernel();

  kernel.commands.navigation.go("daily");
  kernel.commands.navigation.go("not-a-view");

  assert.deepEqual(kernel.getState().navigation, {
    previousView: "home",
    view: "daily",
  });
});
