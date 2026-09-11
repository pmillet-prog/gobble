import {
  computeInterventionPlacement,
  getInterventionFramePosition,
} from "../botInterventions/spriteInterventionAnimation.js";

export const ROMEJKO_FRAME_URLS = Object.freeze(
  Array.from({ length: 5 }, (_, index) =>
    `/bots/presenters/romejko/frame-${index + 1}.webp`
  )
);
export const ROMEJKO_SPRITE_URL = "/bots/presenters/romejko/frames.webp";
export const ROMEJKO_BUTTON_URL = "/bots/presenters/romejko/button.webp";
export const ROMEJKO_REACTION_URLS = Object.freeze({
  hit1: "/bots/presenters/romejko/hit-1.webp",
  hit2: "/bots/presenters/romejko/hit-2.webp",
  stars: "/bots/presenters/romejko/stars.webp",
});

// Réglages visuels et temporels simples de l'intervention.
export const ROMEJKO_CHARACTER_HEIGHT_PX = 190;
export const ROMEJKO_CHARACTER_HEIGHT_MOBILE_PX = 158;
export const ROMEJKO_BUBBLE_MAX_WIDTH_PX = 340;
export const ROMEJKO_BUBBLE_MAX_WIDTH_MOBILE_PX = 260;
export const ROMEJKO_TYPE_DELAY_MIN_MS = 35;
export const ROMEJKO_TYPE_DELAY_MAX_MS = 50;
export const ROMEJKO_TEXT_HOLD_MS = 3500;

export const ROMEJKO_ENTRY_MS = 560;
export const ROMEJKO_EXIT_MS = 240;
export const ROMEJKO_MOUTH_DELAY_MIN_MS = 90;
export const ROMEJKO_MOUTH_DELAY_MAX_MS = 140;

export const ROMEJKO_MOUTH_SEQUENCE = Object.freeze([
  0, 1, 2, 1, 3, 2, 1, 0, 2, 1, 3, 1, 2, 0, 1,
]);

export const ROMEJKO_INTERVENTION_CONFIG = Object.freeze({
  accessibleName: "Laurent Romejko",
  blinkChance: 0.3,
  blinkFrame: 4,
  buttonUrl: ROMEJKO_BUTTON_URL,
  bubbleMaxWidthPx: ROMEJKO_BUBBLE_MAX_WIDTH_PX,
  bubbleMaxWidthMobilePx: ROMEJKO_BUBBLE_MAX_WIDTH_MOBILE_PX,
  characterHeightPx: ROMEJKO_CHARACTER_HEIGHT_PX,
  characterHeightMobilePx: ROMEJKO_CHARACTER_HEIGHT_MOBILE_PX,
  entryMs: ROMEJKO_ENTRY_MS,
  exitMs: ROMEJKO_EXIT_MS,
  frameAspectRatio: 5 / 6,
  frameCount: ROMEJKO_FRAME_URLS.length,
  key: "romejko",
  mirrored: true,
  mouthDelayMaxMs: ROMEJKO_MOUTH_DELAY_MAX_MS,
  mouthDelayMinMs: ROMEJKO_MOUTH_DELAY_MIN_MS,
  mouthSequence: ROMEJKO_MOUTH_SEQUENCE,
  neutralFrame: 0,
  reactionUrls: ROMEJKO_REACTION_URLS,
  spriteUrl: ROMEJKO_SPRITE_URL,
  textHoldMs: ROMEJKO_TEXT_HOLD_MS,
  typeDelayMaxMs: ROMEJKO_TYPE_DELAY_MAX_MS,
  typeDelayMinMs: ROMEJKO_TYPE_DELAY_MIN_MS,
  typingSpeedMultiplier: 8,
});

export function getRomejkoFramePosition(frame) {
  return getInterventionFramePosition(frame, ROMEJKO_FRAME_URLS.length);
}

export function computeRomejkoPlacement(hostRect, viewport = {}) {
  return computeInterventionPlacement(
    hostRect,
    viewport,
    ROMEJKO_INTERVENTION_CONFIG
  );
}
