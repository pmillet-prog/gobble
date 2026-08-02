import React from "react";

import FinaleBonusMultiplierBadge from "./FinaleBonusMultiplierBadge.jsx";

const FINALE_BONUS_TILES = Object.freeze([
  { bonus: "L2", effective: "L4", tileClass: "bg-sky-300 border-sky-500 text-slate-950" },
  { bonus: "L3", effective: "L6", tileClass: "bg-blue-700 border-blue-900 text-white" },
  { bonus: "M2", effective: "M4", tileClass: "bg-rose-200 border-rose-400 text-slate-950" },
  { bonus: "M3", effective: "M6", tileClass: "bg-red-600 border-red-800 text-white" },
]);

function FinaleBonusTilesDemo({ multiplier = 2 }) {
  return (
    <div className="mt-4 grid grid-cols-4 gap-2" aria-label="Bonus de tuiles en finale">
      {FINALE_BONUS_TILES.map(({ bonus, effective, tileClass }) => (
        <div key={bonus} className="flex min-w-0 flex-col items-center gap-1.5">
          <div
            className={`relative flex aspect-square w-full max-w-[68px] items-center justify-center rounded-xl border-2 text-2xl font-black shadow-md ${tileClass}`}
          >
            A
            <FinaleBonusMultiplierBadge multiplier={multiplier} />
            <span className="absolute right-0 top-0 translate-x-[10%] -translate-y-[10%] rounded-full bg-slate-950 px-1 py-0.5 text-[0.58rem] font-black text-white shadow">
              {bonus}
            </span>
          </div>
          <div className="text-[11px] font-black tabular-nums">
            {bonus} → {effective}
          </div>
        </div>
      ))}
    </div>
  );
}

export default React.memo(FinaleBonusTilesDemo);

