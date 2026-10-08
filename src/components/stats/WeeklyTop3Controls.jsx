import React from "react";
import { WEEKLY_TOP3_ROUND_TYPES } from "../../features/stats/statsConfig.js";
import { formatWeeklyDate } from "./weeklyStatsModel.js";
import StatsBoardSelect from "./StatsBoardSelect.jsx";
import StatsTypewriterText from "./StatsTypewriterText.jsx";

export default function WeeklyTop3Controls({ roundType, onRoundTypeChange, trackingStartTs, weekStartTs }) {
  const partialWeek = Number.isFinite(trackingStartTs) && Number.isFinite(weekStartTs) && trackingStartTs > weekStartTs;
  return (
    <div className="shrink-0 space-y-2">
      <StatsBoardSelect label="Type de manche" options={WEEKLY_TOP3_ROUND_TYPES}
        value={roundType} onChange={onRoundTypeChange} />
      <p className="text-[11px] leading-snug opacity-75">
        <StatsTypewriterText>Seules les manches avec un score supérieur à 0 comptent, dans le top 3 comme dans le total joué.</StatsTypewriterText>
        {partialWeek ? <span className="block mt-1"><StatsTypewriterText>{`Suivi depuis le ${formatWeeklyDate(trackingStartTs)} pour cette semaine.`}</StatsTypewriterText></span> : null}
      </p>
    </div>
  );
}
