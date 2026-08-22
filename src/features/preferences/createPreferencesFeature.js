import AssetManager from "../../assets/assetManager.js";
import {
  SOUND_MASTER_VOLUME_DEFAULT,
  normalizeSoundMasterVolume,
} from "../../audio/audioPreferences.js";
import {
  CHAT_DESKTOP_FONT_SCALE_DEFAULT,
  CHAT_DESKTOP_FONT_SCALE_MAX,
  CHAT_DESKTOP_FONT_SCALE_MIN,
  CHAT_DESKTOP_FONT_SCALE_STEP,
} from "../../components/chat/chatPresentationConfig.js";
import { clearCelebrationFlash } from "../../components/celebrationFxStore.js";
import { computePreferLiteVisualEffects } from "../../app/adapters/deviceCapabilities.js";
import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import {
  DEFAULT_THEME_PRESET,
  THEME_UNLOCK_COST_DEFAULT,
  coerceThemeToLegacyNativeDefault,
  normalizeThemePreset,
  normalizeThemeUnlocks,
} from "../../theme/themeConfig.js";

export const SETTINGS_STORAGE_KEY = "gobble_settings_v1";

const PERSISTED_PREFERENCE_FIELDS = Object.freeze([
  "chatDesktopFontScale",
  "isAmbientMuted",
  "isSfxMuted",
  "isVibrationEnabled",
  "keyboardRecallSubmittedWord",
  "soundGobbleEnabled",
  "soundInvalidErrorEnabled",
  "soundMasterVolume",
  "soundTileStepEnabled",
  "soundTimerEnabled",
  "soundValidationEnabled",
  "themeApplied",
  "themeUnlocks",
  "tilePointsVisible",
  "visualConfettiEnabled",
  "visualGobbleEnabled",
  "visualGoldNickFxEnabled",
  "visualInvalidWordsEnabled",
  "visualPraiseEnabled",
  "visualScoreFlightsEnabled",
  "visualScreenShakeEnabled",
]);

export function normalizeChatDesktopFontScale(
  raw,
  fallback = CHAT_DESKTOP_FONT_SCALE_DEFAULT
) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const clamped = Math.max(
    CHAT_DESKTOP_FONT_SCALE_MIN,
    Math.min(CHAT_DESKTOP_FONT_SCALE_MAX, value)
  );
  return (
    Math.round(clamped / CHAT_DESKTOP_FONT_SCALE_STEP) *
    CHAT_DESKTOP_FONT_SCALE_STEP
  );
}

export function readStoredPreferences(storage = globalThis.localStorage) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

function resolveInitialTheme(settings, media = globalThis.matchMedia?.bind(globalThis)) {
  const source = {
    ...DEFAULT_THEME_PRESET,
    ...(settings.theme && typeof settings.theme === "object" ? settings.theme : {}),
    darkMode:
      typeof settings.darkMode === "boolean"
        ? settings.darkMode
        : media
        ? !!media("(prefers-color-scheme: dark)").matches
        : DEFAULT_THEME_PRESET.darkMode,
    font: settings.tileLetterFont || undefined,
    letterScale: settings.tileLetterScale || undefined,
    letterColor: settings.tileLetterColor || undefined,
    uiContrast: settings.uiContrast || undefined,
    tileColor: settings.tileColor || undefined,
    background: settings.backgroundTheme || undefined,
    material: settings.tileMaterial || undefined,
    specialIndicator: settings.specialIndicator || undefined,
  };
  const unlocks = normalizeThemeUnlocks(settings.themeUnlocks, source);
  return {
    preset: coerceThemeToLegacyNativeDefault(source, unlocks),
    unlocks,
  };
}

export function createInitialPreferencesState(options = {}) {
  const settings = options.settings || readStoredPreferences(options.storage);
  const legacySfxEnabled =
    typeof settings.sfxMuted === "boolean" ? !settings.sfxMuted : true;
  const soundValidationEnabled =
    typeof settings.soundValidationEnabled === "boolean"
      ? settings.soundValidationEnabled
      : legacySfxEnabled;
  const soundTileStepEnabled =
    typeof settings.soundTileStepEnabled === "boolean"
      ? settings.soundTileStepEnabled
      : legacySfxEnabled;
  const soundTimerEnabled =
    typeof settings.soundTimerEnabled === "boolean"
      ? settings.soundTimerEnabled
      : legacySfxEnabled;
  const soundGobbleEnabled =
    typeof settings.soundGobbleEnabled === "boolean"
      ? settings.soundGobbleEnabled
      : legacySfxEnabled;
  const soundInvalidErrorEnabled =
    typeof settings.soundInvalidErrorEnabled === "boolean"
      ? settings.soundInvalidErrorEnabled
      : soundValidationEnabled;
  const theme = resolveInitialTheme(settings, options.matchMedia);
  const isSfxMuted = !(
    soundValidationEnabled ||
    soundTileStepEnabled ||
    soundTimerEnabled ||
    soundGobbleEnabled ||
    soundInvalidErrorEnabled
  );

  return Object.freeze({
    canVibrate: false,
    chatDesktopFontScale: normalizeChatDesktopFontScale(
      settings.chatDesktopFontScale,
      CHAT_DESKTOP_FONT_SCALE_DEFAULT
    ),
    gobblarsBalance: 0,
    isAmbientMuted:
      typeof settings.soundAmbientEnabled === "boolean"
        ? !settings.soundAmbientEnabled
        : typeof settings.ambientMuted === "boolean"
        ? settings.ambientMuted
        : false,
    isSfxMuted,
    isVibrationEnabled:
      typeof settings.vibration === "boolean" ? settings.vibration : true,
    keyboardRecallSubmittedWord:
      typeof settings.keyboardRecallSubmittedWord === "boolean"
        ? settings.keyboardRecallSubmittedWord
        : false,
    preferLiteVisualEffects: computePreferLiteVisualEffects(),
    soundGobbleEnabled,
    soundInvalidErrorEnabled,
    soundMasterVolume: normalizeSoundMasterVolume(
      settings.soundMasterVolume,
      SOUND_MASTER_VOLUME_DEFAULT
    ),
    soundTileStepEnabled,
    soundTimerEnabled,
    soundValidationEnabled,
    themeApplied: theme.preset,
    themeApplying: false,
    themeDraft: theme.preset,
    themeLastChangedCategory: "tileColor",
    themeLoading: false,
    themeMenuOpen: false,
    themePickerCategory: "",
    themePurchaseConfirm: null,
    themeRecentlyUnlocked: [],
    themeUnlockAnimToken: 0,
    themeUnlockCost: THEME_UNLOCK_COST_DEFAULT,
    themeUnlocks: theme.unlocks,
    themeVisual: theme.preset,
    tilePointsVisible:
      typeof settings.tilePointsVisible === "boolean"
        ? settings.tilePointsVisible
        : true,
    visualConfettiEnabled:
      typeof settings.visualConfettiEnabled === "boolean"
        ? settings.visualConfettiEnabled
        : true,
    visualGobbleEnabled:
      typeof settings.visualGobbleEnabled === "boolean"
        ? settings.visualGobbleEnabled
        : true,
    visualGoldNickFxEnabled:
      typeof settings.visualGoldNickFxEnabled === "boolean"
        ? settings.visualGoldNickFxEnabled
        : true,
    visualInvalidWordsEnabled:
      typeof settings.visualInvalidWordsEnabled === "boolean"
        ? settings.visualInvalidWordsEnabled
        : true,
    visualPraiseEnabled:
      typeof settings.visualPraiseEnabled === "boolean"
        ? settings.visualPraiseEnabled
        : true,
    visualScoreFlightsEnabled:
      typeof settings.visualScoreFlightsEnabled === "boolean"
        ? settings.visualScoreFlightsEnabled
        : true,
    visualScreenShakeEnabled:
      typeof settings.visualScreenShakeEnabled === "boolean"
        ? settings.visualScreenShakeEnabled
        : true,
  });
}

function getPersistedPreferences(state) {
  const theme = normalizeThemePreset(state.themeApplied);
  return {
    ambientMuted: state.isAmbientMuted,
    backgroundTheme: theme.background,
    chatDesktopFontScale: normalizeChatDesktopFontScale(
      state.chatDesktopFontScale,
      CHAT_DESKTOP_FONT_SCALE_DEFAULT
    ),
    darkMode: !!theme.darkMode,
    keyboardRecallSubmittedWord: state.keyboardRecallSubmittedWord,
    sfxMuted: state.isSfxMuted,
    soundAmbientEnabled: !state.isAmbientMuted,
    soundGobbleEnabled: state.soundGobbleEnabled,
    soundInvalidErrorEnabled: state.soundInvalidErrorEnabled,
    soundMasterVolume: normalizeSoundMasterVolume(
      state.soundMasterVolume,
      SOUND_MASTER_VOLUME_DEFAULT
    ),
    soundTileStepEnabled: state.soundTileStepEnabled,
    soundTimerEnabled: state.soundTimerEnabled,
    soundValidationEnabled: state.soundValidationEnabled,
    specialIndicator: theme.specialIndicator,
    theme,
    themeUnlocks: state.themeUnlocks,
    tileColor: theme.tileColor,
    tileLetterColor: theme.letterColor,
    tileLetterFont: theme.font,
    tileLetterScale: theme.letterScale,
    tileMaterial: theme.material,
    tilePointsVisible: state.tilePointsVisible,
    uiContrast: theme.uiContrast,
    vibration: state.isVibrationEnabled,
    visualConfettiEnabled: state.visualConfettiEnabled,
    visualGobbleEnabled: state.visualGobbleEnabled,
    visualGoldNickFxEnabled: state.visualGoldNickFxEnabled,
    visualInvalidWordsEnabled: state.visualInvalidWordsEnabled,
    visualPraiseEnabled: state.visualPraiseEnabled,
    visualScoreFlightsEnabled: state.visualScoreFlightsEnabled,
    visualScreenShakeEnabled: state.visualScreenShakeEnabled,
  };
}

export function createPreferencesFeature({ scope }, options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const documentRoot = options.documentRoot || globalThis.document?.documentElement;
  const store = createFeatureStore(
    createInitialPreferencesState({
      matchMedia: options.matchMedia,
      settings: options.settings,
      storage,
    })
  );
  let previous = store.getState();

  function applyTheme(rawTheme, { syncDraft = false } = {}) {
    const theme = normalizeThemePreset(rawTheme);
    store.patch({
      themeApplied: theme,
      themeVisual: theme,
      ...(syncDraft ? { themeDraft: theme } : {}),
    });
    return theme;
  }

  function previewTheme(rawTheme) {
    const theme = normalizeThemePreset(rawTheme);
    store.set("themeVisual", theme);
    return theme;
  }

  function patch(rawPatch) {
    const nextPatch = { ...rawPatch };
    const soundFields = [
      "soundValidationEnabled",
      "soundTileStepEnabled",
      "soundTimerEnabled",
      "soundGobbleEnabled",
      "soundInvalidErrorEnabled",
    ];
    if (soundFields.some((field) => Object.hasOwn(nextPatch, field))) {
      const current = store.getState();
      const resolved = Object.fromEntries(
        soundFields.map((field) => [
          field,
          typeof nextPatch[field] === "function"
            ? nextPatch[field](current[field])
            : Object.hasOwn(nextPatch, field)
            ? nextPatch[field]
            : current[field],
        ])
      );
      Object.assign(nextPatch, resolved, {
        isSfxMuted: !soundFields.some((field) => !!resolved[field]),
      });
    }
    return store.patch(nextPatch);
  }

  function set(field, nextOrUpdater) {
    return patch({ [field]: nextOrUpdater });
  }

  function start() {
    const applyExternalState = () => {
      const state = store.getState();
      if (state.isSfxMuted !== previous.isSfxMuted) {
        AssetManager.setMuted(state.isSfxMuted);
      }
      if (state.visualGoldNickFxEnabled !== previous.visualGoldNickFxEnabled) {
        documentRoot?.classList?.toggle(
          "gold-nick-fx-enabled",
          state.visualGoldNickFxEnabled
        );
      }
      if (previous.visualGobbleEnabled && !state.visualGobbleEnabled) {
        clearCelebrationFlash("gobbleFlash");
      }
      if (previous.visualPraiseEnabled && !state.visualPraiseEnabled) {
        clearCelebrationFlash("praiseFlash");
      }
      const shouldPersist = PERSISTED_PREFERENCE_FIELDS.some(
        (field) => !Object.is(state[field], previous[field])
      );
      if (shouldPersist) {
        try {
          storage?.setItem(
            SETTINGS_STORAGE_KEY,
            JSON.stringify(getPersistedPreferences(state))
          );
        } catch (_) {}
      }
      previous = state;
    };
    AssetManager.setMuted(previous.isSfxMuted);
    documentRoot?.classList?.toggle(
      "gold-nick-fx-enabled",
      previous.visualGoldNickFxEnabled
    );
    scope.add(store.subscribe(applyExternalState));
    scope.add(() => documentRoot?.classList?.remove("gold-nick-fx-enabled"));
  }

  return Object.freeze({
    applyTheme,
    patch,
    previewTheme,
    set,
    start,
    store,
  });
}
