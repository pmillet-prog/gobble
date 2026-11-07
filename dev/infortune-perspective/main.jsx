import React from "react";
import { createRoot } from "react-dom/client";
import { LaunchControls } from "./LaunchControls.jsx";
import { LaunchFeedback } from "./LaunchFeedback.jsx";
import { SkillShotOverlay } from "./SkillShotOverlay.jsx";
import { GESTURE_MODES } from "../../src/features/infortune/wheelSkillShot.js";
import { STAGE_CAMERA } from "./projection.js";
import { usePerspectiveWheel } from "./usePerspectiveWheel.js";
import { WheelCanvas } from "./WheelCanvas.jsx";
import { ReflectionControls } from "./ReflectionControls.jsx";
import { PawlControls } from "./PawlControls.jsx";
import { ActorShadeControls } from "./ActorShadeControls.jsx";
import { DEFAULT_REFLECTIONS } from "./sphericalReflections.js";
import { CameraTimeline } from "./CameraTimeline.jsx";
import { CameraControls } from "./CameraControls.jsx";
import { useCameraTimeline } from "./useCameraTimeline.js";
import { useWheelSoundtrack } from "./useWheelSoundtrack.js";
import { ResultSoundControls } from "./ResultSoundControls.jsx";
import { PerformanceControls } from "./PerformanceControls.jsx";
import { StageContestantControls, useStageContestants } from "./StageContestantControls.jsx";
import { useExchangeWorkshop, ExchangeWorkshopControls, ExchangeWorkshopChoice } from "./ExchangeWorkshop.jsx";
import "./preview.css";

const WorkshopTournament = import.meta.env.DEV ? React.lazy(() => import("./WorkshopTournament.jsx")) : null;
const WheelPlayPreview = React.lazy(() => import("./WheelPlayPreview.jsx"));

function PerspectiveWorkshop({ casting, onStartTournament }) {
  const [camera, setCamera] = React.useState(STAGE_CAMERA);
  const [gestureMode, setGestureMode] = React.useState("power");
  const [reflections, setReflections] = React.useState(DEFAULT_REFLECTIONS);
  const [size, setSize] = React.useState({ width: 720, height: 554 });
  const exchange = useExchangeWorkshop(casting.contestants);
  const wheel = usePerspectiveWheel(size, reflections, { contestants: casting.contestants, exchangeEnabled: exchange.enabled, gestureMode,
    banks: exchange.economy, onResult: exchange.result, selectedContestant: exchange.selectedId,
    onChoose: exchange.choosing ? exchange.select : null });
  const introAudio = useWheelSoundtrack(wheel.muted, wheel.audioEvents);
  const stageReady = wheel.stageStatus.phase === "ready" && !wheel.renderError;
  const timeline = useCameraTimeline({ applyCamera: wheel.setCamera, commitCamera: setCamera,
    stageReady: stageReady && introAudio.ready, spinProgress: wheel.spinProgress, setInputLocked: wheel.setInputLocked,
    syncIntroAudio: introAudio.sync });
  React.useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(wheel.scene.current);
    return () => observer.disconnect();
  }, [wheel.scene]);
  const { phase } = wheel.view;
  const busy = !["ready", "finished"].includes(phase);
  return <main className="perspective-workshop">
    <nav className="perspective-workshop__nav"><span className="perspective-workshop__brand">gobble<span>✳</span></span>
      <span>ATELIER {wheel.flat ? "2D" : "3D"}</span><button className="perspective-workshop__again perspective-workshop__again--top" type="button"
        disabled={Boolean(wheel.renderError) || busy || !wheel.view.result} onClick={() => { exchange.reset(); wheel.reset(); timeline.beginRound(); }}>Un autre tour ↻</button>
      <div className="perspective-workshop__nav-links"><a href="/">← Accueil du jeu</a><a href="/dev/infortune/index.html">Maquette d’origine ↗</a></div></nav>
    <header className="perspective-workshop__heading"><p>LA ROUE DE L’INFORTUNE</p><h1>Bienvenue <em>sur le plateau.</em></h1>
      <p>{wheel.flat ? "La roue en vue légère, avec les mêmes lancers et bonus." : "Un présentateur, deux candidats et une roue qui n’en fait qu’à sa tête."}</p></header>
    <div className="perspective-workshop__layout">
      <section className="perspective-workshop__viewport" aria-label="Vue en perspective de la roue">
        <div className="perspective-workshop__view-label"><span>{wheel.flat ? "LA ROUE · 2D" : "LE PLATEAU"}</span><span>{casting.contestants.map(player => player.nick).join(" · ")}</span></div>
        <div ref={wheel.scene} className="perspective-workshop__scene" data-input-locked={wheel.inputLocked} data-exchanging={exchange.choosing} {...wheel.wheelEvents}>
          <WheelCanvas wheel={wheel} label={wheel.gestureOnly ? "Roue de l’infortune. Faites glisser la roue pour lancer."
            : "Roue de l’infortune. Faites glisser la roue pour lancer, ou utilisez le bouton de lancer."} />
          <LaunchFeedback view={wheel.view} gauges={wheel.gauges} />
          <SkillShotOverlay wheel={wheel} />
          {wheel.inputLocked && stageReady && introAudio.ready && phase === "ready"
            && <p className="perspective-workshop__intro-lock" role="status">Le lancer sera disponible à la fin de l’intro.</p>}
          {stageReady && !introAudio.ready && <div className="perspective-workshop__intro-start">
            {introAudio.status === "blocked"
              ? <button type="button" onClick={introAudio.unlock}>Entrer sur le plateau <small>Avec le son de l’intro</small></button>
              : <p role="status">Chargement du générique…</p>}
          </div>}
          {!wheel.renderError && wheel.stageStatus.phase !== "ready" && <div className="perspective-workshop__stage-status" role="status"><p>{wheel.stageStatus.message}</p>
            {!wheel.flat && <button type="button" onClick={() => wheel.performance.choose("flat")}>Passer en 2D maintenant</button>}</div>}
          {wheel.renderError && <div className="perspective-workshop__error" role="alert"><p>{wheel.renderError}</p><button type="button" onClick={() => window.location.reload()}>Recharger l’atelier</button></div>}
          <ExchangeWorkshopChoice preview={exchange} contestants={casting.contestants} wheel={wheel} />
        </div>
        <div className="perspective-workshop__foreground"><span />CURSEUR AU PREMIER PLAN<span /></div>
        <p className="perspective-workshop__gesture"><strong>{GESTURE_MODES[gestureMode].label}.</strong> {GESTURE_MODES[gestureMode].instructions}</p>
      </section>
      <aside className="perspective-workshop__controls">
        {onStartTournament && <section className="perspective-workshop__camera">
          <h2>Mini-tournoi complet</h2><p className="perspective-workshop__camera-note">Quatre lancers, les cagnottes des trois candidats, les échanges au quatrième tour, puis la finale.</p>
          <button className="perspective-workshop__launch" type="button" disabled={busy || timeline.transport.playing}
            onClick={onStartTournament}>Simuler un mini-tournoi complet</button>
        </section>}
        <LaunchControls wheel={wheel} gestureMode={gestureMode} onGestureModeChange={setGestureMode} />
        <ExchangeWorkshopControls preview={exchange} disabled={busy || timeline.transport.playing || !stageReady}
          onChange={enabled => { exchange.reset(); exchange.setEnabled(enabled); wheel.reset(); timeline.beginRound(); }} />
        <PerformanceControls performance={wheel.performance} disabled={busy || timeline.transport.playing} />
        <StageContestantControls value={casting.selection} onChange={casting.setSelection} disabled={busy || timeline.transport.playing || !stageReady} />
        {!wheel.flat && <CameraTimeline editor={timeline} disabled={!stageReady || Boolean(wheel.renderError)} />}
        <ResultSoundControls soundtrack={introAudio} disabled={!introAudio.ready || busy || timeline.transport.playing || wheel.muted || Boolean(wheel.renderError)} />
        {!wheel.flat && <><CameraControls camera={camera} editor={timeline} />
          <ReflectionControls focal={camera.focal} value={reflections} onChange={setReflections} />
          <ActorShadeControls value={wheel.actorShade} onChange={wheel.setActorShade} /></>}
        <PawlControls value={wheel.pawlMode} onChange={wheel.selectPawlMode} disabled={busy || Boolean(wheel.renderError)} />
      </aside>
    </div>
    <footer className="perspective-workshop__footer"><span>APERÇU SÉPARÉ · MÊME PHYSIQUE</span><p>La maquette d’origine est conservée. Le cadrage et la focale n’agissent pas sur le lancer.</p></footer>
  </main>;
}

function WorkshopEntry() {
  const casting = useStageContestants();
  const [tournament, setTournament] = React.useState(() => import.meta.env.DEV && new URLSearchParams(location.search).get("tournoi") === "1");
  const [rules, setRules] = React.useState();
  return tournament && WorkshopTournament
    ? <React.Suspense fallback={<main className="perspective-workshop"><p role="status">Préparation du mini-tournoi…</p></main>}>
      <WorkshopTournament contestants={casting.contestants} rules={rules} onRulesChange={setRules} onClose={() => setTournament(false)} />
    </React.Suspense>
    : new URLSearchParams(location.search).get("edition") === "1"
      ? <PerspectiveWorkshop casting={casting} onStartTournament={import.meta.env.DEV ? () => setTournament(true) : null} />
      : <React.Suspense fallback={<p role="status">Préparation du plateau…</p>}><WheelPlayPreview casting={casting}
        onStartTournament={import.meta.env.DEV ? () => setTournament(true) : null} /></React.Suspense>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><WorkshopEntry /></React.StrictMode>);
