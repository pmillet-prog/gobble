import { PIVOT_FRAME_URLS, PIVOT_INTERVENTION_CONFIG } from "../../components/pivot/pivotAnimation.js";
import { BAFOUILLE_FRAME_URLS, BAFOUILLE_INTERVENTION_CONFIG } from "../../components/bafouille/bafouilleAnimation.js";
import { ROMEJKO_FRAME_URLS, ROMEJKO_INTERVENTION_CONFIG } from "../../components/romejko/romejkoAnimation.js";
import { LEPERS_FRAME_URLS, LEPERS_INTERVENTION_CONFIG } from "../../components/lepers/lepersAnimation.js";
import { CAPELLO_FRAME_URLS, CAPELLO_INTERVENTION_CONFIG } from "../../components/capello/capelloAnimation.js";
import { resolvePresenterKey } from "../presenters/presenterIdentity.js";

// Common visible bounds for each character's two poses, plus 8px of breathing
// room (alpha > 8). Drawing placement only: source WebP images stay untouched.
const PORTRAITS = {
  pivot: { urls: PIVOT_FRAME_URLS, config: PIVOT_INTERVENTION_CONFIG, bounds: [27, 12, 423, 579], reactionBottoms: { hit1: 592, hit2: 581, stars: 575 } },
  bafouille: { urls: BAFOUILLE_FRAME_URLS, config: BAFOUILLE_INTERVENTION_CONFIG, bounds: [68, 47, 364, 525], reactionBottoms: { hit1: 580, hit2: 580, stars: 580 } },
  romejko: { urls: ROMEJKO_FRAME_URLS, config: ROMEJKO_INTERVENTION_CONFIG, bounds: [56, 30, 354, 515], reactionBottoms: { hit1: 558, hit2: 587, stars: 569 } },
  lepers: { urls: LEPERS_FRAME_URLS, config: LEPERS_INTERVENTION_CONFIG, bounds: [36, 2, 432, 599], reactionBottoms: { hit1: 572, hit2: 572, stars: 597 } },
  capello: { urls: CAPELLO_FRAME_URLS, config: CAPELLO_INTERVENTION_CONFIG, bounds: [60, 49, 339, 452], reactionBottoms: { hit1: 518, hit2: 556, stars: 524 } },
};

export function getPresenterPodiumAvatar(player) {
  // A human using the same nickname must keep their own custom avatar.
  if (player?.isBot !== true) return null;
  const key = resolvePresenterKey({ ...player, meta: { ...player.meta, presenterKey: player.presenterKey || player.meta?.presenterKey } });
  const portrait = PORTRAITS[key];
  if (!portrait) return null;
  const { config, urls, bounds, reactionBottoms } = portrait;
  return { key, bounds, reactionBottoms, poses: {
    neutral: urls[config.neutralFrame],
    happy: urls[config.neutralFrame],
    blink: urls[config.blinkFrame],
    ...config.reactionUrls,
  } };
}

export async function preparePresenterPodiumAvatar(actor, portrait, { signal } = {}) {
  const framesByUrl = new Map();
  const [x, y, width, height] = portrait.bounds;
  const scale = Math.min(490 / width, 470 / height);
  if (!actor.previewOnly) actor.podiumHitTarget = {
    left: `${(600 - width * scale) / 12}%`, top: `${(600 - height * scale) / 6}%`,
    width: `${width * scale / 6}%`, height: `${height * scale / 6}%`,
  };
  for (const pose of actor.previewOnly ? ["happy"] : Object.keys(portrait.poses)) {
    signal?.throwIfAborted();
    const url = portrait.poses[pose];
    if (!framesByUrl.has(url)) {
      const image = new Image();
      image.src = url;
      await image.decode();
      signal?.throwIfAborted();
      const canvas = Object.assign(document.createElement("canvas"), { width: 600, height: 600 });
      actor.frames[pose] = canvas;
      const reaction = pose === "hit1" || pose === "hit2" || pose === "stars";
      // Reaction art includes shoulders and stars outside the normal bust's
      // bounds. Keep a common scale, anchoring its measured visible bottom
      // (alpha > 8) to the plinth, instead of aligning transparent cell margins.
      const drawScale = reaction ? Math.min(scale, 580 / image.naturalWidth, 580 / image.naturalHeight) : scale;
      canvas.getContext("2d").drawImage(image,
        reaction ? (600 - image.naturalWidth * drawScale) / 2 : (600 - width * scale) / 2 - x * scale,
        reaction ? 590 - portrait.reactionBottoms[pose] * drawScale : 600 - height * scale - y * scale,
        image.naturalWidth * drawScale, image.naturalHeight * drawScale);
      framesByUrl.set(url, canvas);
    }
    actor.frames[pose] = framesByUrl.get(url);
  }
}
