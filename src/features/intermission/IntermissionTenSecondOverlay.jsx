import React from "react";

import { useIntermissionCountdown } from "./useIntermissionCountdown.js";

export default function IntermissionTenSecondOverlay({
  active,
  className = "",
  nextRoundLabel,
  secondsClassName,
  upcomingSpecialName,
}) {
  const remainingSeconds = useIntermissionCountdown();
  const seconds = Number.isFinite(remainingSeconds)
    ? Math.max(0, Number(remainingSeconds))
    : null;
  if (!active || seconds === null || seconds <= 0 || seconds > 10) return null;

  return (
    <div className={className}>
      <div className="space-y-2">
        {nextRoundLabel ? (
          <div className="text-xl sm:text-2xl font-black tracking-tight">
            {nextRoundLabel}
          </div>
        ) : null}
        {upcomingSpecialName ? (
          <div className="space-y-1">
            <div className="text-xs font-extrabold tracking-widest text-orange-600 dark:text-orange-300">
              MANCHE SPECIALE
            </div>
            <div className="text-sm font-bold opacity-90">
              {upcomingSpecialName}
            </div>
          </div>
        ) : null}
        <div className={secondsClassName}>{seconds}s</div>
      </div>
    </div>
  );
}
