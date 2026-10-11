import React, { useEffect } from "react";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { TROPHY_BY_ID } from "../../../shared/trophyCatalog.js";
import "./trophyDevControls.css";

const ERROR_MESSAGES = {
  dev_timeout: "Le serveur met trop de temps à répondre. Réessaie dans un instant.",
  dev_busy: "Un essai est déjà en cours.",
  auth_required: "Reconnecte-toi pour utiliser les essais.",
  disconnected: "La connexion est interrompue. Réessaie une fois reconnecté.",
  invalid_achievement: "Ce trophée n’est pas disponible pour un essai.",
  forbidden: "L’accès aux essais n’est pas autorisé pour ce compte.",
  not_allowed: "L’accès aux essais n’est pas autorisé pour ce compte.",
  rate_limited: "Attends un instant avant le prochain essai.",
  dev_achievement_limit: "Efface les essais pour recommencer.",
  dev_tools_unavailable: "Les essais ne sont pas disponibles pour le moment.",
  dev_tools_locked: "L’accès aux essais est verrouillé pour ce compte.",
  crypto_unavailable: "Ce navigateur ne permet pas cet essai. Utilise un navigateur récent.",
  request_failed: "L’essai n’a pas pu être effectué. Réessaie dans un instant.",
};

export default function TrophyDevControls({ trophyId, userId }) {
  const feature = useFeatureRuntime("achievements");
  const state = useFeatureFields(feature, ["devAllowed", "userId", "devBusy", "devError", "devCounts"]);
  useEffect(() => {
    feature.clearDevError();
    return () => feature.clearDevError();
  }, [feature, trophyId, userId]);
  useEffect(() => {
    if (!state.devError) return;
    const timer = setTimeout(() => feature.clearDevError(), 6000);
    return () => clearTimeout(timer);
  }, [feature, state.devError]);
  if (!state.devAllowed || Number(userId) !== state.userId) return null;
  const hasTrials = Object.values(state.devCounts || {}).some(count => Number(count) > 0);
  const uniqueTrialObtained = TROPHY_BY_ID[trophyId]?.repeat === "once" && Number(state.devCounts?.[trophyId]) > 0;
  const run = action => { void Promise.resolve().then(action).catch(() => {}); };
  const error = state.devError ? ERROR_MESSAGES[state.devError] || "L’essai n’a pas pu être effectué. Réessaie dans un instant." : null;
  return <div className="trophy-dev-controls" aria-busy={Boolean(state.devBusy)}>
    <div className="trophy-dev-actions">
      <button className="trophy-dev-grant" type="button" disabled={Boolean(state.devBusy) || uniqueTrialObtained}
        onClick={() => run(() => feature.grantDevTrophy(trophyId))}>{uniqueTrialObtained ? "Déjà octroyé" : "Octroyer"}</button>
      {hasTrials ? <button className="trophy-dev-reset" type="button" disabled={Boolean(state.devBusy)}
        onClick={() => run(() => feature.resetDevTrophies())}>Effacer les essais</button> : null}
    </div>
    <p className="trophy-dev-note">Essai temporaire · sans effet sur le classement</p>
    {error ? <p className="trophy-dev-error" role="alert">{error}</p> : null}
  </div>;
}
