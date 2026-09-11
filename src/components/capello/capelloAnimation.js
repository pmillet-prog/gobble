import {
  computeInterventionPlacement,
  getInterventionFramePosition,
  getInterventionTypingDelay,
  randomIntegerBetween,
  splitInterventionText,
} from "../botInterventions/spriteInterventionAnimation.js";

export const CAPELLO_FRAME_URLS = Object.freeze(
  Array.from({ length: 5 }, (_, index) =>
    `/bots/presenters/capello/frame-${index + 1}.webp`
  )
);
export const CAPELLO_SPRITE_URL = "/bots/presenters/capello/frames.webp";
export const CAPELLO_BUTTON_URL = "/bots/presenters/capello/button.webp";
export const CAPELLO_REACTION_URLS = Object.freeze({
  hit1: "/bots/presenters/capello/hit-1.webp",
  hit2: "/bots/presenters/capello/hit-2.webp",
  stars: "/bots/presenters/capello/stars.webp",
});

// Réglages visuels et temporels simples de l'intervention.
export const CAPELLO_CHARACTER_HEIGHT_PX = 190;
export const CAPELLO_CHARACTER_HEIGHT_MOBILE_PX = 158;
export const CAPELLO_BUBBLE_MAX_WIDTH_PX = 340;
export const CAPELLO_BUBBLE_MAX_WIDTH_MOBILE_PX = 260;
export const CAPELLO_TYPE_DELAY_MIN_MS = 35;
export const CAPELLO_TYPE_DELAY_MAX_MS = 50;
export const CAPELLO_TEXT_HOLD_MS = 3500;

export const CAPELLO_ENTRY_MS = 560;
export const CAPELLO_EXIT_MS = 240;
export const CAPELLO_MOUTH_DELAY_MIN_MS = 90;
export const CAPELLO_MOUTH_DELAY_MAX_MS = 140;

export const CAPELLO_MOUTH_SEQUENCE = Object.freeze([
  0, 1, 2, 1, 3, 2, 1, 0, 2, 1, 3, 1, 2, 0, 1,
]);

export const CAPELLO_INTERVENTION_CONFIG = Object.freeze({
  accessibleName: "Maître Capello",
  blinkChance: 0.3,
  blinkFrame: 4,
  buttonUrl: CAPELLO_BUTTON_URL,
  bubbleMaxWidthPx: CAPELLO_BUBBLE_MAX_WIDTH_PX,
  bubbleMaxWidthMobilePx: CAPELLO_BUBBLE_MAX_WIDTH_MOBILE_PX,
  characterHeightPx: CAPELLO_CHARACTER_HEIGHT_PX,
  characterHeightMobilePx: CAPELLO_CHARACTER_HEIGHT_MOBILE_PX,
  entryMs: CAPELLO_ENTRY_MS,
  exitMs: CAPELLO_EXIT_MS,
  frameAspectRatio: 5 / 6,
  frameCount: CAPELLO_FRAME_URLS.length,
  key: "capello",
  mouthDelayMaxMs: CAPELLO_MOUTH_DELAY_MAX_MS,
  mouthDelayMinMs: CAPELLO_MOUTH_DELAY_MIN_MS,
  mouthSequence: CAPELLO_MOUTH_SEQUENCE,
  neutralFrame: 0,
  reactionUrls: CAPELLO_REACTION_URLS,
  spriteUrl: CAPELLO_SPRITE_URL,
  textHoldMs: CAPELLO_TEXT_HOLD_MS,
  typeDelayMaxMs: CAPELLO_TYPE_DELAY_MAX_MS,
  typeDelayMinMs: CAPELLO_TYPE_DELAY_MIN_MS,
  typingSpeedMultiplier: 8,
});

export function splitCapelloText(text) {
  return splitInterventionText(text);
}

export { randomIntegerBetween };

export function getCapelloTypingDelay(character, random = Math.random) {
  return getInterventionTypingDelay(
    character,
    CAPELLO_INTERVENTION_CONFIG,
    random
  );
}

export function getCapelloFramePosition(frame) {
  return getInterventionFramePosition(frame, CAPELLO_FRAME_URLS.length);
}

export function computeCapelloPlacement(hostRect, viewport = {}) {
  return computeInterventionPlacement(
    hostRect,
    viewport,
    CAPELLO_INTERVENTION_CONFIG
  );
}
