import React from "react";
import GridTileButton, {
  getBonusLetterRingClass,
} from "./GridTileButton.jsx";
import {
  getTraceStateSnapshot,
  subscribeTraceState,
} from "./traceStateStore.js";

const TEXTURE_BY_COLOR = {
  wood: "/textures/bois.png",
  marble: "/textures/marbre.jpg",
  jeans: "/textures/jeans.jpg",
  concrete: "/textures/beton.jpg",
};

const TRACE_GRADIENT_MAX_ORDER = 15;

const MOBILE_GRID_COMPARE_PROPS = [
  "board",
  "BONUS_CLASSES",
  "bonusLetterKey",
  "bonusLetterScore",
  "celebrationOverlay",
  "darkMode",
  "gridRef",
  "gridShake",
  "gridSize",
  "gridRotationTurns",
  "handleMouseDown",
  "handleMouseMove",
  "handleMouseUp",
  "handleTouchEnd",
  "handleTouchMove",
  "handleTouchStart",
  "hintCellSet",
  "hintCellOverlayStyleMap",
  "hintCellStyleMap",
  "hintOutlineCellSet",
  "hintOutlineOverlayStyleMap",
  "hintOutlineStyleMap",
  "implodeActive",
  "isMobileLayout",
  "lightGridSurfaceStyle",
  "MOBILE_LAYOUT_MAX_WIDTH",
  "mobileGapPx",
  "mobileGridSide",
  "mobileTileFontPx",
  "normalizeBonusLabel",
  "normalizeLetterKey",
  "phase",
  "specialIndicatorPreset",
  "specialSolvedOverlay",
  "introHideTiles",
  "defaultTileBaseClass",
  "tilePointsVisible",
  "tileRefs",
  "tileMaterialClass",
  "tileColorPreset",
  "tileScore",
  "usedSet",
  "specialStartTileSet",
];

function normalizeRotationTurns(turns) {
  if (!Number.isFinite(turns)) return 0;
  const mod = turns % 4;
  return mod < 0 ? mod + 4 : mod;
}

function rotateIndexByTurns(index, size, turns) {
  if (!Number.isInteger(index) || !Number.isInteger(size) || size <= 0) {
    return index;
  }
  const t = normalizeRotationTurns(turns);
  if (t === 0) return index;
  const row = Math.floor(index / size);
  const col = index % size;
  if (t === 1) return col * size + (size - 1 - row);
  if (t === 2) return (size - 1 - row) * size + (size - 1 - col);
  return (size - 1 - col) * size + row;
}

function buildTileTextureStyles(size, colorPreset) {
  const texture = TEXTURE_BY_COLOR[String(colorPreset || "")];
  if (!texture) return null;
  const safeSize = Number.isInteger(size) && size > 0 ? size : 4;
  const denom = Math.max(1, safeSize - 1);
  return Array.from({ length: safeSize * safeSize }, (_, index) => {
    const row = Math.floor(index / safeSize);
    const col = index % safeSize;
    const x = (col / denom) * 100;
    const y = (row / denom) * 100;
    return {
      backgroundImage: `url("${texture}")`,
      backgroundSize: `${safeSize * 100}% ${safeSize * 100}%`,
      backgroundPosition: `${x}% ${y}%`,
      backgroundRepeat: "no-repeat",
      backgroundBlendMode: "multiply",
    };
  });
}

function buildTraceTileInfoMap(highlightPath) {
  const infoMap = new Map();
  if (!Array.isArray(highlightPath) || !highlightPath.length) return infoMap;
  highlightPath.forEach((boardIndex, order) => {
    if (!Number.isFinite(boardIndex) || infoMap.has(boardIndex)) return;
    const progress = Math.min(1, order / TRACE_GRADIENT_MAX_ORDER);
    const hue = 215 + progress * 55;
    infoMap.set(boardIndex, {
      order,
      progress,
      hue,
      style: {
        "--trace-order": String(order),
        "--trace-progress": progress.toFixed(3),
        "--trace-hue": hue.toFixed(1),
        "--trace-bg-top": `hsl(${hue.toFixed(1)} 78% 38%)`,
        "--trace-bg-mid": `hsl(${(hue + 8).toFixed(1)} 84% 48%)`,
        "--trace-bg-bottom": `hsl(${(hue + 16).toFixed(1)} 90% 68%)`,
        "--trace-glow": `hsla(${hue.toFixed(1)}, 78%, 42%, 0.34)`,
        "--trace-ring": `hsla(${hue.toFixed(1)}, 86%, 58%, 0.5)`,
      },
    });
  });
  return infoMap;
}

function areMobileGridPropsEqual(prevProps, nextProps) {
  for (const prop of MOBILE_GRID_COMPARE_PROPS) {
    if (!Object.is(prevProps[prop], nextProps[prop])) return false;
  }

  if (
    !prevProps.specialSolvedOverlay &&
    !nextProps.specialSolvedOverlay &&
    prevProps.phase === "playing" &&
    nextProps.phase === "playing"
  ) {
    return true;
  }

  return Object.is(prevProps.tick, nextProps.tick);
}

function MobileGrid({
  board,
  BONUS_CLASSES,
  bonusLetterKey,
  bonusLetterScore,
  celebrationOverlay = null,
  darkMode,
  gridRef,
  gridShake,
  gridSize,
  gridRotationTurns,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleTouchEnd,
  handleTouchMove,
  handleTouchStart,
  hintCellSet,
  hintCellOverlayStyleMap,
  hintCellStyleMap,
  hintOutlineCellSet,
  hintOutlineOverlayStyleMap,
  hintOutlineStyleMap,
  implodeActive,
  isMobileLayout,
  lightGridSurfaceStyle,
  MOBILE_LAYOUT_MAX_WIDTH,
  mobileGapPx,
  mobileGridSide,
  mobileTileFontPx,
  normalizeBonusLabel,
  normalizeLetterKey,
  phase,
  specialIndicatorPreset,
  specialSolvedOverlay,
  introHideTiles = false,
  defaultTileBaseClass = "theme-tile-base",
  tilePointsVisible = true,
  tileRefs,
  tileMaterialClass,
  tileColorPreset,
  tileScore,
  tick,
  usedSet,
  specialStartTileSet,
}) {
  const traceSnapshot = React.useSyncExternalStore(
    subscribeTraceState,
    getTraceStateSnapshot,
    getTraceStateSnapshot
  );
  const tileTextureStyles = React.useMemo(
    () => buildTileTextureStyles(gridSize, tileColorPreset),
    [gridSize, tileColorPreset]
  );
  const traceTileInfoMap = React.useMemo(
    () =>
      phase === "playing"
        ? buildTraceTileInfoMap(traceSnapshot.highlightPath)
        : new Map(),
    [phase, traceSnapshot.highlightPath]
  );
  const mapDisplayToBoardIndex = (displayIndex) => {
    const t = normalizeRotationTurns(gridRotationTurns);
    return rotateIndexByTurns(displayIndex, gridSize, (4 - t) % 4);
  };
  const isSquareMaterial = String(tileMaterialClass || "").includes("theme-material-square");
  const readBoardIndexFromEvent = React.useCallback((event) => {
    const target = event.target instanceof Element ? event.target : null;
    const tile = target?.closest?.("[data-board-index]");
    const index = Number(tile?.getAttribute?.("data-board-index"));
    return Number.isInteger(index) ? index : null;
  }, []);
  const handleGridMouseDown = React.useCallback(
    (event) => {
      const index = readBoardIndexFromEvent(event);
      if (index == null) return;
      handleMouseDown(index);
    },
    [handleMouseDown, readBoardIndexFromEvent]
  );
  const handleGridTouchStart = React.useCallback(
    (event) => {
      const index = readBoardIndexFromEvent(event);
      if (index == null) return;
      handleTouchStart(event, index);
    },
    [handleTouchStart, readBoardIndexFromEvent]
  );
  return (
    <div
      className="flex justify-center items-center flex-shrink-0 w-full"
      style={{ minHeight: `${mobileGridSide}px` }}
    >
      <div
        ref={gridRef}
        className={
          "grid relative bg-white border rounded-xl shadow-sm w-full p-3 box-border" +
          (gridShake ? " shake-soft" : "")
        }
        style={{
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
          gap: isSquareMaterial ? "0px" : mobileGapPx,
          padding: isSquareMaterial ? "0px" : undefined,
          touchAction: "none",
          overscrollBehavior: "none",
          width: "100%",
          maxWidth: mobileGridSide
            ? `${mobileGridSide}px`
            : "100%",
          maxHeight: mobileGridSide ? `${mobileGridSide}px` : undefined,
          aspectRatio: "1 / 1",
          animation: gridShake
            ? "shakeSoft 0.34s cubic-bezier(0.36, 0.07, 0.19, 0.97)"
            : undefined,
          willChange: gridShake ? "transform" : undefined,
          ...lightGridSurfaceStyle,
        }}
        onMouseUp={handleMouseUp}
        onMouseDown={handleGridMouseDown}
        onMouseMove={handleMouseMove}
        onTouchStart={handleGridTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        {celebrationOverlay}
        {implodeActive ? <div className="black-hole" aria-hidden="true" /> : null}
        {board.map((_, displayIndex) => {
          const boardIndex = mapDisplayToBoardIndex(displayIndex);
          const cell = board[boardIndex] || { letter: "?", bonus: null };
          const { letter, bonus } = cell;
          const displayBonus = normalizeBonusLabel(bonus);
          const isUsed = usedSet.has(boardIndex);
          const traceInfo = phase === "playing" ? traceTileInfoMap.get(boardIndex) : null;
          const isHint = hintCellSet?.has?.(boardIndex);
          const isHintOutline = hintOutlineCellSet?.has?.(boardIndex);
          const shouldShowHint = isHint;
          const shouldShowHintOutline = isHintOutline;
          const isBonusLetterTile =
            bonusLetterKey && normalizeLetterKey(letter) === bonusLetterKey;
          const letterPts = isBonusLetterTile
            ? bonusLetterScore ?? 20
            : tileScore(cell);
          const useFillIndicator = specialIndicatorPreset === "fill";
          const useRingIndicator = specialIndicatorPreset === "ring";
          const useBadgeIndicator = specialIndicatorPreset === "badge";
          const bonusClass = isBonusLetterTile
            ? "bonus-letter-tile"
            : useFillIndicator && displayBonus
            ? BONUS_CLASSES[displayBonus]
            : defaultTileBaseClass;
          const highlightClass =
            phase === "playing" ? (traceInfo ? "tile-used" : "") : isUsed ? "tile-used" : "";
          const hintClass = shouldShowHint ? "tile-hint" : "";
          const hintOutlineClass = shouldShowHintOutline ? "tile-hint-outline" : "";
          const hintStyle =
            (shouldShowHint ? hintCellStyleMap?.get?.(boardIndex) : null) ||
            (shouldShowHintOutline ? hintOutlineStyleMap?.get?.(boardIndex) : null) ||
            null;
          const hintOverlayStyle =
            (shouldShowHint ? hintCellOverlayStyleMap?.get?.(boardIndex) : null) ||
            (shouldShowHintOutline ? hintOutlineOverlayStyleMap?.get?.(boardIndex) : null) ||
            null;
          const letterRingClass =
            !isBonusLetterTile && useRingIndicator && displayBonus
              ? getBonusLetterRingClass(displayBonus)
              : "";
          const showBonusBadge =
            !isBonusLetterTile &&
            (useFillIndicator || useBadgeIndicator) &&
            displayBonus &&
            !bonusLetterKey;
          const isSpecialStartTileLocked = specialStartTileSet?.has?.(boardIndex);
          const tileClassName = [
            "tile-cell relative rounded-lg flex items-center justify-center font-extrabold select-none focus:outline-none focus:ring-0",
            isMobileLayout
              ? "w-full"
              : "w-[40px] h-[40px] sm:w-[48px] sm:h-[48px] text-xl",
            tileMaterialClass,
            bonusClass,
            highlightClass,
            hintClass,
            hintOutlineClass,
            isSpecialStartTileLocked ? "daily-special-start-used" : "",
            introHideTiles ? "opacity-0 pointer-events-none" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const tileStyle = isMobileLayout
            ? {
                aspectRatio: "1 / 1",
                fontSize: `${mobileTileFontPx}px`,
                touchAction: "none",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
                ...(traceInfo?.style || {}),
                ...(hintStyle || {}),
                ...(tileTextureStyles?.[boardIndex] || {}),
              }
            : {
                touchAction: "none",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
                ...(traceInfo?.style || {}),
                ...(hintStyle || {}),
                ...(tileTextureStyles?.[boardIndex] || {}),
              };

          return (
            <GridTileButton
              key={displayIndex}
              boardIndex={boardIndex}
              cell={cell}
              className={tileClassName}
              displayBonus={displayBonus}
              hintOverlayStyle={hintOverlayStyle}
              isSquareMaterial={isSquareMaterial}
              isSpecialStartTileLocked={isSpecialStartTileLocked}
              letterPts={letterPts}
              letterRingClass={letterRingClass}
              showBonusBadge={showBonusBadge}
              style={tileStyle}
              trackTraceUsed={phase === "playing"}
              tilePointsVisible={tilePointsVisible}
              tileRefs={tileRefs}
            />
          );
        })}
        {phase === "playing" && specialSolvedOverlay && (
          <div
            className={`absolute inset-0 z-20 flex items-center justify-center rounded-xl backdrop-blur-sm ${
              darkMode ? "bg-[#0b1020]/80" : "bg-white/75"
            }`}
          >
            <div className="text-center px-4 py-6">
              <div className="text-2xl font-black tracking-tight">
                Bravo, vous avez trouvé !
              </div>
              {typeof tick === "number" && (
                <div className="mt-3 text-4xl font-black tabular-nums">
                  Temps restant : {Math.max(0, tick)}s
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(MobileGrid, areMobileGridPropsEqual);
