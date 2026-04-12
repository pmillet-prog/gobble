import React from "react";

export default function WordSpecialBadge({
  usedFakeTwins = false,
  darkMode = false,
  compact = false,
}) {
  if (!usedFakeTwins) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border font-extrabold uppercase tracking-[0.14em] ${
        darkMode
          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
          : "border-emerald-500/25 bg-emerald-50 text-emerald-700"
      } ${compact ? "px-1.5 py-[1px] text-[0.52rem]" : "px-2 py-[2px] text-[0.58rem]"}`}
      title="Mot utilisant la tuile faux jumeaux"
    >
      2L
    </span>
  );
}
