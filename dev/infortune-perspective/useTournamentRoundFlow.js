import React from "react";
import { INFORTUNE_EXCHANGE_CHOICE_MS, INFORTUNE_EXCHANGE_STEP_MS } from "../../shared/infortuneExchangePlan.js";
import { INFORTUNE_LAUNCH_WINDOW_MS } from '../../shared/infortuneIntermission.js';

export const WORKSHOP_LAUNCH_MS = INFORTUNE_LAUNCH_WINDOW_MS;

// Absolute deadlines survive a background tab; no timer is owned by the view
// of the 3D scene. The live room will supply its authoritative deadlines.
export function useTournamentRoundFlow({ controller, state, wheel, presentationReady, soundtrack }) {
  const [launchUntil, setLaunchUntil] = React.useState(null);
  const [choiceUntil, setChoiceUntil] = React.useState(null);
  const [automatic, setAutomatic] = React.useState(false);
  const latest = React.useRef(null);
  latest.current = { wheel, controller };
  const launched = ["spinning", "finished"].includes(wheel.view.phase) || state.self.spin !== "pending";
  React.useEffect(() => {
    if (!launchUntil && !wheel.inputLocked && wheel.stageStatus.phase === "ready" && !launched) setLaunchUntil(Date.now() + WORKSHOP_LAUNCH_MS);
  }, [launchUntil, wheel.inputLocked, wheel.stageStatus.phase, launched]);
  React.useEffect(() => {
    if (!launchUntil || launched) return;
    let timer;
    const run = () => {
      if (latest.current.wheel.autoLaunch()) setAutomatic(true);
      else timer = setTimeout(run, 250); // Resume an expired launch after an OS pause.
    };
    timer = setTimeout(run, Math.max(0, launchUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [launchUntil, launched]);
  React.useEffect(() => {
    if (state.choosing && presentationReady && !choiceUntil) setChoiceUntil(Date.now() + INFORTUNE_EXCHANGE_CHOICE_MS);
  }, [state.choosing, presentationReady, choiceUntil]);
  React.useEffect(() => {
    if (!choiceUntil || !state.choosing) return;
    const timer = setTimeout(() => controller.chooseAutomaticExchange(), Math.max(0, choiceUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [choiceUntil, state.choosing, controller]);
  React.useEffect(() => {
    if (!state.activeExchange || !presentationReady) return;
    const timer = setTimeout(() => controller.advanceExchange(state.exchangeIndex), INFORTUNE_EXCHANGE_STEP_MS);
    soundtrack.exchange(state.activeExchange, state.selfId, `${state.round}:${state.exchangeIndex}`);
    return () => clearTimeout(timer);
  }, [state.activeExchange, state.exchangeIndex, state.selfId, state.round, controller, presentationReady, soundtrack.exchange]);
  return { launchUntil: launched ? null : launchUntil, choiceUntil, automatic };
}
