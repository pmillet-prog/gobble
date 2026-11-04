import React from "react";
import { normalizeFinaleAnswer } from "../../../../shared/infortuneFinaleRules.js";
import FinaleLetterBoard from "./FinaleLetterBoard.jsx";
import FinaleLetterShop from "./FinaleLetterShop.jsx";
import "./infortuneFinale.css";

const number = value => value.toLocaleString("fr-FR");

export default function InfortuneFinale({ controller, onReplay }) {
  const state = React.useSyncExternalStore(controller.store.subscribe, controller.store.getState, controller.store.getState);
  const [answer, setAnswer] = React.useState("");
  const [confirmation, setConfirmation] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const answerInput = React.useRef(null);
  const confirmButton = React.useRef(null);
  const resultPanel = React.useRef(null);

  React.useEffect(() => {
    controller.resume();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionChanged = () => { setReducedMotion(preference.matches); if (preference.matches) controller.finishReveal(); };
    const visibilityChanged = () => { if (document.hidden) controller.finishReveal(); };
    motionChanged();
    preference.addEventListener("change", motionChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => { preference.removeEventListener("change", motionChanged); document.removeEventListener("visibilitychange", visibilityChanged); controller.dispose(); };
  }, [controller]);
  React.useEffect(() => { if (confirmation) confirmButton.current?.focus(); }, [confirmation]);
  React.useEffect(() => { if (state.outcome) resultPanel.current?.focus(); }, [state.outcome]);

  function buyLetter(letter) {
    if (confirmation) return;
    controller.buyLetter(letter);
    if (reducedMotion) controller.finishReveal();
  }
  const validAnswer = Boolean(normalizeFinaleAnswer(answer));
  const cancelConfirmation = () => { setConfirmation(false); answerInput.current?.focus(); };

  return <div className="infortune-finale" data-outcome={state.outcome ? state.outcome.correct ? "won" : "lost" : "playing"}>
    <div className="infortune-finale__topline"><p>LA ROUE DE L’INFORTUNE <span>La finale</span></p>
      <div className="infortune-finale__bank"><span>Cagnotte</span><strong>{number(state.bank)}</strong></div></div>
    <FinaleLetterBoard tiles={state.tiles} category={state.category} kind={state.kind}
      flippingIndex={state.flippingIndex} reducedMotion={reducedMotion} />
    {state.outcome ? <section className="infortune-finale-result" ref={resultPanel} tabIndex={-1} aria-label="Résultat de la finale">
      <p>{state.outcome.correct ? "BIEN JOUÉ !" : "LE MYSTÈRE ÉTAIT…"}</p>
      <h2>{state.outcome.answer}</h2>
      {state.outcome.correct ? <>
        <div className="infortune-finale-result__rewards"><span><strong>+{number(state.outcome.points)}</strong> points au tournoi</span>
          <span><strong>+{number(state.outcome.gobblars)}</strong> gobblars</span></div>
        <p>{state.outcome.typo ? "Petite faute tolérée. " : ""}Ta cagnotte restante de {number(state.bank)} est convertie.</p>
      </> : <p>Tu avais proposé « {state.outcome.proposal} ». Aucun gain de finale cette fois.</p>}
      {onReplay && <button type="button" className="infortune-finale-primary" onClick={onReplay}>Une autre énigme ↗</button>}
    </section> : <div className="infortune-finale__play">
      <div inert={confirmation ? "" : undefined}><FinaleLetterShop state={state} onBuy={buyLetter} /></div>
      <section className="infortune-finale-answer" aria-label="Ta réponse">
        <h2>Tu as trouvé ?</h2><p>Le tableau cache l’énoncé. À toi de trouver sa réponse en <strong>un seul mot.</strong></p>
        <form onSubmit={event => { event.preventDefault(); if (validAnswer && !state.busy) setConfirmation(true); }}>
          <label htmlFor="infortune-finale-answer">Ta proposition</label>
          <input ref={answerInput} id="infortune-finale-answer" value={answer} onChange={event => setAnswer(event.target.value)}
            placeholder="Un mot…" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={40}
            disabled={confirmation} enterKeyHint="done" />
          <p className="infortune-finale-answer__hint">Une seule tentative. Accents et petites fautes tolérés.</p>
          {!confirmation && <button type="submit" className="infortune-finale-primary" disabled={state.busy || !validAnswer}>Proposer ma réponse</button>}
        </form>
        {confirmation && <div className="infortune-finale-answer__confirmation" role="group" aria-label="Confirmer la réponse"
          onKeyDown={event => { if (event.key === "Escape") cancelConfirmation(); }}>
          <p>« <strong>{answer.trim()}</strong> » sera ton unique réponse.</p>
          <button ref={confirmButton} type="button" className="infortune-finale-primary" onClick={() => {
            controller.submitAnswer(answer); setConfirmation(false);
          }}>Valider définitivement</button>
          <button type="button" className="infortune-finale-secondary" onClick={cancelConfirmation}>Continuer à réfléchir</button>
        </div>}
        <p className="infortune-finale-answer__potential">Si tu trouves maintenant<br /><strong>+{number(state.rules.victoryPoints)} points</strong>
          <span> et </span><strong>{number(Math.floor(state.bank / state.rules.bankPerGobblar))} gobblars</strong></p>
        <p className="infortune-finale-answer__error" role="alert">{state.error}</p>
      </section>
    </div>}
  </div>;
}
