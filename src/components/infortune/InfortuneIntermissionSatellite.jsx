import React from "react";
import { createPortal } from "react-dom";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import "./infortuneIntermission.css";
import InfortuneExchangePanel from "./InfortuneExchangePanel.jsx";
import { RELEASE_SCOPE } from "../../../shared/releaseScope.js";

const Stage = React.lazy(() => import("./InfortuneIntermissionStage.jsx"));
class StageBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.feature.complete(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function InfortuneIntermissionSatellite(props) {
  return RELEASE_SCOPE.infortuneTournament ? <ActiveIntermission {...props} /> : null;
}

function ActiveIntermission({ muted = false }) {
  const feature = useFeatureRuntime("infortune");
  const state = useFeatureSelector(feature, value => value);
  const commands = React.useMemo(() => ({ complete: result => feature.complete(result, state.key),
    recordResult: result => feature.recordResult(result, state.key),
    chooseExchange: target => feature.chooseExchange(target, state.key),
    launched: () => feature.launched(state.key) }), [feature, state.key]);
  const dialog = React.useRef(null);
  React.useEffect(() => {
    if (!state.visible) return;
    const previousFocus = document.activeElement, root = document.getElementById("root"), inert = root?.inert;
    if (root) root.inert = true;
    dialog.current?.focus();
    return () => { if (root) root.inert = inert; if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true }); };
  }, [state.visible]);
  if (!state.visible) return null;
  return createPortal(<section ref={dialog} tabIndex={-1} className="infortune-intermission" role="dialog" aria-modal="true" aria-label="La roue de l’infortune">
    <header><strong>La roue de l’infortune</strong><span>{state.economy
      ? state.economy.hidden ? "Cagnottes masquées · manche 4" : `Ta cagnotte : ${(state.economy.members[state.plateau?.self.id]?.bank ?? 0).toLocaleString("fr-FR")} €`
      : "La manche est terminée"}</span></header>
    {state.economyError && <p role="alert">{state.economyError} <button onClick={() => feature.retry()}>Réessayer</button></p>}
    {state.stage === "seating" ? <div className="infortune-intermission__waiting" role="status">
      <strong>Les candidats rejoignent le plateau…</strong>
      <p>Composition des groupes pour cette manche.</p>
    </div> : state.stage === "waiting" ? <div className="infortune-intermission__waiting" role="status">
      <strong>{state.result?.label || "La manche est terminée"}</strong>
      <p>{state.plateauStatus === "absent" ? "Tu rejoindras un plateau à la prochaine manche. Les résultats arrivent…" : "Les résultats arrivent…"}</p>
    </div> : <StageBoundary key={state.key} feature={commands}>
      <React.Suspense fallback={<p className="infortune-intermission__waiting">Installation du plateau…</p>}>
        <Stage feature={commands} muted={muted} plateau={state.plateau} economy={state.economy} stage={state.stage} />
      </React.Suspense>
    </StageBoundary>}
    <InfortuneExchangePanel stage={state.stage} plateau={state.plateau} economy={state.economy} onChoose={commands.chooseExchange} />
  </section>, document.body);
}
