import test from "node:test";
import assert from "node:assert/strict";

import { createApplicationKernel } from "./core/createApplicationKernel.js";
import {
  CLIENT_FEATURE_NAMES,
  registerClientFeatures,
} from "./registerClientFeatures.js";

test("client features allocate only when acquired and release their runtime state", async () => {
  const kernel = registerClientFeatures(createApplicationKernel(), {
    preferences: {
      documentRoot: { classList: { remove() {}, toggle() {} } },
      matchMedia: () => ({ matches: false }),
      storage: { getItem: () => null, setItem() {} },
    },
  });

  for (const name of CLIENT_FEATURE_NAMES) {
    assert.equal(kernel.features.isActive(name), false);
  }

  const daily = kernel.features.acquire("daily");
  assert.equal(kernel.features.isActive("daily"), true);
  assert.equal(daily.feature.store.getState().section, "overview");
  daily.release();
  await Promise.resolve();
  assert.equal(kernel.features.isActive("daily"), false);
});
