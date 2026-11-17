import React from "react";
import { createPortal } from "react-dom";
import { createWheelGraphicsSetup } from "./createWheelGraphicsSetup.js";
import { diagnosticProfileLabel, WHEEL_DIAGNOSTIC_STEPS } from "../../../../shared/wheelDiagnostic.js";
import { wheelGraphicsReason } from "../../../../shared/wheelGraphicsRecommendation.js";
import { isWheelGraphicsFallback } from "./wheelGraphicsStorage.js";
import WheelPreviousDiagnostics from "./WheelPreviousDiagnostics.jsx";
import "./wheelGraphicsSetup.css";

const Stage = React.lazy(() => import("./WheelGraphicsMeasureStage.jsx"));
class MeasureBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? <p>Cette version n’a pas pu démarrer.</p> : this.props.children; }
}

export default function WheelGraphicsSetup({ force = false, onComplete }) {
  const [state, setState] = React.useState({ phase: "checking", profile: "detailed" });
  const controller = React.useRef(null), dialog = React.useRef(null), done = React.useRef(onComplete); done.current = onComplete;
  const [manual, setManual] = React.useState("flat");
  React.useEffect(() => {
    const setup = createWheelGraphicsSetup({ onChange: setState, onKnown: value => {
      if (isWheelGraphicsFallback(value) || value?.lastCheck) setState({ phase: "done", recommendation: value });
      else done.current(value);
    } });
    controller.current = setup; void setup.start({ force });
    document.addEventListener("visibilitychange", setup.visibility);
    return () => { document.removeEventListener("visibilitychange", setup.visibility); setup.dispose(); controller.current = null; };
  }, [force]);
  React.useEffect(() => {
    const element = dialog.current, preventCancel = event => event.preventDefault();
    // cancel does not bubble; bind it directly on the portal's dialog as well.
    element.addEventListener("cancel", preventCancel); element.showModal();
    return () => { element.removeEventListener("cancel", preventCancel); element.close(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="wheel-graphics-setup" aria-labelledby="wheel-graphics-title"
    onCancel={event => event.preventDefault()} onKeyDown={event => { if (event.key === "Escape") event.preventDefault(); }}>
    <h1 id="wheel-graphics-title">La roue sur ton appareil</h1>
    {state.phase === "checking" ? <p role="status">Recherche d’une mesure déjà enregistrée…</p>
      : state.phase === "welcome" ? <>
        {state.legacy?.length > 0 ? <>
          <WheelPreviousDiagnostics entries={state.legacy} onChoose={id => controller.current?.useLegacy(id)} />
          <details className="wheel-graphics-setup__manual"><summary>Mesurer un autre appareil ou refaire le test</summary>
            <p>Si aucun bilan ne correspond à cet appareil, tu peux lancer une nouvelle mesure automatique.</p>
            <button type="button" onClick={() => controller.current?.begin()}>Mesurer et choisir l’affichage</button>
          </details>
        </> : <>
        <p>Un contrôle automatique va choisir l’affichage le plus adapté à cet appareil. Tu n’as rien à manipuler pendant la mesure.</p>
        <p>Garde cette fenêtre au premier plan. Si la 3D ne fonctionne pas, tu pourras jouer en 2D avec les mêmes règles et les mêmes gains.</p>
        <p>Tu pourras ensuite changer ce réglage dans Graphismes. Cette mesure reste sur ton appareil.</p>
        <button type="button" onClick={() => controller.current?.begin()}>Mesurer et choisir l’affichage</button>
        </>}
      </> : state.phase === "running" ? <>
        {/* Keep dynamic sentences as single strings: browser translation may replace
            text nodes, so React must update the element's text instead of removing fragments. */}
        <p role="status">{`Essai ${state.index + 1}/3 : ${diagnosticProfileLabel(state.profile)}… Le lancer se fait tout seul.`}</p>
        <MeasureBoundary key={state.profile} onError={() => controller.current?.receive({ profile: state.profile, status: "error" })}>
          <React.Suspense fallback={<p>Préparation de la mesure…</p>}>
            <Stage profile={state.profile} onReady={profile => controller.current?.ready(profile)} onComplete={run => controller.current?.receive(run)} />
          </React.Suspense>
        </MeasureBoundary>
        <p>Le contrôle s’arrête dès qu’un niveau convient. En cas de blocage prolongé, tu pourras continuer en 2D puis réessayer.</p>
      </> : <>
        <p><strong>{`${state.recommendation.reason === "manual" ? "Mode choisi" : isWheelGraphicsFallback(state.recommendation) ? "Affichage provisoire" : "Réglage conseillé"} : ${diagnosticProfileLabel(state.recommendation.profile)}.`}</strong></p>
        <p>{wheelGraphicsReason(state.recommendation)}</p>
        {state.runs?.length > 0 && <p>{`Niveaux essayés : ${state.runs.map(run => diagnosticProfileLabel(run.profile)).join(" → ")}.`}</p>}
        {isWheelGraphicsFallback(state.recommendation) && <p>Le test n’a pas pu mesurer correctement la fluidité. Cela ne signifie pas que ton appareil est trop lent pour la 3D.</p>}
        {state.recommendation.lastCheck && <p>Le nouveau contrôle a été interrompu. Ton précédent réglage mesuré a été conservé.</p>}
        {(isWheelGraphicsFallback(state.recommendation) || state.recommendation.lastCheck) && <button type="button" onClick={() => controller.current?.retry()}>Reprendre la mesure</button>}
        {state.recommendation.reason !== "manual" && <p>Le mode automatique utilisera ce réglage. Un choix manuel déjà fait dans Graphismes reste prioritaire.</p>}
        <button type="button" onClick={() => done.current(state.recommendation)}>Continuer vers Gobble</button>
      </>}
    {state.phase !== "checking" && <details className="wheel-graphics-setup__manual"><summary>Choisir moi-même l’affichage</summary>
      <p>Tu peux conserver ton mode préféré, même s’il est plus exigeant que le réglage conseillé.</p>
      <label>Mon choix <select value={manual} onChange={event => setManual(event.target.value)}>
        {WHEEL_DIAGNOSTIC_STEPS.map(step => <option value={step.profile} key={step.profile}>{step.label}</option>)}
      </select></label>{" "}<button type="button" onClick={() => controller.current?.chooseManual(manual)}>Utiliser ce mode</button>
    </details>}
  </dialog>, document.body);
}
