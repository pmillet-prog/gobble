import React from "react";

export default function DefinitionDetails({
  definition = "",
  definitions = [],
  etymology = "",
  darkMode = false,
  showEtymology = true,
  compact = false,
}) {
  const items = Array.isArray(definitions) && definitions.length
    ? definitions
    : definition
    ? [definition]
    : [];

  if (!items.length) return null;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {items.length > 1 ? (
        <ol className={`${compact ? "space-y-1.5" : "space-y-2"} list-decimal pl-5 text-left`}>
          {items.map((item, index) => (
            <li key={`${String(item).slice(0, 32)}-${index}`}>{item}</li>
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
