import React from "react";
import { usePerspectiveWheel } from "../../../../dev/infortune-perspective/usePerspectiveWheel.js";
import { WheelCanvas } from "../../../../dev/infortune-perspective/WheelCanvas.jsx";
import { DEFAULT_REFLECTIONS } from "../../../../dev/infortune-perspective/sphericalReflections.js";
import { useWheelSoundtrack } from "../../../../dev/infortune-perspective/useWheelSoundtrack.js";
import { LaunchFeedback } from "../../../../dev/infortune-perspective/LaunchFeedback.jsx";
import { LaunchMeters } from "../../../../dev/infortune-perspective/LaunchMeters.jsx";
import { LaunchButton } from "../../../components/infortune/LaunchButton.jsx";
import { PRESENTER_IDENTITIES } from "../../../../shared/presenterIdentities.js";
import { useInfortuneCamera } from "../useInfortuneCamera.js";
import { GESTURE_MODES } from "../wheelSkillShot.js";
import { DiagnosticMetrics } from "./WheelDiagnosticSummary.jsx";
import WheelLoadingDetails from "./WheelLoadingDetails.jsx";

const CONTESTANTS = ["pivot", "lepers"].map(presenterKey => ({
  id: `wheel-test-${presenterKey}`, presenterKey, isBot: true, nick: PRESENTER_IDENTITIES[presenterKey].nick,
}));

// Each diagnostic passage owns and releases its scene, controller and audio.
// The outer sequence selects a fixed quality; the browser may retain assets.
export default function WheelDiagnosticStage({ diagnostic, onComplete, initiallyMuted = false, onMutedChange }) {
  const [size, setSize] = React.useState({ width: 720, height: 554 });
  const gestureMode = "power";
  const wheel = usePerspectiveWheel(size, DEFAULT_REFLECTIONS, { contestants: CONTESTANTS, gestureMode, diagnostic, muted: initiallyMuted });
  const sound = useWheelSoundtrack(wheel.muted, wheel.audioEvents);
  useInfortuneCamera(wheel, sound, { complete: () => onComplete("complete"),
    onCameraFrame: state => { if (state.sequence === "intro" && state.playing) diagnostic.intro(); } }, { pauseWhenHidden: true });
  React.useEffect(() => { diagnostic.context({ size, gestureMode, audioStatus: wheel.muted ? "muted" : sound.status }); }, [diagnostic, size, gestureMode, sound.status, wheel.muted]);
  const toggleSound = () => { wheel.toggleSound(); onMutedChange(!wheel.muted); };
  React.useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(wheel.scene.current);
    return () => observer.disconnect();
  }, [wheel.scene]);
  const { phase, result, launchQuality: quality } = wheel.view;
  const preparing = wheel.stageStatus.phase !== "ready";
  return <div className="wheel-test__layout">
      <section className="wheel-test__plateau" aria-label="Plateau de la roue">
        <p className="wheel-diagnostic__guide" role="status">{preparing ? "Le plateau se prépare. Observe le temps d’attente." : !wheel.flat && !sound.ready ? "Entre sur le plateau ou commence sans le son." : wheel.inputLocked ? (wheel.flat ? "La roue se prépare…" : "Observe l’introduction. Tu pourras lancer juste après.") : phase === "spinning" ? "La roue tourne : observe si l’animation reste fluide." : phase === "finished" ? "Le résultat arrive, puis on te présente la suite du test." : wheel.gestureOnly ? "À toi ! Glisse sur le bord coloré puis relâche pour lancer." : "À toi ! Glisse sur le bord coloré puis relâche, ou utilise « Lancer au clic »."}</p>
        <div className="wheel-test__scene" ref={wheel.scene} data-input-locked={wheel.inputLocked} {...wheel.wheelEvents}>
          <WheelCanvas wheel={wheel} label={wheel.gestureOnly ? "Roue de l’infortune. Glisse sur le bord pour lancer."
            : "Roue de l’infortune. Glisse pour lancer ou utilise le bouton de lancer au clic."} />
          <LaunchFeedback view={wheel.view} gauges={wheel.gauges} bonusCaption="BONUS FICTIF" />
          {wheel.renderError ? <div className="wheel-test__notice" role="alert"><p>La roue n’a pas pu s’afficher. Le diagnostic conserve cette information.</p></div>
            : preparing ? <div className="wheel-test__notice" role="status"><p>{wheel.stageStatus.message}</p>
              <p>La première préparation peut être plus longue. Tu peux interrompre ce passage avec le bouton au-dessus du test.</p></div>
            : !wheel.flat && !sound.ready ? <div className="wheel-test__notice">
              {sound.status === "blocked" ? <button onClick={sound.unlock}>Entrer sur le plateau</button> : <p role="status">Préparation du son…</p>}
              <button className="wheel-test__quiet" onClick={toggleSound}>Commencer sans le son</button></div>
              : !wheel.flat && wheel.inputLocked && phase === "ready" && <p className="wheel-test__intro" role="status">Le lancer sera disponible à la fin de l’intro.</p>}
        </div>
        <div className="wheel-test__actions">
          <LaunchButton className="wheel-test__primary" wheel={wheel}>{phase === "aiming" ? "Lancer !" : "Lancer au clic"}</LaunchButton>
          <button type="button" onClick={toggleSound} aria-pressed={!wheel.muted}>Son {wheel.muted ? "coupé" : "activé"}</button>
          {phase === "aiming" && <button className="wheel-test__quiet" onClick={wheel.cancelLaunch}>Annuler</button>}
        </div>
        {!wheel.gestureOnly && <p className="wheel-test__click-help">Au clic : démarre la jauge, puis clique à nouveau pour bloquer la puissance. Au clavier : Espace ou Entrée.</p>}
      </section>
      <aside className="wheel-test__sidebar">
        <section className="wheel-test__card" aria-label="Comment lancer la roue">
          <h2>{preparing ? "Patiente pendant la préparation" : wheel.inputLocked ? (wheel.flat ? "La roue se prépare…" : "Observe l’introduction") : phase === "finished" ? "Le résultat arrive…" : phase === "spinning" ? "Observe la roue jusqu’à l’arrêt" : "À toi de lancer"}</h2>
          <p>Glisse sur le bord coloré de la roue, puis relâche avec un peu de vitesse.{!wheel.gestureOnly && " Tu peux aussi utiliser « Lancer au clic »."}</p>
          <p className="wheel-test__instructions">{GESTURE_MODES[gestureMode].instructions}</p>
          <LaunchMeters game={wheel.view.launchGame} gauges={wheel.gauges} />
          <div className="wheel-test__verdict" data-quality={quality?.kind} role="status">
            {quality ? <><strong>{quality.label}{quality.bonus ? ` · +${quality.bonus}` : ""}</strong><p>{quality.detail || (quality.bonus ? "Bonus fictif obtenu pour ce lancer." : "Vise la zone verte pour un bonus.")}</p></>
              : <p>{wheel.view.message || (wheel.inputLocked ? "Le plateau se prépare…" : "Attrape la roue pour essayer ton geste.")}</p>}
          </div>
          <div className="wheel-test__result" role="status"><span>{phase === "spinning" ? "LA ROUE TOURNE…" : "RÉSULTAT DU LANCER"}</span>
            <strong>{result?.label || "—"}</strong></div>
        </section>
        <section className="wheel-test__card"><h2>Mesures en cours</h2><DiagnosticMetrics run={diagnostic.snapshot()} /><WheelLoadingDetails run={diagnostic.snapshot()} />
          <p>Tu n’as rien à noter : les mesures seront jointes à ton retour.</p></section>
      </aside>
    </div>;
}
