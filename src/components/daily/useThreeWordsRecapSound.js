import React from "react";
import AssetManager from "../../assets/assetManager.js";
import { resolveSoundSettings } from "../../audio/equalizer.js";
import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { getThreeWordsRecapSound } from "./threeWordsRecapSound.js";

export default function useThreeWordsRecapSound() {
  const preferences = useFeatureRuntime("preferences");
  return React.useCallback(entry => {
    const sound = getThreeWordsRecapSound(entry, preferences.store.getState());
    if (!sound) return;
    const settings = resolveSoundSettings(sound.eqKey);
    AssetManager.playSfx(sound.key, {
      eqKey: sound.eqKey, gain: settings.volume ?? 1,
      rate: (settings.pitch ?? 1) * (settings.stretch ?? 1),
      // A verdict sound should not be queued and played after the recap closes.
      allowQueue: false,
    });
  }, [preferences]);
}
