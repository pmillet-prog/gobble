import test from "node:test";
import assert from "node:assert/strict";

import { createResourceScope } from "../../app/core/createResourceScope.js";
import {
  SETTINGS_STORAGE_KEY,
  createInitialPreferencesState,
  createPreferencesFeature,
} from "./createPreferencesFeature.js";

test("preferences preserve legacy defaults and deliberate stored choices", () => {
  const state = createInitialPreferencesState({
    matchMedia: () => ({ matches: false }),
    settings: {
      soundValidationEnabled: false,
      soundTileStepEnabled: false,
      soundTimerEnabled: false,
      soundGobbleEnabled: false,
      soundInvalidErrorEnabled: false,
      tilePointsVisible: false,
      vibration: false,
    },
  });

  assert.equal(state.isSfxMuted, true);
  assert.equal(state.isAmbientMuted, false);
  assert.equal(state.tilePointsVisible, false);
  assert.equal(state.isVibrationEnabled, false);
});

test("preferences feature owns persistence and derived mute state", () => {
  const writes = [];
  const storage = {
    getItem: () => null,
    setItem: (key, value) => writes.push([key, JSON.parse(value)]),
  };
  const scope = createResourceScope("preferences-test");
  const feature = createPreferencesFeature(
    { scope },
    {
      documentRoot: { classList: { remove() {}, toggle() {} } },
      matchMedia: () => ({ matches: false }),
      storage,
    }
  );
  assert.equal(feature.refs.isSfxMuted.current, false);
  feature.start();
  feature.patch({
    soundValidationEnabled: false,
    soundTileStepEnabled: false,
    soundTimerEnabled: false,
    soundGobbleEnabled: false,
    soundInvalidErrorEnabled: false,
  });

  assert.equal(feature.store.getState().isSfxMuted, true);
  assert.equal(feature.refs.isSfxMuted.current, true);
  feature.set("visualConfettiEnabled", false);
  assert.equal(feature.refs.visualConfettiEnabled.current, false);
  assert.equal(writes.at(-1)[0], SETTINGS_STORAGE_KEY);
  assert.equal(writes.at(-1)[1].sfxMuted, true);
  scope.dispose();
});
