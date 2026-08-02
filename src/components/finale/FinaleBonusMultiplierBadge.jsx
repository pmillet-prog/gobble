import React from "react";

function FinaleBonusMultiplierBadge({ multiplier = 1 }) {
  const safeMultiplier = Number(multiplier);
  if (!Number.isFinite(safeMultiplier) || safeMultiplier <= 1) return null;

  return (
    <span
      className="finale-bonus-multiplier"
      title={`Effet de la tuile multiplié par ${safeMultiplier}`}
    >
      ×{safeMultiplier}
    </span>
  );
}

export default React.memo(FinaleBonusMultiplierBadge);

