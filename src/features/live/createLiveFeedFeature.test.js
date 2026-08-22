import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "../../app/core/createApplicationKernel.js";
import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createLiveFeedFeature } from "./createLiveFeedFeature.js";

test("live feed owns its bounded content without notifying the application kernel", () => {
  const kernel = createApplicationKernel();
  const scope = createResourceScope("test:live-feed");
  const feature = createLiveFeedFeature({ scope });
  let kernelNotifications = 0;
  const unsubscribeKernel = kernel.subscribe(() => {
    kernelNotifications += 1;
  });

  feature.start();
  feature.setAnnouncements((current) => [
    ...current,
    { id: "announcement-1", text: "Record" },
  ]);
  feature.setLastWords([{ nick: "Tigre", word: "TEST" }]);

  assert.equal(kernelNotifications, 0);
  assert.equal(kernel.getState().realtime.announcements, undefined);
  assert.equal(kernel.getState().game.lastWords, undefined);
  assert.equal(feature.store.getState().announcements.length, 1);
  assert.equal(feature.store.getState().lastWords.length, 1);

  scope.dispose();
  assert.deepEqual(feature.store.getState(), {
    announcements: [],
    lastWords: [],
  });
  unsubscribeKernel();
});
