import AssetManager from "../../assets/assetManager.js";
import { SFX_KEYS } from "../../assets/assetKeys.js";
import { randomIntegerBetween } from "./spriteInterventionAnimation.js";

const PUNCH_KEYS = Object.freeze([
  SFX_KEYS.presenterPunch1, SFX_KEYS.presenterPunch2, SFX_KEYS.presenterPunch3,
  SFX_KEYS.presenterPunch4, SFX_KEYS.presenterPunch5,
]);

export function getPresenterReactionAssets(config) {
  if (config?.reactionUrls) return config.reactionUrls;
  const key = String(config?.key || "").trim();
  return key ? {
    hit1: `/bots/${key}-hit-1.webp`, hit2: `/bots/${key}-hit-2.webp`, stars: `/bots/${key}-stars.webp`,
  } : {};
}

export function playPresenterPunch() {
  AssetManager.playSfx(PUNCH_KEYS[randomIntegerBetween(0, PUNCH_KEYS.length - 1)], {
    cooldownKey: "presenterPunch", cooldownMs: 55, eqKey: "presenterPunch",
  });
}
