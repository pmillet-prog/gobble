import React from "react";
import { createPortal } from "react-dom";
import { useFeatureRuntime, useFeatureSelector } from "../../../app/react/useFeatureRuntime.js";
import { useApplicationSelector } from "../../../app/react/ApplicationRuntimeProvider.jsx";
import { INFORTUNE_CLIENT_ENABLED } from "../infortuneAvailability.js";
import InfortuneGameSurface from "../../../components/infortune/InfortuneGameSurface.jsx";
import Standings from './TournamentWheelStandings.jsx';
import FinaleIntro, { preloadFinaleIntro } from '../../../components/infortune/finale/FinaleIntro.jsx';
import { INFORTUNE_FINALE_VICTORY_POINTS } from '../../../../shared/infortuneTournamentFinale.js';
import "./tournamentWheelFinale.css";
import InfortuneSocialDock, { InfortuneSocialDockContext } from '../../../components/infortune/InfortuneSocialDock.jsx';
import { useWheelOverlayLayer } from '../useWheelOverlayLayer.js';
import FinaleSettingsButton from '../../../components/infortune/FinaleSettingsButton.jsx';
import useFinaleWinSound from './useFinaleWinSound.js';

const loadFinale = () => import("../../../components/infortune/finale/InfortuneFinale.jsx");
const Finale = React.lazy(loadFinale);
const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;


function ActiveFinale() {
  const feature = useFeatureRuntime("infortuneFinale");
  const state = useFeatureSelector(feature, value => value);
  const selfNick = useApplicationSelector(value => value.session.nickname);
  useFinaleWinSound(feature, selfNick, !!state.finale && state.phase !== 'idle');
  const visible = ["intro", "playing", "result", "ranking", "loading"].includes(state.phase);
  React.useEffect(() => {
    if (!state.finale) return;
    preloadFinaleIntro();
    void loadFinale().catch(() => {});
  }, [state.finale?.tournamentId]);
  const dialog = React.useRef(null);
  useWheelOverlayLayer(visible, dialog);
  if (!visible) return null;
  return createPortal(<InfortuneSocialDockContext.Provider value={<InfortuneSocialDock />}><section className="tournament-wheel-finale" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Finale de la roue">
    {state.phase === 'intro' ? <FinaleIntro key={state.finale.tournamentId} elapsedMs={state.introElapsedMs} durationMs={state.finale.startsAt - state.finale.introStartsAt} />
      : state.phase === "loading" ? <InfortuneGameSurface variant="game"><p role="status">Installation de la finale…</p></InfortuneGameSurface>
      : state.phase === "playing" || state.phase === 'result' ? <React.Suspense fallback={<InfortuneGameSurface variant="game"><p>Installation de la finale…</p></InfortuneGameSurface>}>
      <Finale controller={state.controller} settingsButton={<FinaleSettingsButton />} subtitle={`Finale · ${INFORTUNE_FINALE_VICTORY_POINTS} points à gagner`} onRewardLand={feature.landReward} onContinue={state.phase === 'result' ? feature.continueToRanking : undefined} resultSeconds={state.resultSeconds}
        actions={state.phase === 'result' ? <strong>Finale terminée</strong> : <strong className="wheel-finale-clock" role="timer" aria-label={`${state.seconds} secondes restantes`}>{clock(state.seconds)}</strong>} />
    </React.Suspense> : <InfortuneGameSurface variant="game" title="Mini-tournoi" subtitle="Classement général" actions={<FinaleSettingsButton />}>
      <Standings finale={state.finale} controller={state.controller} seconds={state.seconds} selfNick={selfNick} />
    </InfortuneGameSurface>}
    {state.error && <div className="wheel-finale-connection" role="alert">{state.error} <button onClick={feature.retry}>Réessayer</button></div>}
  </section></InfortuneSocialDockContext.Provider>, document.body);
}

export default function TournamentWheelFinaleSatellite() {
  return INFORTUNE_CLIENT_ENABLED ? <ActiveFinale /> : null;
}
