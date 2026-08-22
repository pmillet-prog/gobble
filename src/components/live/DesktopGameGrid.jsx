import React from "react";

import ResultsPathOverlay from "../grid/ResultsPathOverlay.jsx";
import { RoundClockSeconds } from "../../features/clock/RoundClockDisplay.jsx";
import DesktopLiveGrid from "./DesktopLiveGrid.jsx";

function readBoardIndex(event) {
  const target = event?.target instanceof Element ? event.target : null;
  const tile = target?.closest?.("[data-board-index]");
  const index = Number(tile?.getAttribute?.("data-board-index"));
  return Number.isInteger(index) ? index : null;
}

function DesktopGameGrid({
  className = "",
  darkMode = false,
  gridRef = null,
  implodeActive = false,
  inputControllerRef = null,
  liveGridProps = {},
  praiseOverlay = null,
  resultsPathGradientId = "results-path",
  resultsPathPreview = null,
  showResultsWordPath = false,
  specialSolvedOverlay = false,
  style = undefined,
}) {
  const onMouseDown = React.useCallback(
    (event) => {
      const index = readBoardIndex(event);
      if (index != null) inputControllerRef?.current?.handleMouseDown?.(index);
    },
    [inputControllerRef]
  );
  const onTouchStart = React.useCallback(
    (event) => {
      const index = readBoardIndex(event);
      if (index != null) inputControllerRef?.current?.handleTouchStart?.(event, index);
    },
    [inputControllerRef]
  );
  const onMouseMove = React.useCallback(
    (event) => inputControllerRef?.current?.handleMouseMove?.(event),
    [inputControllerRef]
  );
  const onMouseUp = React.useCallback(
    () => inputControllerRef?.current?.handleMouseUp?.(),
    [inputControllerRef]
  );
  const onTouchMove = React.useCallback(
    (event) => inputControllerRef?.current?.handleTouchMove?.(event),
    [inputControllerRef]
  );
  const onTouchEnd = React.useCallback(
    (event) => inputControllerRef?.current?.handleTouchEnd?.(event),
    [inputControllerRef]
  );

  return (
    <div
      ref={gridRef}
      className={`game-grid-surface ${className}`.trim()}
      style={style}
      onMouseUp={onMouseUp}
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {praiseOverlay}
      {showResultsWordPath ? (
        <ResultsPathOverlay
          darkMode={darkMode}
          gradientId={resultsPathGradientId}
          preview={resultsPathPreview}
        />
      ) : null}
      {phaseOverlay(specialSolvedOverlay, darkMode)}
      {implodeActive ? <div className="black-hole" aria-hidden="true" /> : null}
      <DesktopLiveGrid {...liveGridProps} />
    </div>
  );
}

function phaseOverlay(visible, darkMode) {
  if (!visible) return null;
  return (
    <div
      className={`absolute inset-0 z-20 flex items-center justify-center rounded-xl backdrop-blur-sm ${
        darkMode ? "bg-[#0b1020]/80" : "bg-white/75"
      }`}
    >
      <div className="text-center px-4 py-6">
        <div className="text-2xl font-black tracking-tight">Bravo, vous avez trouvé !</div>
        <div className="mt-3 text-4xl font-black tabular-nums">
          Temps restant : <RoundClockSeconds suffix="s" />
        </div>
      </div>
    </div>
  );
}

export default React.memo(DesktopGameGrid);
