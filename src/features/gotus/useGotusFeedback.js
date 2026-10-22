import React from "react";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { createGotusFeedbackPlayer } from "./gotusFeedbackAudio.js";

const SOUND_FIELDS = ["isSfxMuted"];
export default function useGotusFeedback({ active, controller, boardRef, enabled }) {
  const preferences = useFeatureRuntime("preferences");
  const { isSfxMuted } = useFeatureFields(preferences, SOUND_FIELDS);
  const playerRef = React.useRef(null);
  const enabledRef = React.useRef(enabled && !isSfxMuted);
  enabledRef.current = enabled && !isSfxMuted;
  React.useEffect(() => {
    if (!active) return undefined;
    let neutralCell = null;
    const player = createGotusFeedbackPlayer({ onVictoryFrame: frame => {
      if (neutralCell) delete neutralCell.dataset.victoryNeutral;
      neutralCell = frame ? boardRef.current?.querySelector(`[data-gotus-row="${frame.row}"][data-gotus-column="${frame.column}"]`) : null;
      if (neutralCell) neutralCell.dataset.victoryNeutral = "true";
    } });
    playerRef.current = player;
    player.setEnabled(enabledRef.current);
    const unsubscribe = controller.subscribeCue(player.cue);
    return () => { unsubscribe(); player.dispose(); if (playerRef.current === player) playerRef.current = null; };
  }, [active, controller, boardRef]);
  React.useEffect(() => playerRef.current?.setEnabled(enabled && !isSfxMuted), [enabled, isSfxMuted]);
}
