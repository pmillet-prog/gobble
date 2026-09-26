import assert from "node:assert/strict";
import test from "node:test";

import { buildPersistedDevControls, extractPersistedDevControls } from "../devControlsPersistence.js";

test("restart restores dev controls but always disables persisted maintenance", () => {
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
      maintenanceMode: false,
      trainingEnabled: false,
    }
  );
});

test("legacy unwrapped controls also restart without maintenance", () => {
  const legacy = { maintenanceMode: true, botsEnabled: false };
  assert.deepEqual(extractPersistedDevControls(legacy), { maintenanceMode: false, botsEnabled: false });
  assert.equal(legacy.maintenanceMode, true);
});

test("saving active maintenance does not carry it over to the next deployment", () => {
  const activeControls = { maintenanceMode: true, botsEnabled: false, trainingEnabled: false };
  const persisted = JSON.parse(JSON.stringify(buildPersistedDevControls(activeControls, 123)));
  assert.equal(persisted.updatedAt, 123);
  assert.equal(persisted.controls.maintenanceMode, false);
  assert.deepEqual(extractPersistedDevControls(persisted), { ...activeControls, maintenanceMode: false });
  assert.equal(activeControls.maintenanceMode, true, "saving must not end the current maintenance");
});

test("invalid persisted dev controls fall back to an empty object", () => {
  assert.deepEqual(extractPersistedDevControls(null), {});
  assert.deepEqual(extractPersistedDevControls([]), {});
});
