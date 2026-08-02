import React from "react";

import {
  getOcidVoteGridLayout,
  selectVisibleOcidVoteOptions,
} from "./ocidVoteLayout.js";

function OcidVoteOptionsGrid({
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
      className={`grid min-h-0 w-full flex-1 overflow-hidden ${className}`}
      style={{
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
            className={`flex h-full min-h-0 min-w-0 items-center justify-center gap-1 overflow-hidden rounded-lg border px-1 py-0.5 font-bold leading-tight transition ${
              selected
                ? darkMode
                  ? "border-emerald-300/60 bg-emerald-900/70 text-emerald-50"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800"
                : darkMode
                ? "border-slate-700 bg-slate-800/80 text-slate-100"
                : "border-slate-200 bg-slate-50 text-slate-800"
            }`}
            style={{ fontSize: `${layout.fontSizePx}px` }}
          >
            <span className="min-w-0 break-all text-center">{option.display}</span>
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
