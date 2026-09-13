import React from "react";
import ResultsPathOverlay from "../../components/grid/ResultsPathOverlay.jsx";
import { getBonusBadgeClass } from "../../components/GridTileButton.jsx";
import { getTutorialChapter } from "./tutorialScenarios.js";
import { TUTORIAL_PRESENTERS } from "./tutorialPresenters.js";
import { getTutorialResultsGuidance } from "./tutorialResultsGuidance.js";
import useTutorialGeometry from "./useTutorialGeometry.js";
import DailySpecialRecapDialog from "../../components/daily/DailySpecialRecapDialog.jsx";
import { getDailySpecialWordReview } from "../../components/daily/dailySpecialRecapModel.js";

function BonusSummary() {
  return <div className="tutorial-bonus-summary">
    <div className="tutorial-bonus-grid">{[
      ["L2", "Lettre ×2"], ["L3", "Lettre ×3"], ["M2", "Mot ×2"], ["M3", "Mot ×3"],
    ].map(([bonus, label]) => <div key={bonus}><span className={`tutorial-chip ${getBonusBadgeClass(bonus)}`}>{bonus}</span><span>{label}</span></div>)}</div>
    <p>Longueur : 5 lettres +3 · 6 +6 · 7 +10 · 8 et plus +15. Les multiplicateurs de mot s’appliquent ensuite, ensemble.</p>
  </div>;
}

function actionText(step, snapshot, target) {
  if (["slot", "placement"].includes(step.kind) || step.allowPlay) return { title: step.title, text: step.actionText || step.text };
  const resultsGuidance = getTutorialResultsGuidance(step, snapshot);
  if (resultsGuidance) return resultsGuidance;
  if (step.kind === "ranking") return {
    title: snapshot.mobile ? "Glisse vers la gauche" : "Clique sur « Total »",
    text: "10 points au premier, 9 au deuxième… Le classement Total cumule ces points et les Gobbles.", swipe: snapshot.mobile,
  };
  if (step.kind === "words") return snapshot.mobile ? {
    title: snapshot.resultsPage === "found" ? "Et les mots que tu as manqués ?" : "Retrouve tes mots",
    text: snapshot.resultsPage === "found" ? "Glisse encore pour afficher tous les mots possibles." : "Glisse vers la gauche pour revoir tes trouvailles.", swipe: true,
  } : { title: "Clique sur « Tous »", text: "Tes mots restent en évidence parmi tous ceux que la grille permettait." };
  if (step.kind === "finders") return { title: snapshot.mobile ? "Touche ARME" : "Survole ARME", text: snapshot.mobile ? "Sa fiche indique qui l’a trouvé." : "Le chemin se dessine et les joueurs concernés s’allument.", tap: snapshot.mobile };
  if (step.kind === "definition") return { title: snapshot.mobile ? "Touche ARME, puis la loupe" : "Clique sur la loupe d’ARME", text: snapshot.mobile ? "La définition s’ouvre directement depuis sa fiche." : "Elle ouvre sa définition dans le dictionnaire." , tap: snapshot.mobile };
  return { title: target && step.kind === "word" ? `Trace ${target.word.toUpperCase()}` : "À toi de chercher", text: target && step.kind === "word" ? "Relie ses lettres, puis relâche." : "Compose les mots que tu repères." };
}

export default function TutorialCoach({ game, session, state, snapshot, onExit }) {
  const chapter = getTutorialChapter(state.chapterId);
  const step = chapter.steps[state.stepIndex];
  const target = session.getTarget();
  const cardRef = React.useRef(null);
  const contextRef = React.useRef(null);
  const gradientId = React.useId().replace(/:/g, "");
  const geometry = useTutorialGeometry(game, step, `${state.mode}:${state.hint}:${snapshot.resultsPage}:${snapshot.showAllWords}:${snapshot.wordInfoWord}:${snapshot.gridRotationTurns}`, target, cardRef, contextRef);
  const help = state.mode === "help";
  const playing = ["playing", "acting"].includes(state.mode);
  const invisible = ["celebrating", "transition", "watching"].includes(state.mode) || snapshot.vocabOpen;
  const nativeDialog = snapshot.definitionWord || snapshot.wordInfoWord;
  const section = chapter.id !== "basics" ? chapter.title : step.phase === "results" ? "Après la manche" : state.stepIndex < 3 ? "À toi de jouer" : "Tes repères";
  React.useEffect(() => {
    if (!playing && !invisible && !nativeDialog) cardRef.current?.focus({ preventScroll: true });
  }, [step.id, state.mode, nativeDialog, playing, invisible]);
  if (invisible) return state.mode === "transition" ? <div className="tutorial-soft-transition" /> : null;
  if (step.kind === "recap" && snapshot.threeWordReview) return <DailySpecialRecapDialog
    result={snapshot.threeWordReview} review={getDailySpecialWordReview(snapshot.threeWordReview)} animate onClose={session.closeRecap}
    contextLabel="Didacticiel · 3 mots" footerNote="Le score pendant la recherche était provisoire. Seuls les mots reconnus par le dictionnaire rapportent des points." />;
  if (snapshot.definitionWord) return null;
  const instruction = actionText(step, snapshot, target);
  if (snapshot.wordInfoWord) return <>
    <div className="tutorial-touch-caption" style={geometry?.tap ? { left: Math.max(12, geometry.tap.left - 170), top: geometry.tap.top - 80 } : undefined}><span>Didacticiel</span>Touche la loupe pour lire la définition</div>
    {geometry?.tap ? <span className="tutorial-tap-finger material-symbols-outlined" style={geometry.tap} aria-hidden="true">touch_app</span> : null}
  </>;
  return <>
    {(!playing || step.focus === "bonus") && geometry?.focus ? <div className="tutorial-focus" style={geometry.focus} /> : null}
    {playing && geometry?.resultsHeading ? <div className="tutorial-results-heading-focus" style={geometry.resultsHeading} data-guided-results-page={instruction.page} aria-hidden="true" /> : null}
    {playing && state.hint >= 3 && geometry?.pathPreview ? <div className="tutorial-trace-guide">
      <ResultsPathOverlay gradientId={`tutorial-${gradientId}`} preview={geometry.pathPreview} />
    </div> : null}
    {playing ? <>
      <div ref={contextRef} className={`tutorial-context-guide${step.phase === "results" ? " is-results" : ""}${chapter.id === "three-words" ? " is-three-words" : ""}`} style={geometry?.context} role="status">
        <div className="tutorial-context-heading"><span>Didacticiel</span><button onClick={session.openHelp}>Aide et options</button></div>
        <strong>{instruction.title}</strong>
        <p>{instruction.text}</p>
        {instruction.gesture ? <p className="tutorial-gesture-caption">{instruction.gesture}</p> : null}
        {instruction.swipe ? <div className="tutorial-swipe-gesture" aria-hidden="true"><span className="tutorial-swipe-trail" /><span className="material-symbols-outlined tutorial-swipe-finger">touch_app</span></div> : null}
        {step.kind === "practice" ? <button className="tutorial-context-action" onClick={session.finishPractice}>Voir mes résultats</button> : null}
        {step.id === "to-results" ? <button className="tutorial-context-action" onClick={() => session.advance()}>Voir mes résultats</button> : null}
        {step.allowPlay ? <button className="tutorial-context-action" onClick={() => session.advance()}>{step.nextLabel}</button> : null}
      </div>
      {instruction.tap && geometry?.tap ? <span className="tutorial-tap-finger material-symbols-outlined" style={geometry.tap} aria-hidden="true">touch_app</span> : null}
      {geometry?.bonusDrag ? <span className="tutorial-drag-finger material-symbols-outlined" style={geometry.bonusDrag} aria-hidden="true">touch_app</span> : null}
    </> : <section ref={cardRef} tabIndex={-1} className={`tutorial-coach${state.achieved && step.kind === "word" ? " is-success" : ""}`} style={geometry?.card} role="dialog" aria-label="Guide du didacticiel" data-tutorial-step={step.id} onKeyDown={(event) => event.stopPropagation()}>
      <div className="tutorial-card-heading"><span>{help ? "Aide du didacticiel" : section}</span><button onClick={onExit} aria-label="Quitter le didacticiel">×</button></div>
      {step.phase !== "results" ? <div className="tutorial-progress" aria-label={`Étape ${state.stepIndex + 1} sur ${chapter.steps.length}`}>{chapter.steps.map((entry, index) => <span key={entry.id} className={index <= state.stepIndex ? "is-done" : ""} />)}</div> : null}
      <h2>{state.achieved && step.kind === "word" ? step.id === "long-word" ? "Ça, c’est un Gobble !" : "Bien joué !" : step.title}</h2>
      <p aria-live="polite">{state.achieved && step.kind === "word" ? step.success : snapshot.mobile && step.mobileText ? step.mobileText : step.text}</p>
      {step.detail && (!state.achieved || step.allowPlay) ? <p className="tutorial-detail">{step.detail}</p> : null}
      {step.summary === "bonuses" && state.achieved ? <BonusSummary /> : null}
      {step.summary === "presenters" ? <ul className="tutorial-presenter-roles">{TUTORIAL_PRESENTERS.map((presenter) => <li key={presenter.key}><strong>{presenter.name}</strong> {presenter.role}</li>)}</ul> : null}
      {help ? <>
        {step.kind === "practice" ? <p className="tutorial-detail">Le chrono est arrêté pendant cette aide.</p> : null}
        {target ? <button className="tutorial-skip" onClick={session.hint}>Montrer le chemin de {target.word.toUpperCase()}</button> : null}
        <button className="tutorial-main-action" onClick={session.resume}>Reprendre</button>
        <button className="tutorial-skip" onClick={onExit}>Quitter le didacticiel</button>
      </> : <>
        {step.id === "to-results" ? <button className="tutorial-skip" onClick={session.begin}>Chercher encore un peu</button> : null}
        {step.allowPlay ? <button className="tutorial-main-action" onClick={session.begin}>Essayer les bonus</button> : null}
        {step.kind !== "presenter" ? <button className="tutorial-main-action" onClick={state.achieved ? () => session.advance() : session.begin}>
          {state.achieved ? step.nextLabel || "Continuer" : ["word", "slot"].includes(step.kind) ? "À moi de jouer !" : step.kind === "vocabulary" ? step.nextLabel : "C’est parti !"} <span aria-hidden="true">→</span>
        </button> : <p className="tutorial-detail">Touche directement sa pastille éclairée.</p>}
      </>}
      <div className="tutorial-card-footer"><button onClick={session.goToHub}>Les manches</button><button onClick={() => session.advance({ skip: true })}>Passer cette étape</button></div>
    </section>}
  </>;
}
