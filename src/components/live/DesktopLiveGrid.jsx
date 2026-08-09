import React from "react";
import GridTileButton, { getBonusLetterRingClass } from "../GridTileButton.jsx";

function DesktopLiveGrid({
  board,
  BONUS_CLASSES,
  bonusLetterKey,
  bonusLetterScore,
  bonusEffectMultiplier = 1,
  defaultTileBaseClass,
  getTileColorTextureStyle,
  gridRotationTurns,
  gridSize,
  hintCellOverlayStyleMap,
  hintCellSet,
  hintCellStyleMap,
  hintOutlineCellSet,
  hintOutlineOverlayStyleMap,
  hintOutlineStyleMap,
  isMobileLayout,
  isSquareMaterial,
  mapDisplayToBoardIndex,
  mobileRoundIntroHideTiles,
  normalizeBonusLabel,
  normalizeLetterKey,
  phase,
  roundTilePointsVisible,
  special3LockedStartTileSet,
  specialIndicatorPreset,
  tileColorPreset,
  tileFontPx,
  tileMaterialClass,
  tileRefs,
  tileScore,
  usedSet,
}) {
  const safeBoard = Array.isArray(board) ? board : [];
  const safeUsedSet = usedSet instanceof Set ? usedSet : new Set();
  const safeStartTileSet =
    special3LockedStartTileSet instanceof Set ? special3LockedStartTileSet : new Set();
  const useFillIndicator = specialIndicatorPreset === "fill";
  const useRingIndicator = specialIndicatorPreset === "ring";
  const useBadgeIndicator = specialIndicatorPreset === "badge";
  const safeTileFontPx = Math.max(1, Number(tileFontPx) || 16);
  const desktopTilePointStyle = !isMobileLayout
    ? {
        "--tile-points-font-size": `${Math.max(
          3.5,
          Math.min(10, safeTileFontPx * 0.4)
        )}px`,
        "--tile-points-offset": `${Math.max(
          1,
          Math.min(6, safeTileFontPx * 0.24)
        )}px`,
        "--tile-points-bubble-offset": `${Math.max(
          1.5,
          Math.min(10, safeTileFontPx * 0.32)
        )}px`,
      }
    : null;

  return (
    <>
      {safeBoard.map((_, displayIndex) => {
        const boardIndex = mapDisplayToBoardIndex(displayIndex, gridSize, gridRotationTurns);
        const cell = safeBoard[boardIndex] || { letter: "?", bonus: null };
        const { letter, bonus } = cell;
        const displayBonus = normalizeBonusLabel(bonus);
        const isUsed = safeUsedSet.has(boardIndex);
        const isBonusLetterTile = bonusLetterKey && normalizeLetterKey(letter) === bonusLetterKey;
        const isHint = hintCellSet?.has?.(boardIndex);
        const isHintOutline = hintOutlineCellSet?.has?.(boardIndex);
        const letterPts = isBonusLetterTile ? bonusLetterScore ?? 20 : tileScore(cell);
        const bonusClass = isBonusLetterTile
          ? "bonus-letter-tile"
          : useFillIndicator && displayBonus
          ? BONUS_CLASSES[displayBonus]
          : defaultTileBaseClass;
        const highlightClass = phase === "playing" ? "" : isUsed ? "tile-used" : "";
        const hintClass = isHint ? "tile-hint" : "";
        const hintOutlineClass = isHintOutline ? "tile-hint-outline" : "";
        const hintStyle =
          (isHint ? hintCellStyleMap?.get?.(boardIndex) : null) ||
          (isHintOutline ? hintOutlineStyleMap?.get?.(boardIndex) : null) ||
          null;
        const hintOverlayStyle =
          (isHint ? hintCellOverlayStyleMap?.get?.(boardIndex) : null) ||
          (isHintOutline ? hintOutlineOverlayStyleMap?.get?.(boardIndex) : null) ||
          null;
        const letterRingClass =
          !isBonusLetterTile && useRingIndicator && displayBonus
            ? getBonusLetterRingClass(displayBonus)
            : "";
        const showBonusBadge =
          !isBonusLetterTile && useBadgeIndicator && displayBonus && !bonusLetterKey;
        const isSpecialStartTileLocked = safeStartTileSet.has(boardIndex);
        const tileClassName = [
          "tile-cell relative rounded-lg flex items-center justify-center font-extrabold select-none focus:outline-none focus:ring-0",
          tileMaterialClass,
          bonusClass,
          highlightClass,
          hintClass,
          hintOutlineClass,
          isSpecialStartTileLocked ? "daily-special-start-used" : "",
          mobileRoundIntroHideTiles ? "opacity-0 pointer-events-none" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const tileStyle = {
          width: "100%",
          aspectRatio: "1 / 1",
          touchAction: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          fontSize: isMobileLayout ? "clamp(18px, 7vw, 30px)" : `${safeTileFontPx}px`,
          ...(desktopTilePointStyle || {}),
          ...(hintStyle || {}),
          ...(getTileColorTextureStyle(boardIndex, gridSize, tileColorPreset) || {}),
        };

        return (
          <GridTileButton
            key={displayIndex}
            boardIndex={boardIndex}
            bonusEffectMultiplier={bonusEffectMultiplier}
            cell={cell}
            className={tileClassName}
            displayBonus={displayBonus}
            hintOverlayStyle={hintOverlayStyle}
            isSquareMaterial={isSquareMaterial}
            isSpecialStartTileLocked={isSpecialStartTileLocked}
            letterPts={letterPts}
            letterRingClass={letterRingClass}
            showBonusBadge={!!(displayBonus && (useFillIndicator || showBonusBadge))}
            style={tileStyle}
            trackTraceUsed={phase === "playing"}
            tilePointsVisible={roundTilePointsVisible}
            tileRefs={tileRefs}
          />
        );
      })}
    </>
  );
}

export default React.memo(DesktopLiveGrid);
