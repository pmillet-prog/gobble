import React from "react";

import { RoundClockSeconds } from "../../features/clock/RoundClockDisplay.jsx";
import MobileGrid from "../MobileGrid.jsx";

function MobileUltraCompactPlaying({
  chatOverlays = null,
  compactRankingLabel = null,
  darkMode = false,
  mobileGridProps = {},
  mobileResultsPhaseFadeOverlay = null,
  mobileRoundIntroOverlay = null,
  mobileViewportContainerStyle = undefined,
  onOpenSettings = null,
  praiseOverlay = null,
}) {
  return (
    <>
      <div
        className={`flex flex-col ${
          darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
        }`}
        style={mobileViewportContainerStyle}
      >
        <div className="px-3 pt-0.5 pb-0 text-[10px] font-semibold flex items-center justify-between gap-2">
          <span className="truncate">
            {compactRankingLabel}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onOpenSettings?.()}
              className="px-1 py-0.5 rounded-md border text-[9px] bg-slate-100 border-slate-300 text-slate-700 flex items-center justify-center dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200"
            >
              <span className="material-icons-outlined text-[12px] leading-none" aria-hidden="true">
                settings
              </span>
              <span className="sr-only">Parametres</span>
            </button>
          </div>
          <span className="tabular-nums">
            <RoundClockSeconds suffix="s" />
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center px-2 pb-3">
          <MobileGrid {...mobileGridProps} celebrationOverlay={praiseOverlay} />
        </div>
      </div>
      {mobileResultsPhaseFadeOverlay}
      {mobileRoundIntroOverlay}
      {chatOverlays}
    </>
  );
}

export default React.memo(MobileUltraCompactPlaying);
