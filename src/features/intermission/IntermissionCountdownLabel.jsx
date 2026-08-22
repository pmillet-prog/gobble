import React from "react";

import { RoundClockSeconds } from "../clock/RoundClockDisplay.jsx";
import { useIntermissionCountdown } from "./useIntermissionCountdown.js";

export default function IntermissionCountdownLabel({
  breakKind,
  phase,
  roundPreparing,
  roundStartDelayed,
  serverStatus,
  standaloneTrainingSession,
}) {
  const breakCountdown = useIntermissionCountdown();

  if (standaloneTrainingSession) {
    if (phase === "playing") {
      return <>Temps restant : <RoundClockSeconds suffix="s" /></>;
    }
    if (phase === "results") return "Entraînement terminé";
    return "Entraînement";
  }
  if (phase === "playing") {
    return <>Temps restant : <RoundClockSeconds suffix="s" /></>;
  }
  const seconds = Number.isFinite(breakCountdown)
    ? Math.max(0, Number(breakCountdown))
    : null;
  if (phase === "results" && seconds !== null && seconds > 0) {
    if (breakKind === "training_end") {
      return `Fin de l’entraînement dans : ${seconds}s`;
    }
    if (breakKind === "tournament_end") {
      return `Retour au salon dans : ${seconds}s`;
    }
    return `Départ dans : ${seconds}s`;
  }
  if (roundPreparing || roundStartDelayed) {
    return "Grille en préparation, démarrage imminent...";
  }
  if (seconds !== null) {
    if (breakKind === "training_end") {
      return `Fin de l’entraînement dans : ${seconds}s`;
    }
    if (breakKind === "tournament_end") {
      return `Retour au salon dans : ${seconds}s`;
    }
    return `Départ dans : ${seconds}s`;
  }
  if (serverStatus === "break" || phase === "results") {
    return "Manche terminée, attente de la prochaine manche...";
  }
  return "En attente de la prochaine manche...";
}
