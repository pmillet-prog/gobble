import React from "react";
import { WHEEL_DIAGNOSTIC_STEPS, WHEEL_DIAGNOSTIC_VERSION } from "../../../../shared/wheelDiagnostic.js";
import { createWheelDiagnosticRun } from "./createWheelDiagnosticRun.js";
import WheelDiagnosticDialog from "./WheelDiagnosticDialog.jsx";
import WheelDiagnosticSummary from "./WheelDiagnosticSummary.jsx";
import WheelDiagnosticSurvey from "./WheelDiagnosticSurvey.jsx";
import { WHEEL_DIAGNOSTIC_DRAFT_KEY, readWheelDiagnosticDraft, saveWheelDiagnosticDraft } from "./wheelDiagnosticDraft.js";
import { wheelGraphicsDevice } from "../graphics/wheelGraphicsStorage.js";

const Stage = React.lazy(() => import("./WheelDiagnosticStage.jsx"));
class StageBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? <p role="alert">L’affichage n’a pas pu démarrer.</p> : this.props.children; }
}
function createSession() {
  return { version: WHEEL_DIAGNOSTIC_VERSION, id: globalThis.crypto?.randomUUID?.() || `wheel-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    startedAt: new Date().toISOString(), environment: { deviceId: wheelGraphicsDevice(), userAgent: navigator.userAgent, platform: navigator.platform,
      width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio || 1,
      cores: navigator.hardwareConcurrency || null, memory: navigator.deviceMemory || null, touchPoints: navigator.maxTouchPoints || 0 } };
}

export default function WheelTraining() {
  const [restored, setRestored] = React.useState(() => { try { return readWheelDiagnosticDraft(sessionStorage); } catch { return null; } });
  const [session, setSession] = React.useState(() => restored ? { version: restored.version, id: restored.id, startedAt: restored.startedAt, environment: restored.environment } : createSession());
  const [runs, setRuns] = React.useState(restored?.runs || []);
  const [index, setIndex] = React.useState(0), [screen, setScreen] = React.useState(restored ? "survey" : "welcome"), [muted, setMuted] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  const active = React.useRef(null), finishRef = React.useRef(null);
  const step = WHEEL_DIAGNOSTIC_STEPS[index];
  const finish = React.useCallback((status, reason = "") => {
    const run = active.current;
    if (!run) return;
    active.current = null;
    setRuns(previous => [...previous, run.finish(status, reason)]); setScreen("between");
  }, []);
  finishRef.current = finish;
  React.useEffect(() => { if (runs.length && screen !== "survey") saveWheelDiagnosticDraft({ ...session, runs }); }, [runs, screen, session]);
  const start = (target, previousRuns = runs) => {
    const profile = WHEEL_DIAGNOSTIC_STEPS[target].profile;
    const collector = createWheelDiagnosticRun({ profile, attempt: previousRuns.filter(run => run.profile === profile).length + 1 });
    collector.profile = profile;
    collector.onError = message => finishRef.current("error", message);
    active.current = collector; setIndex(target); setTick(0); setScreen("running");
  };
  const replay = () => {
    // A new report must not reuse the submitted id or the previous attempt counts.
    try { sessionStorage.removeItem(WHEEL_DIAGNOSTIC_DRAFT_KEY); } catch {}
    setRestored(null); setSession(createSession()); setRuns([]);
    start(0, []);
  };
  React.useEffect(() => {
    if (screen !== "running") return;
    const collector = active.current;
    const visibility = () => collector.visibility(document.hidden);
    visibility(); document.addEventListener("visibilitychange", visibility);
    let observer;
    try {
      if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
        observer = new PerformanceObserver(list => list.getEntries().forEach(entry => collector.longTask(entry.duration)));
        observer.observe({ type: "longtask" }); collector.supportLongTasks(true);
      }
    } catch {}
    const timer = setInterval(() => {
      setTick(value => value + 1);
      const snapshot = collector.snapshot();
      if (!document.hidden && collector.loading() && collector.elapsed() - snapshot.hiddenMs > 45000) {
        finishRef.current("timeout", "Le plateau n’était toujours pas prêt après 45 secondes au premier plan.");
      }
    }, 1000);
    return () => { clearInterval(timer); observer?.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, [screen, index, runs.length]);
  const last = runs.at(-1);
  return <main className="wheel-test">
    <nav className="wheel-test__nav"><a href="/">← Accueil de Gobble</a><span>Entraînement · Diagnostic de la roue</span></nav>
    <header className="wheel-test__heading"><p>LA ROUE DE L’INFORTUNE</p><h1>Quel rendu pour ton appareil ?</h1>
      <p>Quatre versions à essayer, un petit retour à la fin. Aucun score ni gain réel.</p></header>
    <ol className="wheel-diagnostic__steps" aria-label="Étapes du diagnostic">{WHEEL_DIAGNOSTIC_STEPS.map((item, i) =>
      <li key={item.profile} aria-current={screen === "running" && index === i ? "step" : undefined} data-done={runs.some(run => run.profile === item.profile)}>{i + 1}. {item.label}</li>)}<li>5. Ton avis</li></ol>
    {screen === "running" && <>
      <h2 className="wheel-diagnostic__current">Passage {index + 1} sur 4 · {step.label}</h2>
      <div className="wheel-diagnostic__skip"><span>Un blocage ou un problème ?</span>
        <button type="button" onClick={() => finish("skipped", "Le joueur a interrompu ce passage.")}>Passer cette version et le signaler</button></div>
      <StageBoundary key={`${index}-${runs.length}`} onError={() => finish("error", "Impossible de charger ou d’afficher cette version.")}>
        <React.Suspense fallback={<div className="wheel-test__card" role="status">Chargement du test… {tick} s</div>}>
          <Stage diagnostic={active.current} onComplete={finish} initiallyMuted={muted} onMutedChange={setMuted} tick={tick} />
        </React.Suspense>
      </StageBoundary>
    </>}
    {screen === "welcome" && <WheelDiagnosticDialog title="Aide-nous à préparer la roue !">
      <p>Ce test nous aide à savoir comment la roue fonctionne sur les ordinateurs et les téléphones des joueurs.</p>
      <ol><li>On commence en <strong>2D</strong> : lance la roue dès qu’elle est prête.</li>
        <li>Une fenêtre te guidera ensuite vers la <strong>3D légère</strong>, la <strong>3D moyenne</strong> et la <strong>3D haute</strong>. Pour chaque version 3D, regarde l’introduction, puis lance la roue.</li>
        <li>À la fin, donne ton avis et envoie le bilan dans Gobble.</li></ol>
      <p>Prévois quelques minutes. Le test mesure le chargement et la fluidité ; tu n’as rien à chronométrer. Si une version bloque, tu peux la passer.</p>
      <p className="wheel-diagnostic__privacy">Le bilan envoyé contiendra tes réponses, les mesures et des informations sur ton navigateur et ton appareil, ainsi que ton pseudo si tu es connecté. Il sera visible uniquement par l’équipe autorisée dans le menu dev.</p>
      <button className="wheel-test__primary" onClick={() => start(0)}>Commencer en 2D</button> <a href="/">Revenir au jeu</a>
    </WheelDiagnosticDialog>}
    {screen === "between" && <WheelDiagnosticDialog title={last?.status === "complete" ? `${step.label} : passage terminé` : `${step.label} : difficulté enregistrée`}>
      <p>{last?.status === "complete" ? "Merci ! Pense à la fluidité, à l’image et au temps de chargement pour le questionnaire final." : "Ce passage sera conservé dans le diagnostic. Tu peux poursuivre les essais ou donner ton avis dès maintenant."}</p>
      <WheelDiagnosticSummary runs={last ? [last] : []} />
      {index < 3 ? <><h3>À présent : {WHEEL_DIAGNOSTIC_STEPS[index + 1].label}</h3><p>{WHEEL_DIAGNOSTIC_STEPS[index + 1].description}</p>
        <button className="wheel-test__primary" onClick={() => start(index + 1)}>Essayer la {WHEEL_DIAGNOSTIC_STEPS[index + 1].label}</button></>
        : <button className="wheel-test__primary" onClick={() => setScreen("survey")}>Répondre au petit questionnaire</button>}
      {runs.filter(run => run.profile === step.profile).length < 2 && <button className="wheel-test__quiet" onClick={() => start(index)}>Revoir cette version une fois</button>}
      {index < 3 && <button className="wheel-test__quiet" onClick={() => setScreen("survey")}>Arrêter les essais et donner mon avis</button>}
    </WheelDiagnosticDialog>}
    {screen === "survey" && <WheelDiagnosticSurvey key={session.id} session={session} runs={runs} initialSurvey={restored?.survey} onReplay={replay} />}
  </main>;
}
