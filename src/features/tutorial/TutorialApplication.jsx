import React from "react";
import { createPortal } from "react-dom";
import { getUiImageUrl, UI_IMAGE_KEYS } from "../../assets/uiAssetManifest.js";
import { createTutorialSession, tutorialStorageKey } from "./createTutorialSession.js";
import { TUTORIAL_CHAPTERS } from "./tutorialScenarios.js";
import TutorialCoach from "./TutorialCoach.jsx";
import "./tutorial.css";

function ChapterMenu({ state, session, onExit, pendingLogin }) {
  return <div className="tutorial-menu-backdrop"><section className="tutorial-menu" role="dialog" aria-modal="true" aria-label="Le mini-tournoi de Gobble">
    <button className="tutorial-menu-close" onClick={onExit} aria-label="Quitter le didacticiel">×</button>
    <img className="tutorial-menu-logo" src={getUiImageUrl(UI_IMAGE_KEYS.home.title)} alt="Gobble" />
    <span className="tutorial-eyebrow">Une partie, cinq manches</span>
    <h1>À chaque manche, une nouvelle façon de jouer.</h1>
    <p>Les places rapportent des points au mini-tournoi et les Gobbles ajoutent leur bonus. Le classement total se construit au fil des cinq manches.</p>
    <ol className="tutorial-tournament-track">
      {[['Normale', 'Les bases'], ['Spéciale', 'Une surprise'], ['Massive Boggle', 'La longueur'], ['Spéciale', 'Une autre règle'], ['Manche 5', 'Dernière manche']].map(([title, detail], index) => <li key={index}><span>{index + 1}</span><strong>{title}</strong><small>{detail}</small></li>)}
    </ol>
    <div className="tutorial-workshop-heading"><h2>Choisis une manche à essayer</h2><span>Dans l’ordre que tu veux.</span></div>
    <div className="tutorial-workshops">{TUTORIAL_CHAPTERS.slice(1).map((chapter) => <button key={chapter.id} data-tutorial-chapter={chapter.id} onClick={() => session.startChapter(chapter.id)}>
      <span className="material-icons-outlined" aria-hidden="true">{chapter.icon}</span><span><strong>{chapter.title}</strong><small>{chapter.description}</small></span><em>{state.completed.includes(chapter.id) ? "✓" : chapter.duration}</em>
    </button>)}</div>
    <div className="tutorial-menu-footer"><button onClick={() => session.startChapter("basics")}>Rejouer les bases</button><button className="tutorial-main-action" onClick={onExit}>{pendingLogin ? "Prêt, je rejoins la partie !" : "Retour au jeu"} →</button></div>
  </section></div>;
}

export default function TutorialApplication({ game, onComplete, identity = "guest", pendingLogin = false }) {
  const session = game.getSession(() => {
    let storage;
    try { storage = localStorage; } catch (_) {}
    return createTutorialSession({ game, storage, storageKey: tutorialStorageKey(identity) });
  });
  const state = React.useSyncExternalStore(session.store.subscribe, session.store.getState, session.store.getState);
  const snapshot = React.useSyncExternalStore(game.store.subscribe, game.store.getState, game.store.getState);
  const overlayRef = React.useRef(null);
  React.useEffect(() => { session.activate(); }, [session]);
  React.useEffect(() => {
    if (state.screen === "lesson") return;
    const root = document.getElementById("root");
    const wasInert = root?.inert;
    const previousFocus = document.activeElement;
    if (root) root.inert = true;
    const overlay = overlayRef.current;
    overlay?.querySelector(".tutorial-main-action, button")?.focus({ preventScroll: true });
    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      const buttons = [...overlay.querySelectorAll("button:not(:disabled)")];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    overlay?.addEventListener("keydown", trapFocus);
    return () => {
      if (root) root.inert = wasInert;
      overlay?.removeEventListener("keydown", trapFocus);
      if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    };
  }, [state.screen]);
  const onExit = () => { session.dispose(); game.returnToMenu(); onComplete(); };
  return createPortal(<div ref={overlayRef} className="tutorial-overlay-root" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onExit(); } }} data-tutorial-screen={state.screen} data-tutorial-step={state.screen === "lesson" ? TUTORIAL_CHAPTERS.find((chapter) => chapter.id === state.chapterId).steps[state.stepIndex].id : undefined}>
    {state.screen === "welcome" ? <div className="tutorial-menu-backdrop"><section className="tutorial-welcome" role="dialog" aria-modal="true" aria-labelledby="tutorial-welcome-title">
      <button className="tutorial-menu-close" onClick={onExit} aria-label="Quitter le didacticiel">×</button>
      <img src={getUiImageUrl(UI_IMAGE_KEYS.home.title)} alt="Gobble" />
      <span className="tutorial-eyebrow">Une petite partie pour prendre tes marques</span>
      <h1 id="tutorial-welcome-title">Tu débutes sur Gobble ?</h1>
      <p>Trois mots à tracer, un beau coup à tenter… On te guide directement dans le jeu.</p>
      {state.feedback ? <p role="alert">{state.feedback}</p> : null}
      <button className="tutorial-main-action" onClick={() => session.startChapter("basics")} autoFocus>Oui, montre-moi ! <span aria-hidden="true">→</span></button>
      <button className="tutorial-skip" onClick={onExit}>Je connais déjà, je passe</button>
    </section></div> : state.screen === "hub" ? <ChapterMenu state={state} session={session} onExit={onExit} pendingLogin={pendingLogin} /> :
      <TutorialCoach game={game} session={session} state={state} snapshot={snapshot} onExit={onExit} />}
  </div>, document.body);
}
