import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import { createNotificationsFeature } from "./createNotificationsFeature.js";

test("notification satellite owns toast expiry timers and clears them on dispose", () => {
  const scheduled = new Map();
  let nextTimerId = 1;
  const scope = createResourceScope("notifications-test");
  const feature = createNotificationsFeature(
    { scope },
    {
      clearTimeoutFn: (id) => scheduled.delete(id),
      setTimeoutFn: (callback) => {
        const id = nextTimerId++;
        scheduled.set(id, callback);
        return id;
      },
    }
  );
  feature.start();
  const toast = feature.show("Test", 2000, { position: "top-left" });
  assert.equal(feature.store.getState().toasts.length, 1);
  assert.equal(toast.position, "top-left");
  assert.equal(scheduled.size, 1);
  scope.dispose();
  assert.equal(feature.store.getState().toasts.length, 0);
  assert.equal(scheduled.size, 0);
});
