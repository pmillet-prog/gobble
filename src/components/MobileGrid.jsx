import React from "react";

function MobileGrid({
  board,
  BONUS_CLASSES,
  bonusLetterKey,
  bonusLetterScore,
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
  hintOutlineCellSet,
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
  const normalizeRotationTurns = (turns) => {
    if (!Number.isFinite(turns)) return 0;
    const mod = turns % 4;
    return mod < 0 ? mod + 4 : mod;
  };
  const rotateIndexByTurns = (index, size, turns) => {
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
  };
  const mapDisplayToBoardIndex = (displayIndex) => {
    const t = normalizeRotationTurns(gridRotationTurns);
    return rotateIndexByTurns(displayIndex, gridSize, (4 - t) % 4);
  };
  const getBonusBadgeClass = (displayBonus) => {
    if (displayBonus === "L3") return "bg-blue-700 text-white";
    if (displayBonus === "L2") return "bg-sky-400 text-slate-900";
    if (displayBonus === "M3") return "bg-red-600 text-white";
    if (displayBonus === "M2") return "bg-amber-500 text-slate-900";
    return "bg-slate-600 text-white";
  };
  const getBonusLetterRingClass = (displayBonus) => {
    if (displayBonus === "L3") return "theme-letter-ring theme-letter-ring-L3";
    if (displayBonus === "L2") return "theme-letter-ring theme-letter-ring-L2";
    if (displayBonus === "M3") return "theme-letter-ring theme-letter-ring-M3";
    if (displayBonus === "M2") return "theme-letter-ring theme-letter-ring-M2";
    return "";
  };
  const getTileTextureStyle = (index, size, colorPreset) => {
    const textureByColor = {
      wood: "/textures/bois.png",
      marble: "/textures/marbre.jpg",
      jeans: "/textures/jeans.jpg",
      concrete: "/textures/beton.jpg",
    };
    const texture = textureByColor[String(colorPreset || "")];
    if (!texture) return null;
    const safeSize = Number.isInteger(size) && size > 0 ? size : 4;
    const safeIndex = Number.isInteger(index) && index >= 0 ? index : 0;
    const row = Math.floor(safeIndex / safeSize);
    const col = safeIndex % safeSize;
    const denom = Math.max(1, safeSize - 1);
    const x = (col / denom) * 100;
    const y = (row / denom) * 100;
    return {
      backgroundImage: `url("${texture}")`,
      backgroundSize: `${safeSize * 100}% ${safeSize * 100}%`,
      backgroundPosition: `${x}% ${y}%`,
      backgroundRepeat: "no-repeat",
      backgroundBlendMode: "multiply",
    };
  };
  const isSquareMaterial = String(tileMaterialClass || "").includes("theme-material-square");
  return (
    <div
      className="flex justify-center items-center flex-shrink-0 w-full"
      style={{ minHeight: `${mobileGridSide}px` }}
    >
      <div
        ref={gridRef}
        className={
          "grid relative bg-white border rounded-xl shadow-sm w-full p-3 box-border" +
          (gridShake ? " shake" : "")
        }
        style={{
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
          gap: isSquareMaterial ? "0px" : mobileGapPx,
          padding: isSquareMaterial ? "0px" : undefined,
          touchAction: "none",
          width: "100%",
          maxWidth: mobileGridSide
            ? `${mobileGridSide}px`
            : "100%",
          maxHeight: mobileGridSide ? `${mobileGridSide}px` : undefined,
          aspectRatio: "1 / 1",
          ...lightGridSurfaceStyle,
        }}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
      >
        {implodeActive ? <div className="black-hole" aria-hidden="true" /> : null}
        {board.map((_, displayIndex) => {
          const boardIndex = mapDisplayToBoardIndex(displayIndex);
          const cell = board[boardIndex] || { letter: "?", bonus: null };
          const { letter, bonus } = cell;
          const displayBonus = normalizeBonusLabel(bonus);
          const isUsed = usedSet.has(boardIndex);
          const isHint = hintCellSet?.has?.(boardIndex);
          const isHintOutline = hintOutlineCellSet?.has?.(boardIndex);
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
          const highlightClass = isUsed ? "tile-used" : "";
          const hintClass = isHint ? "tile-hint" : "";
          const hintOutlineClass = isHintOutline ? "tile-hint-outline" : "";
          const letterRingClass =
            !isBonusLetterTile && useRingIndicator && displayBonus
              ? getBonusLetterRingClass(displayBonus)
              : "";
          const showBonusBadge =
            !isBonusLetterTile &&
            useBadgeIndicator &&
            displayBonus &&
            !bonusLetterKey;
          const isSpecialStartTileLocked = specialStartTileSet?.has?.(boardIndex);

          return (
            <button
              key={displayIndex}
              ref={(el) => (tileRefs.current[boardIndex] = el)}
              onMouseDown={() => handleMouseDown(boardIndex)}
              onTouchStart={(e) => handleTouchStart(e, boardIndex)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              type="button"
              className={[
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
                .join(" ")}
              style={
                isMobileLayout
                  ? {
                      aspectRatio: "1 / 1",
                      fontSize: `${mobileTileFontPx}px`,
                      willChange: "transform",
                      ...(getTileTextureStyle(boardIndex, gridSize, tileColorPreset) || {}),
                    }
                  : {
                      willChange: "transform",
                      ...(getTileTextureStyle(boardIndex, gridSize, tileColorPreset) || {}),
                    }
              }
            >
              {isSpecialStartTileLocked ? (
                <span aria-hidden="true" className="daily-special-start-lock" />
              ) : null}
              <span className={`tile-letter ${letterRingClass}`.trim()}>{letter}</span>
              {tilePointsVisible && letterPts > 0 ? (
                <span className="tile-points">{letterPts}</span>
              ) : null}
              {showBonusBadge && (
                <span
                  className={`absolute top-0 right-0 z-[2] text-[0.65rem] px-1 py-0.5 rounded-full font-black shadow ${getBonusBadgeClass(
                    displayBonus
                  )}`}
                  style={{
                    transform: isSquareMaterial
                      ? "translate(-8%, 8%)"
                      : "translate(10%, -10%)",
                  }}
                >
                  {displayBonus}
                </span>
              )}
            </button>
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

export default React.memo(MobileGrid);
