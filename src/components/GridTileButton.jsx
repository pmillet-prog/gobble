import React from "react";

import { FAKE_TWINS_TYPE } from "./gameLogic";
import GridTileLetter from "./GridTileLetter.jsx";
import FinaleBonusMultiplierBadge from "./finale/FinaleBonusMultiplierBadge.jsx";
import {
  isTraceTileHighlighted,
  registerTraceTile,
} from "./traceStateStore.js";

export function getBonusBadgeClass(displayBonus) {
  if (displayBonus === "L3") return "bg-blue-700 text-white";
  if (displayBonus === "L2") return "bg-sky-400 text-slate-900";
  if (displayBonus === "M3") return "bg-red-600 text-white";
  if (displayBonus === "M2") return "bg-[#ffbfb4] border border-[#f87171] text-slate-900";
  return "bg-slate-600 text-white";
}

export function getBonusLetterRingClass(displayBonus) {
  if (displayBonus === "L3") return "theme-letter-ring theme-letter-ring-L3";
  if (displayBonus === "L2") return "theme-letter-ring theme-letter-ring-L2";
  if (displayBonus === "M3") return "theme-letter-ring theme-letter-ring-M3";
  if (displayBonus === "M2") return "theme-letter-ring theme-letter-ring-M2";
  return "";
}

function GridTileButton({
  boardIndex,
  cell,
  className = "",
  displayBonus = "",
  bonusEffectMultiplier = 1,
  hintOverlayStyle = null,
  isSquareMaterial = false,
  isSpecialStartTileLocked = false,
  letterPts = 0,
  letterRingClass = "",
  showBonusBadge = false,
  style = undefined,
  trackTraceUsed = false,
  tilePointsVisible = true,
  tileRefs = null,
}) {
  const unregisterTraceTileRef = React.useRef(null);
  const setTileRef = React.useCallback(
    (el) => {
      if (tileRefs?.current) {
        if (el) tileRefs.current[boardIndex] = el;
        else if (tileRefs.current[boardIndex]) tileRefs.current[boardIndex] = null;
      }
      if (unregisterTraceTileRef.current) {
        unregisterTraceTileRef.current();
        unregisterTraceTileRef.current = null;
      }
      if (trackTraceUsed && el) {
        unregisterTraceTileRef.current = registerTraceTile(boardIndex, el);
      }
    },
    [boardIndex, tileRefs, trackTraceUsed]
  );
  const isFakeTwinsTile = cell?.specialType === FAKE_TWINS_TYPE && cell?.altLetter;
  const isTraceUsed = trackTraceUsed && isTraceTileHighlighted(boardIndex);
  const resolvedClassName = `${className}${isFakeTwinsTile ? " fake-twins-tile" : ""}${
    isTraceUsed ? " tile-used" : ""
  }`.trim();

  return (
    <button
      ref={setTileRef}
      data-board-index={boardIndex}
      type="button"
      className={resolvedClassName}
      style={style}
    >
      {isSpecialStartTileLocked ? (
        <span aria-hidden="true" className="daily-special-start-lock" />
      ) : null}
      {hintOverlayStyle ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{ borderRadius: "inherit", ...hintOverlayStyle }}
        />
      ) : null}
      <GridTileLetter cell={cell} className={`relative z-[1] ${letterRingClass}`.trim()} />
      {tilePointsVisible && letterPts > 0 ? (
        <span className="tile-points z-[1]">{letterPts}</span>
      ) : null}
      {showBonusBadge ? (
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
      ) : null}
      {displayBonus ? (
        <FinaleBonusMultiplierBadge multiplier={bonusEffectMultiplier} />
      ) : null}
    </button>
  );
}

function shallowEqualObject(a, b) {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || a[key] !== b[key]) {
      return false;
    }
  }
  return true;
}

function areGridTileButtonPropsEqual(prev, next) {
  return (
    prev.boardIndex === next.boardIndex &&
    prev.cell === next.cell &&
    prev.className === next.className &&
    prev.displayBonus === next.displayBonus &&
    prev.bonusEffectMultiplier === next.bonusEffectMultiplier &&
    shallowEqualObject(prev.hintOverlayStyle, next.hintOverlayStyle) &&
    prev.isSquareMaterial === next.isSquareMaterial &&
    prev.isSpecialStartTileLocked === next.isSpecialStartTileLocked &&
    prev.letterPts === next.letterPts &&
    prev.letterRingClass === next.letterRingClass &&
    prev.showBonusBadge === next.showBonusBadge &&
    shallowEqualObject(prev.style, next.style) &&
    prev.trackTraceUsed === next.trackTraceUsed &&
    prev.tilePointsVisible === next.tilePointsVisible &&
    prev.tileRefs === next.tileRefs
  );
}

export default React.memo(GridTileButton, areGridTileButtonPropsEqual);
