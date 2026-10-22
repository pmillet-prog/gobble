import React from "react";
import { createPortal } from "react-dom";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import GotusProgress from "./GotusProgress.jsx";
import "./gotusResults.css";

export function GotusRecap({ summary }) {
  if (!summary) return null;
  return <section className="gotus-recap" role="status" aria-live="polite" aria-label="Bilan Gotus"><div className="gotus-recap__card">
    <img className="gotus-recap__logo" src="/gotus/gotus-logo.webp" alt="Gotus" />
    <h2>{summary.won ? "+1 mot trouvé !" : "Le mot de Gotus"}</h2>
    {summary.solution ? <strong className="gotus-recap__word">{summary.solution}</strong> : null}
    <p>{summary.won ? `Trouvé en ${summary.attemptsUsed || 1} essai${summary.attemptsUsed > 1 ? "s" : ""}.` : "Une nouvelle occasion à la prochaine manche cible."}</p>
    {summary.progression ? <GotusProgress progression={summary.progression} /> : null}
  </div></section>;
}

// The results sequence owns when this recap opens/closes, just like other recaps.
export default function GotusRecapSatellite() {
  const feature = useFeatureRuntime("gotus");
  const summary = useFeatureSelector(feature, state => state.recap);
  return summary ? createPortal(<GotusRecap summary={summary} />, document.body) : null;
}
