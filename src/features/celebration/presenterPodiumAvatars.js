import { PIVOT_FRAME_URLS, PIVOT_INTERVENTION_CONFIG } from "../../components/pivot/pivotAnimation.js";
import { ROMEJKO_FRAME_URLS, ROMEJKO_INTERVENTION_CONFIG } from "../../components/romejko/romejkoAnimation.js";
import { LEPERS_FRAME_URLS, LEPERS_INTERVENTION_CONFIG } from "../../components/lepers/lepersAnimation.js";
import { CAPELLO_FRAME_URLS, CAPELLO_INTERVENTION_CONFIG } from "../../components/capello/capelloAnimation.js";
import { resolvePresenterKey } from "../presenters/presenterIdentity.js";

// Common visible bounds for each character's two poses, plus 8px of breathing
// room (alpha > 8). Drawing placement only: source WebP images stay untouched.
const PORTRAITS = {
  pivot: { urls: PIVOT_FRAME_URLS, config: PIVOT_INTERVENTION_CONFIG, bounds: [27, 12, 423, 579] },
  romejko: { urls: ROMEJKO_FRAME_URLS, config: ROMEJKO_INTERVENTION_CONFIG, bounds: [56, 30, 354, 515] },
  lepers: { urls: LEPERS_FRAME_URLS, config: LEPERS_INTERVENTION_CONFIG, bounds: [36, 2, 432, 599] },
  capello: { urls: CAPELLO_FRAME_URLS, config: CAPELLO_INTERVENTION_CONFIG, bounds: [60, 49, 339, 452] },
};

export function getPresenterPodiumAvatar(player) {
  // A human using the same nickname must keep their own custom avatar.
  if (player?.isBot !== true) return null;
  const key = resolvePresenterKey({ ...player, meta: { ...player.meta, presenterKey: player.presenterKey || player.meta?.presenterKey } });
  const portrait = PORTRAITS[key];
  if (!portrait) return null;
  const { config, urls, bounds } = portrait;
  return { key, bounds, poses: {
    neutral: urls[config.neutralFrame],
    happy: urls[config.neutralFrame],
    blink: urls[config.blinkFrame],
  } };
}

export async function preparePresenterPodiumAvatar(actor, portrait, { signal } = {}) {
  const framesByUrl = new Map();
  const [x, y, width, height] = portrait.bounds;
  const scale = Math.min(490 / width, 470 / height);
  for (const pose of actor.previewOnly ? ["happy"] : ["neutral", "happy", "blink"]) {
    signal?.throwIfAborted();
    const url = portrait.poses[pose];
    if (!framesByUrl.has(url)) {
      const image = new Image();
      image.src = url;
      await image.decode();
      signal?.throwIfAborted();
      const canvas = Object.assign(document.createElement("canvas"), { width: 600, height: 600 });
      actor.frames[pose] = canvas;
      // Use the same scale and origin for both poses to avoid reframing on blink.
      canvas.getContext("2d").drawImage(image,
        (600 - width * scale) / 2 - x * scale, 600 - height * scale - y * scale,
        image.naturalWidth * scale, image.naturalHeight * scale);
      framesByUrl.set(url, canvas);
    }
    actor.frames[pose] = framesByUrl.get(url);
  }
}
