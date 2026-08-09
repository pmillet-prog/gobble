import test from "node:test";
import assert from "node:assert/strict";

import {
  PODIUM_TYPOGRAPHY_STORAGE_KEY,
  applyPodiumTypographySettings,
  loadPodiumTypographySettings,
  normalizePodiumTypographySettings,
  savePodiumTypographySettings,
} from "./podiumTypographySettings.js";

test("podium typography settings clamp RGB and alpha values", () => {
  const settings = normalizePodiumTypographySettings({
    gold: {
      base: { r: 300, g: -20, b: 12.6 },
      shadow: { r: 1, g: 2, b: 3, a: 4 },
      reflection: { r: 4, g: 5, b: 6, a: -1 },
      reliefOffsetX: -9,
      reliefOffset: 9,
      halo: { r: 7, g: 8, b: 9, a: 2 },
      haloBlur: -3,
    },
  });

  assert.deepEqual(settings.gold.base, { r: 255, g: 0, b: 13 });
  assert.deepEqual(settings.gold.shadow, { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(settings.gold.reflection, { r: 4, g: 5, b: 6, a: 0 });
  assert.equal(settings.gold.reliefOffsetX, -5);
  assert.equal(settings.gold.reliefOffset, 5);
  assert.deepEqual(settings.gold.halo, { r: 7, g: 8, b: 9, a: 1 });
  assert.equal(settings.gold.haloBlur, 0);
  assert.equal(settings.silver.base.r, 148);
});

test("podium typography settings persist and expose CSS variables", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const properties = new Map();
  const root = {
    style: {
      setProperty: (key, value) => properties.set(key, value),
    },
  };

  const saved = savePodiumTypographySettings(
    {
      gold: {
        base: { r: 10, g: 20, b: 30 },
        shadow: { r: 40, g: 50, b: 60, a: 0.4 },
        reflection: { r: 70, g: 80, b: 90, a: 0.8 },
      },
    },
    storage
  );
  const loaded = loadPodiumTypographySettings(storage);
  applyPodiumTypographySettings(loaded, root);

  assert.ok(values.has(PODIUM_TYPOGRAPHY_STORAGE_KEY));
  assert.deepEqual(loaded.gold, saved.gold);
  assert.equal(properties.get("--podium-gold-base-rgb"), "10 20 30");
  assert.equal(properties.get("--podium-gold-shadow-alpha"), "0.4");
  assert.equal(properties.get("--podium-gold-reflection-rgb"), "70 80 90");
  assert.equal(properties.get("--podium-gold-reflection-alpha"), "0.8");
  assert.equal(properties.get("--podium-gold-relief-offset-x"), "0.75px");
  assert.equal(properties.get("--podium-gold-relief-offset"), "2px");
  assert.equal(properties.get("--podium-gold-halo-rgb"), "255 196 0");
  assert.equal(properties.get("--podium-gold-halo-alpha"), "0.18");
  assert.equal(properties.get("--podium-gold-halo-blur"), "3px");
});
