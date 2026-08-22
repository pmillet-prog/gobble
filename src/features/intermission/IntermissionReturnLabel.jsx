import React from "react";

import { useIntermissionCountdown } from "./useIntermissionCountdown.js";

export default function IntermissionReturnLabel() {
  const remainingSeconds = useIntermissionCountdown();
  return Number.isFinite(remainingSeconds)
    ? `Retour au salon dans : ${Math.max(0, Number(remainingSeconds))}s`
    : "Retour au salon imminent...";
}
