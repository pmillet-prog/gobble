import React from "react";
import { usePerspectiveWheel } from "../../../dev/infortune-perspective/usePerspectiveWheel.js";
import { WheelCanvas } from "../../../dev/infortune-perspective/WheelCanvas.jsx";
import { DEFAULT_REFLECTIONS } from "../../../dev/infortune-perspective/sphericalReflections.js";
import { useWheelSoundtrack } from "../../../dev/infortune-perspective/useWheelSoundtrack.js";
import { LaunchFeedback } from "../../../dev/infortune-perspective/LaunchFeedback.jsx";
import { LaunchButton } from "./LaunchButton.jsx";
import { useInfortuneCamera } from "../../features/infortune/useInfortuneCamera.js";
import { PerformanceControls } from "../../../dev/infortune-perspective/PerformanceControls.jsx";
import { useInfortuneContestants } from "../../features/infortune/useInfortuneContestants.js";
import InfortuneContestants from "./InfortuneContestants.jsx";

export default function InfortuneIntermissionStage({ feature, muted, plateau, economy, stage }) {
  const { loading, contestants } = useInfortuneContestants(plateau);
  if (loading) return <div className="infortune-intermission__waiting" role="status">Les avatars rejoignent le plateau…</div>;
  return <WheelStage feature={feature} muted={muted} contestants={contestants} economy={economy} stage={stage} />;
}

function WheelStage({ feature, muted, contestants, economy, stage }) {
  const [size, setSize] = React.useState({ width: 720, height: 554 });
  const wheel = usePerspectiveWheel(size, DEFAULT_REFLECTIONS, { muted, onLaunch: feature.launched, onResult: feature.recordResult,
    contestants, exchangeEnabled: economy?.exchangeEnabled, banks: economy,
    onChoose: stage === "exchange" ? feature.chooseExchange : null, inputDisabled: stage !== "wheel" });
  const sound = useWheelSoundtrack(wheel.muted, wheel.audioEvents);
  useInfortuneCamera(wheel, sound, feature);
  const phase = wheel.view.phase;
  React.useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(wheel.scene.current); return () => observer.disconnect();
  }, [wheel.scene]);
  return <>
    <div className="infortune-intermission__scene" ref={wheel.scene} {...wheel.wheelEvents}>
      <WheelCanvas wheel={wheel} label="Roue de l’infortune. Glissez pour lancer la roue." />
      <LaunchFeedback view={wheel.view} gauges={wheel.gauges} bonusCaption="BONUS DU LANCER" />
      {wheel.renderError ? <div className="infortune-intermission__notice" role="alert">
        <p>La roue n’a pas pu s’afficher sur cet appareil.</p><button onClick={() => feature.complete()}>Continuer vers les résultats</button>
      </div> : wheel.stageStatus.phase !== "ready" ? <div className="infortune-intermission__notice" role="status"><p>{wheel.stageStatus.message}</p>
        {!wheel.flat && <button onClick={() => wheel.performance.choose("flat")}>Jouer en 2D maintenant</button>}</div>
        : !wheel.flat && !sound.ready && <div className="infortune-intermission__notice">
          {sound.status === "blocked" ? <button onClick={sound.unlock}>Entrer sur le plateau</button> : <p>Préparation du son…</p>}
        </div>}
    </div>
    {stage === "wheel" && (wheel.flat || economy) && <InfortuneContestants contestants={contestants} economy={economy} />}
    {stage === "wheel" && <><details className="infortune-intermission__display"><summary>Affichage : {wheel.flat ? "2D" : "3D"}</summary>
      <PerformanceControls performance={wheel.performance} disabled={wheel.inputLocked || !["ready", "finished"].includes(phase)} />
    </details>
    <div className="infortune-intermission__controls">
      <p>{wheel.view.message || (phase === "spinning" ? "Le dernier taquet décidera…" : phase === "finished" ? wheel.view.result?.label
        : wheel.inputLocked ? "Le plateau se prépare…" : "Glissez sur la roue, ou lancez au clic.")}</p>
      <LaunchButton wheel={wheel}>{phase === "aiming" ? "Lancer !" : "Lancer au clic"}</LaunchButton>
      <button onClick={wheel.toggleSound} aria-pressed={!wheel.muted}>Son {wheel.muted ? "coupé" : "activé"}</button>
      <button className="infortune-intermission__skip" onClick={() => feature.complete()}>Passer</button>
    </div></>}
  </>;
}
