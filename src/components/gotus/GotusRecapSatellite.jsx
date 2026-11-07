import React from "react";
import { createPortal } from "react-dom";
import { useFeatureRuntime, useFeatureFields } from "../../app/react/useFeatureRuntime.js";
import GotusProgress from "./GotusProgress.jsx";
import GotusSolution from "./GotusSolution.jsx";
import "./gotusResults.css";

export function GotusRecap({ summary, onOpenDefinition, visible = true }) {
  if (!summary) return null;
  return <section className="gotus-recap" data-open={visible} inert={!visible ? "" : undefined}
    aria-hidden={!visible || undefined} role={visible ? "status" : undefined} aria-live={visible ? "polite" : undefined} aria-label="Bilan Gotus"><div className="gotus-recap__card">
    <img className="gotus-recap__logo" src="/gotus/gotus-logo.webp" alt="Gotus" />
    <h2>{summary.won ? "+1 mot trouvé !" : "Le mot de Gotus"}</h2>
    {summary.solution ? <GotusSolution word={summary.solution} onOpenDefinition={onOpenDefinition} />
      : <p className="gotus-recap__pending">Révélation du mot…</p>}
    <p>{summary.won ? `Trouvé en ${summary.attemptsUsed || 1} essai${summary.attemptsUsed > 1 ? "s" : ""}.` : "Une nouvelle occasion à la prochaine manche cible."}</p>
    {summary.progression ? <GotusProgress progression={summary.progression} /> : null}
  </div></section>;
}

// The results sequence owns when this recap opens/closes, just like other recaps.
export default function GotusRecapSatellite({ onOpenDefinition }) {
  const feature = useFeatureRuntime("gotus");
  const { started, summary, recap } = useFeatureFields(feature, ["started", "summary", "recap"]);
  // Prepare the card, styles and logo while Gotus is playing. Opening it needs
  // no download or replacement of the game surface; the answer remains private.
  return started && summary ? createPortal(<GotusRecap summary={recap || summary} visible={!!recap}
    onOpenDefinition={onOpenDefinition} />, document.body) : null;
}
