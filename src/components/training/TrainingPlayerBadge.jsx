import React from "react";

export function GotusTrainingBadge({ player, compact = false }) {
  if (!player?.inTraining || player?.trainingMode !== "gotus") return null;
  return <span className="inline-flex shrink-0 items-center align-middle" title="En entraînement Gotus" aria-label="En entraînement Gotus">
    <img src="/gotus/gotus-logo.webp" width={compact ? 36 : 48} height={compact ? 18 : 24} className="object-contain" alt="" />
  </span>;
}

export default function TrainingPlayerBadge({ compact = false, trainingMode }) {
  if (trainingMode === "gotus") return null;
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border border-amber-400/50 bg-amber-300/15 font-black text-amber-700 dark:text-amber-200 ${compact ? "h-4 w-4 justify-center" : "gap-1 px-1.5 py-0.5 text-[9px]"}`} title="En entraînement" aria-label="En entraînement">
      <span className={`material-symbols-outlined leading-none ${compact ? "text-[12px]" : "text-[13px]"}`} aria-hidden="true">fitness_center</span>
      {!compact ? <span>entraînement</span> : null}
    </span>
  );
}
