import {
  computeInterventionPlacement,
  getInterventionFramePosition,
} from "../botInterventions/spriteInterventionAnimation.js";
import { SFX_KEYS } from "../../assets/assetKeys.js";

export const LEPERS_FRAME_URLS = Object.freeze(
  Array.from({ length: 7 }, (_, index) =>
    `/bots/presenters/lepers/frame-${index + 1}.webp`
  )
);
export const LEPERS_SPRITE_URL = "/bots/presenters/lepers/frames.webp";
export const LEPERS_BUTTON_URL = "/bots/presenters/lepers/button.webp";
export const LEPERS_REACTION_URLS = Object.freeze({
  hit1: "/bots/presenters/lepers/hit-1.webp",
  hit2: "/bots/presenters/lepers/hit-2.webp",
  stars: "/bots/presenters/lepers/stars.webp",
});

// Réglages visuels et temporels simples de l'intervention.
export const LEPERS_CHARACTER_HEIGHT_PX = 190;
export const LEPERS_CHARACTER_HEIGHT_MOBILE_PX = 158;
export const LEPERS_BUBBLE_MAX_WIDTH_PX = 390;
export const LEPERS_BUBBLE_MAX_WIDTH_MOBILE_PX = 292;
export const LEPERS_TYPE_DELAY_MIN_MS = 35;
export const LEPERS_TYPE_DELAY_MAX_MS = 50;
export const LEPERS_TEXT_HOLD_MS = 6500;
export const LEPERS_SOLVED_CELEBRATION_DELAY_MS = 2250;
export const LEPERS_SOLVED_CELEBRATION_DURATION_MS = 2200;

export const LEPERS_ENTRY_MS = 560;
export const LEPERS_EXIT_MS = 240;
export const LEPERS_MOUTH_DELAY_MIN_MS = 90;
export const LEPERS_MOUTH_DELAY_MAX_MS = 140;

export const LEPERS_MOUTH_SEQUENCE = Object.freeze([
  0, 1, 2, 1, 4, 3, 1, 0, 2, 4, 1, 3, 0,
]);

export const LEPERS_INTERVENTION_CONFIG = Object.freeze({
  accessibleName: "Julien Lepers",
  blinkChance: 0.28,
  blinkFrame: 5,
  buttonUrl: LEPERS_BUTTON_URL,
  bubbleMaxWidthPx: LEPERS_BUBBLE_MAX_WIDTH_PX,
  bubbleMaxWidthMobilePx: LEPERS_BUBBLE_MAX_WIDTH_MOBILE_PX,
  characterHeightPx: LEPERS_CHARACTER_HEIGHT_PX,
  characterHeightMobilePx: LEPERS_CHARACTER_HEIGHT_MOBILE_PX,
  entryMs: LEPERS_ENTRY_MS,
  exitMs: LEPERS_EXIT_MS,
  frameAspectRatio: 5 / 6,
  frameCount: LEPERS_FRAME_URLS.length,
  key: "lepers",
  manualAppearanceSfxKey: SFX_KEYS.lepersBuzzer,
  mirrored: true,
  mouthDelayMaxMs: LEPERS_MOUTH_DELAY_MAX_MS,
  mouthDelayMinMs: LEPERS_MOUTH_DELAY_MIN_MS,
  mouthSequence: LEPERS_MOUTH_SEQUENCE,
  neutralFrame: 6,
  reactionUrls: LEPERS_REACTION_URLS,
  spriteUrl: LEPERS_SPRITE_URL,
  textHoldMs: LEPERS_TEXT_HOLD_MS,
  typeDelayMaxMs: LEPERS_TYPE_DELAY_MAX_MS,
  typeDelayMinMs: LEPERS_TYPE_DELAY_MIN_MS,
  typingSpeedMultiplier: 8,
});

export function getLepersFramePosition(frame) {
  return getInterventionFramePosition(frame, LEPERS_FRAME_URLS.length);
}

export function computeLepersPlacement(hostRect, viewport = {}) {
  return computeInterventionPlacement(
    hostRect,
    viewport,
    LEPERS_INTERVENTION_CONFIG
  );
}
