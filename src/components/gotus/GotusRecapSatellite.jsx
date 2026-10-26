import React from "react";
import { createPortal } from "react-dom";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import GotusProgress from "./GotusProgress.jsx";
import GotusSolution from "./GotusSolution.jsx";
import "./gotusResults.css";

export function GotusRecap({ summary, onOpenDefinition }) {
  if (!summary) return null;
  return <section className="gotus-recap" role="status" aria-live="polite" aria-label="Bilan Gotus"><div className="gotus-recap__card">
    <img className="gotus-recap__logo" src="/gotus/gotus-logo.webp" alt="Gotus" />
    <h2>{summary.won ? "+1 mot trouvé !" : "Le mot de Gotus"}</h2>
    <GotusSolution word={summary.solution} onOpenDefinition={onOpenDefinition} />
    <p>{summary.won ? `Trouvé en ${summary.attemptsUsed || 1} essai${summary.attemptsUsed > 1 ? "s" : ""}.` : "Une nouvelle occasion à la prochaine manche cible."}</p>
    {summary.progression ? <GotusProgress progression={summary.progression} /> : null}
  </div></section>;
}

// The results sequence owns when this recap opens/closes, just like other recaps.
export default function GotusRecapSatellite({ onOpenDefinition }) {
  const feature = useFeatureRuntime("gotus");
  const summary = useFeatureSelector(feature, state => state.recap);
  return summary ? createPortal(<GotusRecap summary={summary} onOpenDefinition={onOpenDefinition} />, document.body) : null;
}
