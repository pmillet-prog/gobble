import React from "react";
import AssetManager from "../../assets/assetManager.js";
import { SFX_KEYS } from "../../assets/assetKeys.js";
import { GOBBLARS_REWARD_SOUND_URL, GOBBLARS_SPEND_SOUND_URL } from "../../audio/audioAssets.js";
import { resolveSoundSettings } from "../../audio/equalizer.js";
import { scheduleGobblarsRewardSound } from "./gobblarsRewardSoundCue.js";

export function prepareGobblarsRewardSound(spent = false) {
  const eqKey = spent ? "cashRegister" : "vocabCling";
  const key = SFX_KEYS[eqKey];
  AssetManager.registerManifest([{ key, type: "sfx", candidates: [spent ? GOBBLARS_SPEND_SOUND_URL : GOBBLARS_REWARD_SOUND_URL], priority: "high", meta: { eqKey } }]);
  return AssetManager.preload({ keys: [key] });
}

export default function useGobblarsRewardSound(reward, enabled) {
  React.useEffect(() => {
    if (!enabled) return;
    const spent = reward.amount < 0;
    const eqKey = spent ? "cashRegister" : "vocabCling";
    void prepareGobblarsRewardSound(spent).catch(() => {});
    const cancel = scheduleGobblarsRewardSound(reward, {
      visible: () => document.visibilityState !== "hidden",
      play: () => AssetManager.playSfx(SFX_KEYS[eqKey], {
        eqKey, gain: resolveSoundSettings(eqKey).volume, rate: 1, allowQueue: false,
      }),
    });
    const visibility = () => { if (document.visibilityState === "hidden") cancel(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { cancel(); document.removeEventListener("visibilitychange", visibility); };
  }, [reward, enabled]);
}
