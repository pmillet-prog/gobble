import AssetManager from "../../../assets/assetManager.js";
import { IMAGE_KEYS } from "../../../assets/assetKeys.js";

const praiseAssets = {
  epic: ["epique", 0xf472b6, .55], bonus: ["bonus", 0xfbbf24, .58],
  gold: ["enorme", 0xff5c24, .55], purple: ["fabuleux", 0xa855f7, .55],
  blue: ["excellent", 0x22c55e, .55],
};
export const BIGWORD_URLS = Object.freeze(Object.fromEntries(
  Object.entries(IMAGE_KEYS.bigwords).map(([name, key]) => [key, `/bigwords/${name.toLowerCase()}.webp`])
));

export function celebrationItems(snapshot, { isMobileLayout: mobile = false, liteVisualEffects: lite = false } = {}) {
  return ["gobbleFlash", "praiseFlash"].flatMap(slot => {
    const flash = snapshot[slot];
    if (!flash) return [];
    const type = slot === "gobbleFlash" ? "gobble" : "praise";
    const praise = praiseAssets[flash.kind];
    const key = type === "gobble" ? IMAGE_KEYS.bigwords[flash.kind === "doubleGobble" ? "doubleGobble" : "gobble"]
      : IMAGE_KEYS.bigwords[praise?.[0]];
    const duration = type === "gobble" ? Math.max(lite ? 650 : 1600, Math.min(lite ? 1200 : 3400, flash.durationMs || 2200))
      : Math.max(lite ? 560 : 1200, Math.min(flash.kind === "bonus" ? (lite ? 2600 : 5600) : lite ? 1200 : 3400, flash.durationMs || 1500));
    return [{ slot, id: flash.id, type, key, duration,
      size: type === "gobble" ? (mobile ? (lite ? 210 : 295) : lite ? 280 : 385)
        : (mobile ? (lite ? 160 : 220) : lite ? 220 : 300),
      dx: Math.round(flash.dx || 0), dy: Math.round(flash.dy || 0), scale: flash.scale || 1.6,
      ring: !lite, ringInset: mobile ? 10 : 14, ringWidth: mobile ? 10 : 14, ringRadius: mobile ? 18 : 24,
      ringColor: type === "gobble" ? 0xffc840 : praise?.[1] || 0,
      ringOpacity: type === "gobble" ? .55 : praise?.[2] || 0,
    }];
  });
}

export function bigwordUrl(key) {
  return AssetManager.getImage(key).url || BIGWORD_URLS[key];
}
