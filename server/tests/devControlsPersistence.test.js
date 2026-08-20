import assert from "node:assert/strict";
import test from "node:test";

import { extractPersistedDevControls } from "../devControlsPersistence.js";

test("dev controls are restored from the persisted wrapper after a restart", () => {
  assert.deepEqual(
    extractPersistedDevControls({
      version: 1,
      updatedAt: 123,
      controls: {
        maintenanceMode: true,
        trainingEnabled: false,
      },
    }),
    {
      maintenanceMode: true,
      trainingEnabled: false,
    }
  );
});

test("legacy unwrapped dev controls remain readable", () => {
  const legacy = { maintenanceMode: true, botsEnabled: false };
  assert.deepEqual(extractPersistedDevControls(legacy), legacy);
});

test("invalid persisted dev controls fall back to an empty object", () => {
  assert.deepEqual(extractPersistedDevControls(null), {});
  assert.deepEqual(extractPersistedDevControls([]), {});
});
