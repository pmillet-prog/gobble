import { PIVOT_INTERVENTION_CONFIG } from "../pivot/pivotAnimation.js";

export const BAFOUILLE_FRAME_URLS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => `/bots/presenters/bafouille/frame-${index + 1}.webp`)
);

// Same cell size, visible height, placement and timings as the results host.
// Assets are isolated before packing: no neighbouring pose can bleed in.
export const BAFOUILLE_INTERVENTION_CONFIG = Object.freeze({
  ...PIVOT_INTERVENTION_CONFIG,
  key: "bafouille",
  accessibleName: "Laurent Bafouille",
  spriteUrl: "/bots/presenters/bafouille/frames.webp",
  buttonUrl: "/bots/presenters/bafouille/button.webp",
  // The button is a cropped head; entry must use the same full cell as speech.
  launchImageUrl: BAFOUILLE_FRAME_URLS[0],
  reactionUrls: Object.freeze({
    hit1: "/bots/presenters/bafouille/hit-1.webp",
    hit2: "/bots/presenters/bafouille/hit-2.webp",
    stars: "/bots/presenters/bafouille/stars.webp",
  }),
  frameCount: BAFOUILLE_FRAME_URLS.length,
  neutralFrame: 0,
  blinkFrame: 5,
  reactionAspectRatio: 5 / 6,
});
