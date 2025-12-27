import React from "react";

export default function MobileGrid({
  board,
  BONUS_CLASSES,
  bonusLetterKey,
  bonusLetterScore,
  darkMode,
  gridRef,
  gridShake,
  gridSize,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleTouchEnd,
  handleTouchMove,
  handleTouchStart,
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
  return (
    <div
      className="flex justify-center items-center flex-shrink-0 w-full"
      style={{ minHeight: `${mobileGridSide}px`, paddingInline: "12px" }}
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
            : `${MOBILE_LAYOUT_MAX_WIDTH}px`,
          maxHeight: mobileGridSide ? `${mobileGridSide}px` : undefined,
          aspectRatio: "1 / 1",
          ...lightGridSurfaceStyle,
        }}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
      >
        {board.map((cell, i) => {
          const { letter, bonus } = cell;
          const displayBonus = normalizeBonusLabel(bonus);
          const isUsed = usedSet.has(i);
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
          const showBonusBadge = displayBonus && !bonusLetterKey;

          return (
            <button
              key={i}
              ref={(el) => (tileRefs.current[i] = el)}
              onMouseDown={() => handleMouseDown(i)}
              onTouchStart={(e) => handleTouchStart(e, i)}
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
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                isMobileLayout
                  ? { aspectRatio: "1 / 1", fontSize: `${mobileTileFontPx}px` }
                  : undefined
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
