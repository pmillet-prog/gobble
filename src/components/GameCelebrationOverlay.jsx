import React from "react";

import AssetManager from "../assets/assetManager";
import { IMAGE_KEYS } from "../assets/assetKeys";
import {
  getCelebrationFxSnapshot,
  subscribeCelebrationFx,
} from "./celebrationFxStore.js";

const BIGWORD_IMAGE_FALLBACKS = new Map([
  [IMAGE_KEYS.bigwords.gobble, "/bigwords/gobble.webp"],
  [IMAGE_KEYS.bigwords.doubleGobble, "/bigwords/doublegobble.webp"],
  [IMAGE_KEYS.bigwords.epique, "/bigwords/epique.webp"],
  [IMAGE_KEYS.bigwords.enorme, "/bigwords/enorme.webp"],
  [IMAGE_KEYS.bigwords.excellent, "/bigwords/excellent.webp"],
  [IMAGE_KEYS.bigwords.fabuleux, "/bigwords/fabuleux.webp"],
  [IMAGE_KEYS.bigwords.bonus, "/bigwords/bonus.webp"],
]);

function getBigwordImageUrl(key, assetsReady) {
  if (!key) return "";
  const managed = AssetManager.getImage(key).url || "";
  if (managed) return managed;
  if (assetsReady) return "";
  return BIGWORD_IMAGE_FALLBACKS.get(key) || "";
}

function GameCelebrationOverlay({
  assetsReady = false,
  isMobileLayout = false,
  liteVisualEffects = false,
  phase = "",
}) {
  const { gobbleFlash, invalidFlash, praiseFlash } = React.useSyncExternalStore(
    subscribeCelebrationFx,
    getCelebrationFxSnapshot,
    getCelebrationFxSnapshot
  );
  const isActive = phase === "playing" && (praiseFlash || gobbleFlash || invalidFlash);
  const praiseImageKey =
    praiseFlash?.kind === "epic"
      ? IMAGE_KEYS.bigwords.epique
      : praiseFlash?.kind === "bonus"
      ? IMAGE_KEYS.bigwords.bonus
      : praiseFlash?.kind === "gold"
      ? IMAGE_KEYS.bigwords.enorme
      : praiseFlash?.kind === "purple"
      ? IMAGE_KEYS.bigwords.fabuleux
      : praiseFlash?.kind === "blue"
      ? IMAGE_KEYS.bigwords.excellent
      : "";
  const praiseImageSrc = getBigwordImageUrl(praiseImageKey, assetsReady);
  const praiseImageAlt =
    praiseFlash?.kind === "epic"
      ? "EPIQUE"
      : praiseFlash?.kind === "bonus"
      ? "BONUS"
      : praiseFlash?.kind === "gold"
      ? "ENORME"
      : praiseFlash?.kind === "purple"
      ? "FABULEUX"
      : praiseFlash?.kind === "blue"
      ? "EXCELLENT"
      : "";
  const gobbleImageKey =
    gobbleFlash?.kind === "doubleGobble"
      ? IMAGE_KEYS.bigwords.doubleGobble
      : IMAGE_KEYS.bigwords.gobble;
  const gobbleImageSrc = gobbleFlash
    ? getBigwordImageUrl(gobbleImageKey, assetsReady) ||
      getBigwordImageUrl(IMAGE_KEYS.bigwords.gobble, assetsReady)
    : "";
  const gobbleImageAlt = gobbleFlash?.kind === "doubleGobble" ? "DOUBLE GOBBLE" : "GOBBLE";
  const lite = !!liteVisualEffects;
  const praiseImageSizePx = isMobileLayout ? (lite ? 160 : 220) : lite ? 220 : 300;
  const gobbleImageSizePx = isMobileLayout ? (lite ? 210 : 295) : lite ? 280 : 385;
  const praiseFlashColor =
    praiseFlash?.kind === "epic"
      ? "rgba(244, 114, 182, 0.55)"
      : praiseFlash?.kind === "bonus"
      ? "rgba(251, 191, 36, 0.58)"
      : praiseFlash?.kind === "gold"
      ? "rgba(255, 92, 36, 0.55)"
      : praiseFlash?.kind === "purple"
      ? "rgba(168, 85, 247, 0.55)"
      : praiseFlash?.kind === "blue"
      ? "rgba(34, 197, 94, 0.55)"
      : "transparent";
  const gobbleFlashColor = gobbleFlash ? "rgba(255, 200, 64, 0.55)" : "transparent";
  const invalidFlashColor = invalidFlash ? "rgba(255, 36, 36, 0.68)" : "transparent";
  const showFlashRing = !lite;
  const flashInsetPx = isMobileLayout ? 10 : 14;
  const flashRingWidthPx = isMobileLayout ? 10 : 14;
  const flashRadiusPx = isMobileLayout ? 18 : 24;
  const invalidTextSizePx = isMobileLayout ? (lite ? 32 : 42) : lite ? 42 : 56;

  if (!isActive) return null;

  return (
    <div className="celebration-layer" aria-hidden="true">
      {gobbleFlash && showFlashRing ? (
        <div
          key={`flash-gobble-${gobbleFlash.id}`}
          className="celebration-flash-ring"
          style={{
            inset: `${-flashInsetPx}px`,
            borderWidth: `${flashRingWidthPx}px`,
            borderRadius: `${flashRadiusPx}px`,
            ["--celebration-flash-color"]: gobbleFlashColor,
          }}
        />
      ) : null}
      {gobbleFlash ? (
        <div
          key={gobbleFlash.id}
          className="celebration-pop celebration-image-pop celebration-gobble-pop"
          style={{
            ["--celebration-x"]: `${Math.round(gobbleFlash.dx || 0)}px`,
            ["--celebration-y"]: `${Math.round(gobbleFlash.dy || 0)}px`,
            ["--celebration-scale"]: gobbleFlash.scale || 1.6,
            ["--celebration-size"]: `${gobbleImageSizePx}px`,
            ["--celebration-duration"]: `${Math.max(
              lite ? 650 : 1600,
              Math.min(lite ? 1200 : 3400, gobbleFlash.durationMs || 2200)
            )}ms`,
          }}
        >
          {gobbleImageSrc ? (
            <img
              src={gobbleImageSrc}
              alt={gobbleImageAlt}
              className="celebration-image"
              style={{ opacity: 0.86 }}
              draggable={false}
            />
          ) : null}
        </div>
      ) : null}
      {praiseFlash ? (
        <>
          {showFlashRing ? (
            <div
              key={`flash-${praiseFlash.id}`}
              className="celebration-flash-ring"
              style={{
                inset: `${-flashInsetPx}px`,
                borderWidth: `${flashRingWidthPx}px`,
                borderRadius: `${flashRadiusPx}px`,
                ["--celebration-flash-color"]: praiseFlashColor,
              }}
            />
          ) : null}
          <div
            key={praiseFlash.id}
            className="celebration-pop celebration-image-pop"
            style={{
              ["--celebration-x"]: `${Math.round(praiseFlash.dx || 0)}px`,
              ["--celebration-y"]: `${Math.round(praiseFlash.dy || 0)}px`,
              ["--celebration-scale"]: praiseFlash.scale || 1.6,
              ["--celebration-size"]: `${praiseImageSizePx}px`,
              ["--celebration-duration"]: `${Math.max(
                lite ? 560 : 1200,
                Math.min(
                  praiseFlash?.kind === "bonus" ? (lite ? 2600 : 5600) : lite ? 1200 : 3400,
                  praiseFlash.durationMs || 1500
                )
              )}ms`,
            }}
          >
            {praiseImageSrc ? (
              <img
                src={praiseImageSrc}
                alt={praiseImageAlt}
                className="celebration-image"
                draggable={false}
              />
            ) : null}
          </div>
        </>
      ) : null}
      {invalidFlash ? (
        <>
          {showFlashRing ? (
            <div
              key={`flash-invalid-${invalidFlash.id}`}
              className="celebration-flash-ring"
              style={{
                inset: `${-flashInsetPx}px`,
                borderWidth: `${flashRingWidthPx}px`,
                borderRadius: `${flashRadiusPx}px`,
                ["--celebration-flash-color"]: invalidFlashColor,
              }}
            />
          ) : null}
          <div
            key={invalidFlash.id}
            className="celebration-pop celebration-text-pop"
            style={{
              ["--celebration-x"]: `${Math.round(invalidFlash.dx || 0)}px`,
              ["--celebration-y"]: `${Math.round(invalidFlash.dy || 0)}px`,
              ["--celebration-scale"]: invalidFlash.scale || 1.18,
              ["--celebration-duration"]: `${Math.max(
                lite ? 420 : 700,
                Math.min(lite ? 820 : 1800, invalidFlash.durationMs || 1050)
              )}ms`,
            }}
          >
            <span
              className="celebration-text celebration-text-invalid"
              style={{ fontSize: `${invalidTextSizePx}px` }}
            >
              {String(invalidFlash.text || "INVALIDE").toUpperCase()}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default React.memo(GameCelebrationOverlay);
