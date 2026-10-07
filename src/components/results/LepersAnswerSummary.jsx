import React from "react";
import { LEPERS_BONUS_ICON_URL } from "./LepersBonusBadge.jsx";

export default function LepersAnswerSummary({ result, openDefinition, darkMode = false }) {
  const word = String(result?.word || "").trim();
  if (!word) return null;
  const displayWord = String(result?.displayWord || word).trim().toLocaleUpperCase("fr");
  const label = `Voir la définition de ${displayWord}, réponse à la question de Julien`;

  return (
    <div className="flex justify-center">
      <button
        type="button"
        className={`inline-flex min-h-9 max-w-full items-center justify-center gap-2 rounded-lg px-2 py-1 text-sm font-extrabold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${
          darkMode ? "text-amber-200 hover:bg-amber-300/10" : "text-amber-900 hover:bg-amber-100/70"
        }`}
        onClick={(event) => {
          event.stopPropagation();
          openDefinition?.(word, {
            preferLongDefinition: true,
            highlightedDefinition: result.definition || "",
          });
        }}
        aria-label={label}
        title={label}
      >
        <img
          src={LEPERS_BONUS_ICON_URL}
          alt="QPUC"
          className="block h-5 w-auto shrink-0 rounded-[2px] shadow-sm"
        />
        <span className="min-w-0 break-words">{displayWord}</span>
      </button>
    </div>
  );
}
