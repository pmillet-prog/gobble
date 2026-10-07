import React from "react";
import { resolveDefinitionSelection } from "../utils/definitionSelection.js";

export default function DefinitionDetails({
  definition = "",
  definitions = [],
  highlightedDefinition = "",
  etymology = "",
  darkMode = false,
  showEtymology = true,
  compact = false,
}) {
  const { items, highlightedIndex } = resolveDefinitionSelection({
    definition,
    definitions,
    highlightedDefinition,
  });

  if (!items.length) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {items.length > 1 ? (
        <ol className={`${compact ? "space-y-1.5" : "space-y-2"} list-decimal pl-5 text-left`}>
          {items.map((item, index) => (
            <li key={`${String(item).slice(0, 32)}-${index}`}>
              {index === highlightedIndex ? (
                <mark
                  className={`block rounded-md border px-2 py-1.5 ${
                    darkMode
                      ? "border-amber-300/45 bg-amber-300/20 text-amber-50"
                      : "border-amber-300 bg-amber-100 text-amber-950"
                  }`}
                >
                  <span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide">
                    Question de Julien
                  </span>
                  {item}
                </mark>
              ) : item}
            </li>
          ))}
        </ol>
      ) : (
        <div>{items[0]}</div>
      )}
      {showEtymology && etymology ? (
        <div
          className={`rounded-lg border px-3 py-2 leading-snug ${
            compact ? "text-[11px]" : "text-[13px]"
          } ${
            darkMode
              ? "border-amber-300/25 bg-amber-300/10 text-amber-50"
              : "border-amber-300/50 bg-amber-50/80 text-amber-950"
          }`}
        >
          <div className="text-[10px] font-black uppercase tracking-[0.12em] opacity-70">
            Étymologie
          </div>
          <div className="mt-1 text-left">{etymology}</div>
        </div>
      ) : null}
    </div>
  );
}
