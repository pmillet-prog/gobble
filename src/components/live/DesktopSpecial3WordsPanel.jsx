import React from "react";

import { useTraceSnapshot } from "../../features/trace/TraceRuntime.jsx";

function DesktopSpecial3WordsPanel({
  activeSlotIndex = 0,
  clearSlot = null,
  darkMode = false,
  dailyInvalidPulseKey = 0,
  dailyInvalidSlot = -1,
  dailyTotalScore = 0,
  formatNumber = (value) => String(value ?? ""),
  isDailyPlay = false,
  onSelectSlot = null,
  onSubmit = null,
  renderLengthBadge = null,
  renderPreviewTiles = null,
  resolveLiveTrace = null,
  slots = [],
  tutorialStep = 0,
  visualScreenShakeEnabled = true,
}) {
  const snapshot = useTraceSnapshot();
  const liveTrace =
    typeof resolveLiveTrace === "function" ? resolveLiveTrace(snapshot) || {} : {};
  const highlightPath = Array.isArray(liveTrace.highlightPath) ? liveTrace.highlightPath : [];
  const liveWord = String(liveTrace.liveWord || "");
  const normalizedWord = String(liveTrace.normalizedWord || "");
  const blockedReason = String(liveTrace.blockedReason || "");
  const valid = Boolean(liveTrace.valid);
  const score = Number.isFinite(liveTrace.score) ? liveTrace.score : null;

  return (
    <div className="relative flex flex-col flex-1 min-h-0 gap-2">
      <div className="text-xs font-semibold text-center text-orange-700">
        Place les bonus sur la grille, puis garde 3 mots avec des tuiles de départ différentes.
      </div>
      <div
        className={`rounded-lg border px-2 py-2 space-y-1.5 ${
          darkMode ? "bg-slate-900/90 border-slate-700" : "bg-white/90 border-slate-200"
        } ${tutorialStep >= 1 ? "special3-tutorial-focus" : ""}`}
      >
        {slots.map((slot, index) => {
          const slotWord = String(slot?.word || "").trim();
          const isActiveSlot = index === activeSlotIndex;
          const showLiveWord = isActiveSlot && !slotWord && !!liveWord;
          const displayWord = showLiveWord
            ? liveWord.toUpperCase()
            : String(slot?.display || slotWord || "").toUpperCase();
          const displayPath = showLiveWord
            ? highlightPath
            : Array.isArray(slot?.path)
            ? slot.path
            : [];
          const liveInvalid = showLiveWord && !valid;
          const numericScoreLabel = slotWord
            ? Number.isFinite(slot?.pts)
              ? formatNumber(slot.pts)
              : "0"
            : showLiveWord && valid
            ? formatNumber(score || 0)
            : null;
          const scoreLabel = slotWord
            ? Number.isFinite(slot?.pts)
              ? `${formatNumber(slot.pts)} pts`
              : "0 pt"
            : showLiveWord
            ? valid
              ? `${formatNumber(score || 0)} pts`
              : blockedReason || "INVALIDE"
            : "—";
          const rowIsInvalid = dailyInvalidSlot === index && dailyInvalidPulseKey > 0;

          return (
            <div
              key={`live-special3-slot-${index}-${rowIsInvalid ? dailyInvalidPulseKey : 0}`}
              className={[
                "rounded-md border-l-4 px-1.5 py-1.5",
                isActiveSlot
                  ? darkMode
                    ? "border-amber-400 bg-slate-800/60"
                    : "border-amber-400 bg-amber-50"
                  : darkMode
                  ? "border-transparent bg-slate-900/35"
                  : "border-transparent bg-slate-50/70",
                rowIsInvalid && visualScreenShakeEnabled ? "daily-invalid-shake" : "",
              ].join(" ")}
            >
              <button
                type="button"
                className="block w-full text-left min-w-0"
                onClick={() => {
                  if (!slotWord) onSelectSlot?.(index);
                }}
              >
                <div className="text-[10px] uppercase tracking-wide opacity-60">Mot {index + 1}</div>
                <div className="mt-0.5 min-h-[24px] min-w-0">
                  {displayWord ? (
                    renderPreviewTiles?.(
                      displayWord,
                      `desktop-special3-slot-${index}`,
                      displayPath,
                      null,
                      {
                        align: "left",
                        disableRotation: true,
                        compact: true,
                        minScale: 0.28,
                        reserveScaledWidth: true,
                      }
                    )
                  ) : (
                    <div className="h-6 flex items-center text-sm font-black opacity-50">—</div>
                  )}
                </div>
              </button>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span
                  title={scoreLabel}
                  className={`min-w-0 text-xs font-black ${liveInvalid ? "text-red-500" : ""}`}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    <span
                      className={
                        numericScoreLabel
                          ? "inline-block min-w-[3ch] text-right tabular-nums"
                          : ""
                      }
                    >
                      {numericScoreLabel || scoreLabel}
                    </span>
                    {slotWord
                      ? renderLengthBadge?.(slotWord)
                      : showLiveWord && valid
                      ? renderLengthBadge?.(normalizedWord)
                      : null}
                  </span>
                </span>
                {slotWord ? (
                  <button
                    type="button"
                    className="h-6 min-w-6 px-1 rounded-full border text-xs font-black"
                    onClick={(event) => {
                      event.stopPropagation();
                      clearSlot?.(index);
                    }}
                  >
                    x
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        <div className="pt-1 text-right text-sm font-black">
          Total : {formatNumber(dailyTotalScore)} pts
        </div>
      </div>
      {isDailyPlay ? (
        <button
          type="button"
          className={`w-full rounded-xl px-3 py-2 text-sm font-black shadow-sm transition ${
            darkMode
              ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              : "bg-emerald-500 text-white hover:bg-emerald-600"
          }`}
          onClick={() => void onSubmit?.()}
        >
          Valider
        </button>
      ) : null}
    </div>
  );
}

export default React.memo(DesktopSpecial3WordsPanel);
