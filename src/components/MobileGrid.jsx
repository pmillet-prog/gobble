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
  isMobileLayout,
  lightGridSurfaceStyle,
  MOBILE_LAYOUT_MAX_WIDTH,
  mobileGapPx,
  mobileGridSide,
  mobileTileFontPx,
  normalizeBonusLabel,
  normalizeLetterKey,
  phase,
  specialSolvedOverlay,
  tileRefs,
  tileScore,
  tick,
  usedSet,
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
          gap: mobileGapPx,
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
          const bonusClass = isBonusLetterTile
            ? "bonus-letter-tile"
            : displayBonus
            ? BONUS_CLASSES[displayBonus]
            : "bg-orange-200 border-orange-500 border-2";
          const highlightClass = isUsed ? "tile-used" : "";
          const hintClass = isHint ? "tile-hint" : "";
          const hintOutlineClass = isHintOutline ? "tile-hint-outline" : "";
          const showBonusBadge = displayBonus && !bonusLetterKey;

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
                "relative rounded-lg flex items-center justify-center font-extrabold select-none focus:outline-none focus:ring-0",
                isMobileLayout
                  ? "w-full"
                  : "w-[40px] h-[40px] sm:w-[48px] sm:h-[48px] text-xl",
                bonusClass,
                highlightClass,
                hintClass,
                hintOutlineClass,
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                isMobileLayout
                  ? {
                      aspectRatio: "1 / 1",
                      fontSize: `${mobileTileFontPx}px`,
                      willChange: "transform",
                    }
                  : { willChange: "transform" }
              }
            >
              <span className="tile-letter">{letter}</span>
              {letterPts > 0 ? <span className="tile-points">{letterPts}</span> : null}
              {showBonusBadge && (
                <span
                  className={`absolute -top-1 -right-1 text-[0.65rem] px-1 py-0.5 rounded-full font-black shadow ${
                    displayBonus === "M3"
                      ? "bg-red-600 text-white"
                      : displayBonus === "M2"
                      ? "bg-blue-700 text-white"
                      : "bg-amber-600 text-white"
                  }`}
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
