import { normalizeAvatar } from "./avatarConfiguration.js";

export const AVATAR_ASSET_RENDER_VERSION = 1;
export const AVATAR_ASSET_VARIANTS = Object.freeze({
  face: { view: "face", size: 256, expression: "neutral" },
  face_happy: { view: "face", size: 256, expression: "happy" },
  portrait: { view: "portrait", size: 600, expression: "neutral" },
  portrait_happy: { view: "portrait", size: 600, expression: "happy" },
  stage_neutral: { view: "portrait", size: 600, expression: "neutral", transparent: true, portraitOffsetY: 0 },
  stage_happy: { view: "portrait", size: 600, expression: "happy", transparent: true, portraitOffsetY: 0 },
  stage_blink: { view: "portrait", size: 600, expression: "happy", blink: true, transparent: true, portraitOffsetY: 0 },
});

// Excludes transport metadata, but includes every saved appearance setting.
// An edited draft or an expired aura cannot reuse an image of the old outfit.
export const avatarAssetSignature = avatar => JSON.stringify(normalizeAvatar(avatar));

export function savedAvatarVariant(avatar, { view = "face", expression = "neutral", blink = false,
  transparent = false, portraitOffsetY } = {}) {
  const assets = avatar?.renderedAssets;
  if (!assets || assets.version !== AVATAR_ASSET_RENDER_VERSION
    || !Number.isSafeInteger(assets.userId) || assets.userId < 1
    || !Number.isSafeInteger(assets.revision) || assets.revision < 1
    || assets.signature !== avatarAssetSignature(avatar)) return null;
  const stage = transparent && view === "portrait" && portraitOffsetY === 0;
  if ((!stage && (transparent || blink || portraitOffsetY !== undefined))
    || !["neutral", "happy"].includes(expression) || !["face", "portrait"].includes(view)) return null;
  const kind = stage ? `stage_${blink ? "blink" : expression}` : `${view}${expression === "happy" ? "_happy" : ""}`;
  const frame = assets.frames?.[kind];
  return frame ? { ...frame, kind, tag: assets.tag, companion: assets.companion,
    url: `/api/auth/avatars/${assets.userId}/render/${assets.revision}/${assets.version}/${kind}.png` } : null;
}
