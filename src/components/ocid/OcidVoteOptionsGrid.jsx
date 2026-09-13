import React from "react";

import {
  getOcidVoteGridLayout,
  selectVisibleOcidVoteOptions,
} from "./ocidVoteLayout.js";

function OcidVoteOptionsGrid({
  adaptive = false,
  className = "",
  compact = false,
  darkMode = false,
  onSelect,
  options = [],
  selectedOptionId = "",
}) {
  const visible = React.useMemo(
    () => selectVisibleOcidVoteOptions(options, { compact }),
    [compact, options]
  );
  const layout = React.useMemo(
    () => getOcidVoteGridLayout(visible.options.length, { compact }),
    [compact, visible.options.length]
  );
  const gapPx = compact || layout.rows >= 8 ? 3 : 5;

  return (
    <div
      className={`grid min-h-0 min-w-0 w-full flex-1 ${adaptive ? "overflow-y-auto overscroll-contain" : "overflow-hidden"} ${className}`}
      style={adaptive ? {
        gap: "10px",
        padding: "2px",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 144px), 1fr))",
        gridAutoRows: "max-content",
        alignContent: "start",
        scrollbarGutter: "stable",
      } : {
        gap: `${gapPx}px`,
        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
      }}
      aria-label={
        visible.hiddenBotCount > 0
          ? `${visible.options.length} propositions de joueurs affichées, ${visible.hiddenBotCount} propositions de bots masquées`
          : `${visible.options.length} propositions affichées`
      }
    >
      {visible.options.map((option) => {
        const selected = selectedOptionId === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect?.(option.id)}
            aria-pressed={selected}
            className={`flex min-w-0 items-center justify-center rounded-lg border font-bold transition ${adaptive ? "flex-wrap gap-2 px-3 py-3" : "h-full min-h-0 gap-1 overflow-hidden px-1 py-0.5 leading-tight"} ${
              selected
                ? darkMode
                  ? "border-emerald-300/60 bg-emerald-900/70 text-emerald-50"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800"
                : darkMode
                ? "border-slate-700 bg-slate-800/80 text-slate-100"
                : "border-slate-200 bg-slate-50 text-slate-800"
            }`}
            style={adaptive ? { minHeight: "56px", fontSize: "14px", lineHeight: 1.45 } : { fontSize: `${layout.fontSizePx}px` }}
          >
            <span className={`min-w-0 text-center ${adaptive ? "flex-[1_1_100px] [overflow-wrap:anywhere]" : "break-all"}`}>{option.display}</span>
            {Number(option?.voteCount) > 0 ? (
              <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-black leading-none text-white shadow-sm">
                {Number(option.voteCount)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default React.memo(OcidVoteOptionsGrid);
