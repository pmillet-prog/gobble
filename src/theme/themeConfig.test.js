import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_THEME_PRESET,
  coerceThemeToLegacyNativeDefault,
  getThemeUnlockItemKey,
  normalizeThemePreset,
  normalizeThemeUnlocks,
  normalizeTileLetterScale,
} from "./themeConfig.js";

test("theme letter scale is clamped and falls back to the configured default", () => {
  assert.equal(normalizeTileLetterScale(0.2), 0.8);
  assert.equal(normalizeTileLetterScale(9), 1.45);
  assert.equal(normalizeTileLetterScale("1.3"), 1.3);
  assert.equal(normalizeTileLetterScale("invalid", 1.1), 1.1);
});

test("legacy theme values migrate without changing the selected visual intent", () => {
  const normalized = normalizeThemePreset({
    material: "wood",
    font: "script",
    letterScale: 1.35,
  });

  assert.equal(normalized.tileColor, "wood");
  assert.equal(normalized.material, "native");
  assert.equal(normalized.font, "draft");
  assert.equal(normalized.letterScale, 1.35);
});

test("legacy category unlocks become option-scoped unlocks", () => {
  const unlocks = normalizeThemeUnlocks(
    { tileColor: true, items: { "font:rounded": true, "unknown:value": true } },
    { tileColor: "ocean" }
  );

  assert.deepEqual(unlocks, {
    [getThemeUnlockItemKey("tileColor", "ocean")]: true,
    [getThemeUnlockItemKey("font", "rounded")]: true,
  });
});

test("locked selections fall back while explicitly unlocked selections remain active", () => {
  const selected = { ...DEFAULT_THEME_PRESET, tileColor: "ocean", font: "rounded" };
  const withoutUnlocks = coerceThemeToLegacyNativeDefault(selected, {});
  const withUnlock = coerceThemeToLegacyNativeDefault(selected, {
    items: { "tileColor:ocean": true },
  });

  assert.equal(withoutUnlocks.tileColor, DEFAULT_THEME_PRESET.tileColor);
  assert.equal(withoutUnlocks.font, DEFAULT_THEME_PRESET.font);
  assert.equal(withUnlock.tileColor, "ocean");
  assert.equal(withUnlock.font, DEFAULT_THEME_PRESET.font);
});
