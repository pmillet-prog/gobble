import AssetManager from "../../assets/assetManager.js";
import { IMAGE_FALLBACKS } from "../../assets/bootAssetManifest.js";

export function getStatsImageUrl(key) {
  return key ? AssetManager.getImage(key).url || IMAGE_FALLBACKS.get(key) || "" : "";
}

export function getStatsProfileUserId(target = {}) {
  const positiveId = (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  const playerKey = String(target.playerKey || "");
  return positiveId(target.userId) || positiveId(target.installId) ||
    (playerKey.startsWith("install:") ? positiveId(playerKey.slice(8)) : null);
}
