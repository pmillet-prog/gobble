import React from "react";
import "./mobileGameViewport.css";

import { RoundClockSeconds } from "../../features/clock/RoundClockDisplay.jsx";
import MobileGrid from "../MobileGrid.jsx";
import MobileConnectionLabel from "../../features/mobile/MobileConnectionLabel.jsx";
import { GameBalanceSlot } from "../../features/gobblars/GameBalances.jsx";

function MobileUltraCompactPlaying({
  chatOverlays = null,
  compactRankingLabel = null,
  darkMode = false,
  mobileGridProps = {},
  mobileRoundIntroOverlay = null,
  mobileViewportContainerStyle = undefined,
  onOpenSettings = null,
  praiseOverlay = null,
}) {
  return (
    <>
      <div
        className={`mobile-game-viewport flex flex-col ${
          darkMode ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
        }`}
        style={mobileViewportContainerStyle}
      >
        <div className="currency-header px-2 py-1 text-[10px]">
          <GameBalanceSlot kind="wallet" />
          <span className="currency-header__center truncate">
            <strong className="block text-xl"><RoundClockSeconds suffix="s" /></strong>
            <MobileConnectionLabel fallback={compactRankingLabel} />
          </span>
          <GameBalanceSlot kind="bank" />
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
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center px-2 pb-3">
          <MobileGrid {...mobileGridProps} celebrationOverlay={praiseOverlay} />
        </div>
      </div>
      {mobileRoundIntroOverlay}
      {chatOverlays}
    </>
  );
}

export default React.memo(MobileUltraCompactPlaying);
