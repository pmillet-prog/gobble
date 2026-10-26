import React from "react";
import "./gotusSolution.css";

export default function GotusSolution({ word, onOpenDefinition }) {
  if (!word) return null;
  const label = `Voir la définition de ${word}`;
  return <div className="gotus-solution">
    <strong>{word}</strong>
    {onOpenDefinition ? <button type="button" onClick={() => onOpenDefinition(word)} aria-label={label} title={label}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" />
      </svg>
    </button> : null}
  </div>;
}
