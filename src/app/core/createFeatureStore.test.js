import test from "node:test";
import assert from "node:assert/strict";

import { createFeatureStore } from "./createFeatureStore.js";

test("feature stores update atomically and support updater functions", () => {
  const store = createFeatureStore({ count: 1, open: false });
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });

  store.patch({ count: (count) => count + 1, open: true });

  assert.deepEqual(store.getState(), { count: 2, open: true });
  assert.equal(notifications, 1);
});

test("feature stores do not notify for identity updates", () => {
  const store = createFeatureStore({ value: "same" });
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });

  store.set("value", "same");

  assert.equal(notifications, 0);
});
