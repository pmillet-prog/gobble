import {
  computeInterventionPlacement,
  getInterventionFramePosition,
} from "../botInterventions/spriteInterventionAnimation.js";

export const PIVOT_FRAME_URLS = Object.freeze(
  Array.from({ length: 6 }, (_, index) =>
    `/bots/presenters/pivot/frame-${index + 1}.webp`
  )
);
export const PIVOT_SPRITE_URL = "/bots/presenters/pivot/frames.webp";
export const PIVOT_BUTTON_URL = "/bots/presenters/pivot/button.webp";
export const PIVOT_REACTION_URLS = Object.freeze({
  hit1: "/bots/presenters/pivot/hit-1.webp",
  hit2: "/bots/presenters/pivot/hit-2.webp",
  stars: "/bots/presenters/pivot/stars.webp",
});

// Réglages visuels et temporels simples de l'intervention.
export const PIVOT_CHARACTER_HEIGHT_PX = 190;
export const PIVOT_CHARACTER_HEIGHT_MOBILE_PX = 158;
export const PIVOT_BUBBLE_MAX_WIDTH_PX = 340;
export const PIVOT_BUBBLE_MAX_WIDTH_MOBILE_PX = 260;
export const PIVOT_TYPE_DELAY_MIN_MS = 20;
export const PIVOT_TYPE_DELAY_MAX_MS = 30;
export const PIVOT_TEXT_HOLD_MS = 6500;

export const PIVOT_ENTRY_MS = 560;
export const PIVOT_EXIT_MS = 240;
export const PIVOT_MOUTH_DELAY_MIN_MS = 75;
export const PIVOT_MOUTH_DELAY_MAX_MS = 115;

export const PIVOT_MOUTH_SEQUENCE = Object.freeze([
  0, 1, 2, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 1,
]);

export const PIVOT_INTERVENTION_CONFIG = Object.freeze({
  accessibleName: "Bernard Pivot",
  blinkChance: 0.3,
  blinkFrame: 5,
  buttonUrl: PIVOT_BUTTON_URL,
  bubbleMaxWidthPx: PIVOT_BUBBLE_MAX_WIDTH_PX,
  bubbleMaxWidthMobilePx: PIVOT_BUBBLE_MAX_WIDTH_MOBILE_PX,
  characterHeightPx: PIVOT_CHARACTER_HEIGHT_PX,
  characterHeightMobilePx: PIVOT_CHARACTER_HEIGHT_MOBILE_PX,
  entryMs: PIVOT_ENTRY_MS,
  exitMs: PIVOT_EXIT_MS,
  frameAspectRatio: 5 / 6,
  frameCount: PIVOT_FRAME_URLS.length,
  key: "pivot",
  mouthDelayMaxMs: PIVOT_MOUTH_DELAY_MAX_MS,
  mouthDelayMinMs: PIVOT_MOUTH_DELAY_MIN_MS,
  mouthSequence: PIVOT_MOUTH_SEQUENCE,
  neutralFrame: 0,
  reactionUrls: PIVOT_REACTION_URLS,
  spriteUrl: PIVOT_SPRITE_URL,
  textHoldMs: PIVOT_TEXT_HOLD_MS,
  typeDelayMaxMs: PIVOT_TYPE_DELAY_MAX_MS,
  typeDelayMinMs: PIVOT_TYPE_DELAY_MIN_MS,
  typingSpeedMultiplier: 8,
});

export function getPivotFramePosition(frame) {
  return getInterventionFramePosition(frame, PIVOT_FRAME_URLS.length);
}

export function computePivotPlacement(hostRect, viewport = {}) {
  return computeInterventionPlacement(
    hostRect,
    viewport,
    PIVOT_INTERVENTION_CONFIG
  );
}
