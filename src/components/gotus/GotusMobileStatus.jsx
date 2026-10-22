import React from "react";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import GotusProgress from "./GotusProgress.jsx";
import "./gotusMobileStatus.css";

export function GotusMobileWords() {
  const feature = useFeatureRuntime("gotus");
  const won = useFeatureSelector(feature, state => !!state.summary?.won);
  return <span className="gotus-mobile-words" role="status">
    <img src="/gotus/gotus-logo.webp" alt="Gotus" width="56" height="28" />
    <strong>{won ? "+1 mot trouvé" : "Mot à trouver"}</strong>
  </span>;
}

export function GotusMobileProgress() {
  const feature = useFeatureRuntime("gotus");
  const progress = useFeatureSelector(feature, state => state.summary?.progression?.after);
  return <div className="gotus-mobile-progress" aria-live="polite">
    {progress ? <GotusProgress progress={progress} showTotal={false} /> : <span>Préparation de Gotus…</span>}
  </div>;
}
