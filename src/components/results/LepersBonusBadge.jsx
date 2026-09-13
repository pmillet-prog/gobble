import React from "react";

export const LEPERS_BONUS_ICON_URL = "/bots/question-champion-bonus.webp";

function LepersBonusBadge({ bonus = 0, className = "", showPoints = true }) {
  const safeBonus = Math.max(0, Math.trunc(Number(bonus) || 0));
  if (!safeBonus) return null;
  const label = `Bonus Julien Lechéper : +${safeBonus} points au général`;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      <img
        src={LEPERS_BONUS_ICON_URL}
        alt=""
        aria-hidden="true"
        className="block h-3.5 w-auto rounded-[2px] shadow-sm"
      />
      {showPoints ? (
        <span
          className="font-black tabular-nums text-amber-500 drop-shadow-[0_1px_0_rgba(120,53,15,0.65)] dark:text-amber-300"
          aria-hidden="true"
        >
          +{safeBonus}
        </span>
      ) : null}
    </span>
  );
}

export default React.memo(LepersBonusBadge);
