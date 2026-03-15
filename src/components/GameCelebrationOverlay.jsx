import React from "react";
import { createPortal } from "react-dom";

import AssetManager from "../assets/assetManager";
import { IMAGE_KEYS } from "../assets/assetKeys";

const BIGWORD_IMAGE_FALLBACKS = new Map([
  [IMAGE_KEYS.bigwords.gobble, "/bigwords/gobble.png"],
  [IMAGE_KEYS.bigwords.doubleGobble, "/bigwords/doublegobble.png"],
  [IMAGE_KEYS.bigwords.epique, "/bigwords/epique.png"],
  [IMAGE_KEYS.bigwords.enorme, "/bigwords/enorme.png"],
  [IMAGE_KEYS.bigwords.excellent, "/bigwords/excellent.png"],
  [IMAGE_KEYS.bigwords.fabuleux, "/bigwords/fabuleux.png"],
]);

function getBigwordImageUrl(key, assetsReady) {
  if (!key) return "";
  const managed = AssetManager.getImage(key).url || "";
  if (managed) return managed;
  if (assetsReady) return "";
  return BIGWORD_IMAGE_FALLBACKS.get(key) || "";
}

function buildFlashHoleStyle(flashRect, isMobileLayout, color) {
  if (
    !flashRect ||
    !Number.isFinite(flashRect.left) ||
    !Number.isFinite(flashRect.top) ||
    !Number.isFinite(flashRect.width) ||
    !Number.isFinite(flashRect.height)
  ) {
    return null;
  }
  const flashPadding = isMobileLayout ? 8 : 12;
  const flashRadiusBase = isMobileLayout ? 18 : 22;
  return {
    left: `${Math.max(0, Math.round(flashRect.left - flashPadding))}px`,
    top: `${Math.max(0, Math.round(flashRect.top - flashPadding))}px`,
    width: `${Math.max(0, Math.round(flashRect.width + flashPadding * 2))}px`,
    height: `${Math.max(0, Math.round(flashRect.height + flashPadding * 2))}px`,
    ["--praise-flash-color"]: color,
    ["--praise-flash-radius"]: `${flashRadiusBase}px`,
  };
}

function GameCelebrationOverlay({
  assetsReady = false,
  gobbleFlash = null,
  gridRef = null,
  isMobileLayout = false,
  phase = "",
  praiseFlash = null,
}) {
  const isActive = phase === "playing" && (praiseFlash || gobbleFlash);
  const rects = React.useMemo(() => {
    if (!isActive) return { flashRect: null, praisePositionStyle: undefined };
    const gridRect = gridRef?.current?.getBoundingClientRect?.() || null;
    const flashRect = gridRect || null;
    const praiseRect = !isMobileLayout ? gridRect : null;
    const praisePositionStyle =
      praiseRect && Number.isFinite(praiseRect.left) && Number.isFinite(praiseRect.top)
        ? {
            left: `${Math.round(praiseRect.left + praiseRect.width / 2)}px`,
            top: `${Math.round(praiseRect.top + praiseRect.height * 0.45)}px`,
          }
        : undefined;
    return { flashRect, praisePositionStyle };
  }, [gridRef, isActive, isMobileLayout, praiseFlash?.id, gobbleFlash?.id]);

  const praiseImageKey =
    praiseFlash?.kind === "epic"
      ? IMAGE_KEYS.bigwords.epique
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
      : praiseFlash?.kind === "gold"
      ? "ENORME"
      : praiseFlash?.kind === "purple"
      ? "FABULEUX"
      : praiseFlash?.kind === "blue"
      ? "EXCELLENT"
      : "";
  const praiseFlashColor =
    praiseFlash?.kind === "epic"
      ? "rgba(244, 114, 182, 0.55)"
      : praiseFlash?.kind === "gold"
      ? "rgba(255, 92, 36, 0.55)"
      : praiseFlash?.kind === "purple"
      ? "rgba(168, 85, 247, 0.55)"
      : praiseFlash?.kind === "blue"
      ? "rgba(34, 197, 94, 0.55)"
      : "transparent";
  const gobbleImageKey =
    gobbleFlash?.kind === "doubleGobble"
      ? IMAGE_KEYS.bigwords.doubleGobble
      : IMAGE_KEYS.bigwords.gobble;
  const gobbleImageSrc = gobbleFlash
    ? getBigwordImageUrl(gobbleImageKey, assetsReady) ||
      getBigwordImageUrl(IMAGE_KEYS.bigwords.gobble, assetsReady)
    : "";
  const gobbleImageAlt = gobbleFlash?.kind === "doubleGobble" ? "DOUBLE GOBBLE" : "GOBBLE";
  const gobbleFlashColor = gobbleFlash ? "rgba(255, 200, 64, 0.55)" : "transparent";
  const praiseFlashHoleStyle = buildFlashHoleStyle(rects.flashRect, isMobileLayout, praiseFlashColor);
  const gobbleFlashHoleStyle = buildFlashHoleStyle(rects.flashRect, isMobileLayout, gobbleFlashColor);
  const praiseImageSizePx = isMobileLayout ? 220 : 300;
  const gobbleImageSizePx = isMobileLayout ? 260 : 340;

  if (!isActive || typeof document === "undefined") return null;

  return createPortal(
    <>
      {gobbleFlash ? (
        <div
          key={`flash-gobble-${gobbleFlash.id}`}
          className="praise-flash"
          style={{ ["--praise-flash-color"]: gobbleFlashColor }}
        >
          {gobbleFlashHoleStyle ? (
            <div className="praise-flash-hole" style={gobbleFlashHoleStyle} />
          ) : (
            <div className="praise-flash-full" />
          )}
        </div>
      ) : null}
      {gobbleFlash ? (
        <div
          key={gobbleFlash.id}
          className="praise-pop praise-image-pop gobble-pop"
          style={{
            ...rects.praisePositionStyle,
            ["--praise-x"]: `${Math.round(gobbleFlash.dx || 0)}px`,
            ["--praise-y"]: `${Math.round(gobbleFlash.dy || 0)}px`,
            ["--praise-scale"]: gobbleFlash.scale || 1.6,
            ["--praise-size"]: `${gobbleImageSizePx}px`,
            ["--praise-duration"]: `${Math.max(
              1600,
              Math.min(3000, gobbleFlash.durationMs || 2200)
            )}ms`,
          }}
        >
          {gobbleImageSrc ? (
            <img src={gobbleImageSrc} alt={gobbleImageAlt} className="praise-image" draggable={false} />
          ) : null}
        </div>
      ) : null}
      {praiseFlash ? (
        <>
          <div
            key={`flash-${praiseFlash.id}`}
            className="praise-flash"
            style={{ ["--praise-flash-color"]: praiseFlashColor }}
          >
            {praiseFlashHoleStyle ? (
              <div className="praise-flash-hole" style={praiseFlashHoleStyle} />
            ) : (
              <div className="praise-flash-full" />
            )}
          </div>
          <div
            key={praiseFlash.id}
            className="praise-pop praise-image-pop"
            style={{
              ...rects.praisePositionStyle,
              ["--praise-x"]: `${Math.round(praiseFlash.dx || 0)}px`,
              ["--praise-y"]: `${Math.round(praiseFlash.dy || 0)}px`,
              ["--praise-scale"]: praiseFlash.scale || 1.6,
              ["--praise-size"]: `${praiseImageSizePx}px`,
              ["--praise-duration"]: `${Math.max(
                1200,
                Math.min(2600, praiseFlash.durationMs || 1500)
              )}ms`,
            }}
          >
            {praiseImageSrc ? (
              <img src={praiseImageSrc} alt={praiseImageAlt} className="praise-image" draggable={false} />
            ) : null}
          </div>
        </>
      ) : null}
    </>,
    document.body
  );
}

export default React.memo(GameCelebrationOverlay);
