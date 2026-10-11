import { SFX_KEYS } from "../../assets/assetKeys.js";

export function getThreeWordsRecapSound(entry, preferences = {}) {
  if (!entry?.word || preferences.isSfxMuted) return null;
  if (entry.valid) {
    if (entry.gobble && preferences.soundGobbleEnabled) {
      return { key: entry.doubleGobble ? SFX_KEYS.doubleGobbleVoice : SFX_KEYS.gobbleVoice, eqKey: "gobbleVoice" };
    }
    return preferences.soundValidationEnabled ? { key: SFX_KEYS.vocabCling, eqKey: "vocabCling" } : null;
  }
  return preferences.soundInvalidErrorEnabled ? { key: SFX_KEYS.invalidWord, eqKey: "invalidWord" } : null;
}
