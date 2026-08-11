import React from "react";

export default function TrainingPlayerBadge({ compact = false }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border border-amber-400/50 bg-amber-300/15 font-black text-amber-700 dark:text-amber-200 ${compact ? "h-4 w-4 justify-center" : "gap-1 px-1.5 py-0.5 text-[9px]"}`} title="En entraînement" aria-label="En entraînement">
      <span className={`material-symbols-outlined leading-none ${compact ? "text-[12px]" : "text-[13px]"}`} aria-hidden="true">fitness_center</span>
      {!compact ? <span>entraînement</span> : null}
    </span>
  );
}
