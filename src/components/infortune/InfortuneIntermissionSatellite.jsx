import React from "react";
import { createPortal } from "react-dom";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import "./infortuneIntermission.css";
import InfortuneGameSurface, { InfortunePreparationContext } from "./InfortuneGameSurface.jsx";
import InfortuneCountdown from "./InfortuneCountdown.jsx";
import { INFORTUNE_CLIENT_ENABLED } from "../../features/infortune/infortuneAvailability.js";
import InfortuneStageTransition from './InfortuneStageTransition.jsx';
import InfortuneLeaderWalk, { usePreloadLeaderScene } from './InfortuneLeaderWalk.jsx';
import InfortuneSocialDock, { InfortuneSocialDockContext } from './InfortuneSocialDock.jsx';
import { useWheelOverlayLayer } from '../../features/infortune/useWheelOverlayLayer.js';

const Stage = React.lazy(() => import("./InfortuneIntermissionStage.jsx"));
class StageBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.feature.complete(); }
  componentDidUpdate(previous) { if (this.state.failed && previous.preparing && !this.props.preparing) this.setState({ failed: false }); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function InfortuneIntermissionSatellite(props) {
  return INFORTUNE_CLIENT_ENABLED ? <ActiveIntermission {...props} /> : null;
}

function ActiveIntermission({ muted = false, onOpenChat, onOpenPlayers }) {
  const feature = useFeatureRuntime("infortune");
  const state = useFeatureSelector(feature, value => value);
  usePreloadLeaderScene(state.closing, state.visible || !!state.preparation);
  const commands = React.useMemo(() => ({ complete: result => feature.complete(result, state.key),
    landResult: () => feature.landResult(state.key),
    landLaunch: () => feature.landLaunch(state.key),
    recordResult: result => feature.recordResult(result, state.key),
    ready: () => feature.ready(state.key),
    chooseExchange: target => feature.chooseExchange(target, state.key),
    launched: value => feature.launched(value, state.key) }), [feature, state.key]);
  const dialog = React.useRef(null);
  useWheelOverlayLayer(state.visible, dialog);
  const preparing = !state.visible && !!state.preparation;
  const result = state.economy?.members?.[state.plateau?.self?.id]?.result || state.result;
  const waitingWithoutPlateau = state.stage === 'waiting' && !state.plateau;
  const viewKey = !state.visible && !preparing ? 'closed' : `${state.roomId}:${state.roundId}:${state.stage === 'leaders' ? 'leaders' : waitingWithoutPlateau ? 'waiting' : 'wheel'}`;
  const dock = onOpenChat ? <InfortuneSocialDock onOpenChat={onOpenChat} onOpenPlayers={onOpenPlayers} /> : null;
  return createPortal(<InfortuneSocialDockContext.Provider value={dock}><InfortuneStageTransition viewKey={viewKey}>{(state.visible || preparing) && <InfortunePreparationContext.Provider value={preparing}><section ref={dialog} tabIndex={-1}
    inert={preparing ? '' : undefined} aria-hidden={preparing || undefined}
    style={preparing ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
    className="infortune-intermission" role={preparing ? undefined : "dialog"} aria-modal={preparing ? undefined : "true"} aria-label="La roue de l’infortune">
    {state.stage === 'leaders' && state.closing ? <InfortuneLeaderWalk cue={state.closing} bank={state.economy?.members?.[state.plateau?.self?.id]?.bank} />
    : state.stage === "seating" || waitingWithoutPlateau ? <InfortuneGameSurface bank={state.economy?.members?.[state.plateau?.self?.id]?.bank}>
      {state.economyError && <p role="alert">{state.economyError} <button onClick={() => feature.retry()}>Réessayer</button></p>}
      {state.stage === "seating" ? <div className="infortune-intermission__waiting" role="status">
      <strong>Les candidats rejoignent le plateau…</strong>
      <p>Composition des groupes pour cette manche.</p>
    </div> : <div className="infortune-intermission__waiting" role="status">
      <strong>{result?.automatic ? "Ta roue a été lancée automatiquement" : result ? "Ton lancer est terminé" : "La roue est en cours"}</strong>
      {(result?.sector?.label || result?.label) && <p>{result.sector?.label || result.label}</p>}
      {Number.isFinite(result?.after) && <p>Ta cagnotte après le lancer : {result.after.toLocaleString("fr-FR")} €</p>}
      <p>{state.plateauStatus === "absent" ? "Tu rejoindras un plateau à la prochaine manche." : "Les autres candidats terminent leur lancer."}</p>
      {state.nextStartAt && <InfortuneCountdown until={state.nextStartAt} label="Prochaine manche au plus tard dans" />}
    </div>}</InfortuneGameSurface> : <StageBoundary key={`${state.roomId}:${state.roundId}`} feature={commands} preparing={preparing}>
      <React.Suspense fallback={<InfortuneGameSurface><p className="infortune-intermission__waiting">Installation du plateau…</p></InfortuneGameSurface>}>
        <Stage feature={commands} muted={muted} preparing={preparing} plateau={state.plateau || state.preparation?.plateau} economy={state.economy || state.preparation?.economy} groups={state.groups} serverOffset={state.serverOffset} stage={state.stage} launchUntil={state.launchUntil} spinUntil={state.spinUntil} choiceUntil={state.choiceUntil} exchangeReplay={state.exchangeReplay} economyError={state.economyError} onRetry={() => feature.retry()} />
      </React.Suspense>
    </StageBoundary>}
  </section></InfortunePreparationContext.Provider>}</InfortuneStageTransition></InfortuneSocialDockContext.Provider>, document.body);
}
