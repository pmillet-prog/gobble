import React from "react";
import { WEEKLY_TOP3_ROUND_TYPES } from "../../features/stats/statsConfig.js";
import { formatWeeklyDate } from "./weeklyStatsModel.js";

export default function WeeklyTop3Controls({ darkMode, roundType, onRoundTypeChange, trackingStartTs, weekStartTs }) {
  const partialWeek = Number.isFinite(trackingStartTs) && Number.isFinite(weekStartTs) && trackingStartTs > weekStartTs;
  const stopTouchPropagation = (event) => event.stopPropagation();
  return (
    <div className="shrink-0 space-y-2">
      <label className="flex items-center gap-3 text-xs font-semibold">
        <span className="shrink-0">Type de manche</span>
        <select
          value={roundType}
          onChange={(event) => onRoundTypeChange(event.target.value)}
          onTouchStart={stopTouchPropagation}
          onTouchMove={stopTouchPropagation}
          onTouchEnd={stopTouchPropagation}
          className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm ${darkMode
            ? "border-slate-600 bg-slate-900 text-slate-100"
            : "border-slate-300 bg-white text-slate-800"}`}
        >
          {WEEKLY_TOP3_ROUND_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
        </select>
      </label>
      <p className="text-[11px] leading-snug opacity-75">
        Seules les manches avec un score supérieur à 0 comptent, dans le top 3 comme dans le total joué.
        {partialWeek ? <span className="block mt-1">Suivi depuis le {formatWeeklyDate(trackingStartTs)} pour cette semaine.</span> : null}
      </p>
    </div>
  );
}
