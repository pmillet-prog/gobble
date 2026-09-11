import React from "react";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { clampValue, formatNumber } from "../../utils/numbers.js";
import { getVocabLevelMeta } from "../../vocabRanks.js";
import { getStatsImageUrl as getImageUrl } from "./statsPresentation.js";

export default function VocabularyProgressPanel({ darkMode = false, panelClassName = "", showDelta = true, showHeading = true }) {
  const stats = useFeatureRuntime("stats");
  const { vocabCount, vocabLoading, vocabRoundDelta, vocabWeeklyCount } = useFeatureFields(stats, ["vocabCount", "vocabLoading", "vocabRoundDelta", "vocabWeeklyCount"]);
  const vocabDeltaValue = Number.isFinite(vocabRoundDelta) ? Math.max(0, vocabRoundDelta) : 0;
  const vocabHasDelta = vocabDeltaValue > 0;
  const vocabDeltaLabel = vocabHasDelta ? `+${formatNumber(vocabDeltaValue)}` : "inchangé";
  const vocabTotalLabel = Number.isFinite(vocabCount)
    ? `${formatNumber(vocabCount)} mots uniques`
    : vocabLoading
    ? "Calcul en cours..."
    : "\u2014";
  const vocabWeeklyLabel = Number.isFinite(vocabWeeklyCount)
    ? `${formatNumber(vocabWeeklyCount)} cette semaine`
    : vocabLoading
    ? "Hebdo en cours..."
    : "";
  const vocabTotalValue = Number.isFinite(vocabCount) ? vocabCount : 0;
  const vocabLevel = getVocabLevelMeta(vocabTotalValue);
  const vocabPrevValue = vocabHasDelta
    ? Math.max(0, vocabTotalValue - vocabDeltaValue)
    : vocabTotalValue;
  const vocabPrevLevel = getVocabLevelMeta(vocabPrevValue);
  const vocabLevelUp =
    vocabHasDelta && vocabPrevLevel?.key && vocabLevel?.key && vocabPrevLevel.key !== vocabLevel.key;
  const vocabBaseValue = vocabPrevValue;
  const vocabLevelMin = Number.isFinite(vocabLevel?.min) ? vocabLevel.min : 0;
  const vocabLevelMax = Number.isFinite(vocabLevel?.max) ? vocabLevel.max : vocabTotalValue;
  const vocabLevelRange = Math.max(1, vocabLevelMax - vocabLevelMin);
  const vocabCurrentWithinLevel = clampValue(
    vocabTotalValue - vocabLevelMin,
    0,
    vocabLevelRange
  );
  const vocabBaseWithinLevel = clampValue(
    vocabBaseValue - vocabLevelMin,
    0,
    vocabLevelRange
  );
  const vocabLevelProgressPct = clampValue(
    (vocabCurrentWithinLevel / vocabLevelRange) * 100,
    0,
    100
  );
  const vocabLevelBasePct = clampValue(
    (vocabBaseWithinLevel / vocabLevelRange) * 100,
    0,
    100
  );
  const vocabLevelDeltaPct = Math.max(0, vocabLevelProgressPct - vocabLevelBasePct);
  const vocabCursorStyle = {
    left: `${vocabLevelProgressPct}%`,
    borderTopColor: vocabLevel?.color || (darkMode ? "#f8fafc" : "#0f172a"),
  };
  const vocabImageSrc = vocabLevel?.imageKey ? getImageUrl(vocabLevel.imageKey) : "";
  return (
    <div
      className={`flex flex-col items-center ${showDelta ? "gap-3" : "gap-2"} ${panelClassName}`}
    >
      {showHeading ? (
        <div className="text-[11px] uppercase tracking-[0.22em] opacity-70">
          Vocabulaire
        </div>
      ) : null}
      {showDelta ? (
        <div className="text-4xl font-black tabular-nums">{vocabDeltaLabel}</div>
      ) : null}
      <div
        className={
          showDelta
            ? "text-xs font-semibold opacity-75 -mt-1"
            : "text-lg font-extrabold tabular-nums"
        }
      >
        {vocabTotalLabel}
      </div>
      {vocabWeeklyLabel ? (
        <div className="text-[11px] font-semibold opacity-65 -mt-1">
          {vocabWeeklyLabel}
        </div>
      ) : null}
      <div className="mt-2 w-full max-w-lg flex flex-col items-center gap-2">
        {vocabImageSrc ? (
          <div className="relative">
            <img
              src={vocabImageSrc}
              alt={vocabLevel?.label || "Niveau vocabulaire"}
              className="h-28 sm:h-32 w-auto select-none"
              draggable={false}
            />
            {vocabLevelUp ? (
              <div className="absolute -top-2 -right-3 rotate-6 rounded-full bg-red-500 text-white text-[9px] font-extrabold px-2 py-0.5 shadow-lg animate-pulse">
                nouveau !!
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm font-extrabold uppercase tracking-widest">
            {vocabLevel?.label || "Niveau"}
          </div>
        )}
        <div className="w-full">
          <div className="relative w-full px-1">
            <div
              className={`h-3 rounded-full overflow-hidden ${
                darkMode ? "bg-slate-800/80" : "bg-slate-200/80"
              }`}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-l-full"
                style={{
                  width: `${showDelta ? vocabLevelBasePct : vocabLevelProgressPct}%`,
                  background: darkMode
                    ? "rgba(248, 250, 252, 0.85)"
                    : "rgba(15, 23, 42, 0.85)",
                }}
              />
              {showDelta && vocabDeltaValue && vocabDeltaValue > 0 ? (
                <div
                  className="absolute inset-y-0 vocab-delta-fill"
                  style={{
                    left: `${vocabLevelBasePct}%`,
                    width: `${vocabLevelDeltaPct}%`,
                  }}
                />
              ) : null}
            </div>
            <div
              className="absolute -top-3"
              style={{
                ...vocabCursorStyle,
                transform: "translateX(-50%)",
              }}
            >
              <div
                className="w-0 h-0 border-l-[6px] border-r-[6px] border-l-transparent border-r-transparent border-t-[8px]"
                style={{ borderTopColor: vocabCursorStyle.borderTopColor }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
