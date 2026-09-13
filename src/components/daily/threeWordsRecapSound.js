import { SFX_KEYS } from "../../assets/assetKeys.js";

export function getThreeWordsRecapSound(entry, preferences = {}) {
  if (!entry?.word || preferences.isSfxMuted) return null;
  if (entry.valid) {
    return preferences.soundValidationEnabled ? { key: SFX_KEYS.vocabCling, eqKey: "vocabCling" } : null;
  }
  return preferences.soundInvalidErrorEnabled ? { key: SFX_KEYS.invalidWord, eqKey: "invalidWord" } : null;
}
