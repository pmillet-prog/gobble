import React from "react";
import { normalizeFinaleAnswer } from "../../../../shared/infortuneFinaleRules.js";
import InfortuneGameSurface from "../InfortuneGameSurface.jsx";
import FinaleLetterBoard from "./FinaleLetterBoard.jsx";
import FinaleLetterShop from "./FinaleLetterShop.jsx";
import FinaleAnswerKeyboard from './FinaleAnswerKeyboard.jsx';
import useFinaleFeedback from '../../../features/infortune/finale/useFinaleFeedback.js';
import { finaleBankExhausted, finaleGobblarPrice } from '../../../../shared/infortuneFinalePurchases.js';
import FinaleGobblarConfirmation from './FinaleGobblarConfirmation.jsx';
import FinaleWinReward from './FinaleWinReward.jsx';
import "./infortuneFinale.css";
import "./finaleGameLayout.css";

const number = value => value.toLocaleString("fr-FR");
export default function InfortuneFinale({ controller, onReplay, onClose, onContinue, onRewardLand, resultSeconds, actions, settingsButton, subtitle = "La finale" }) {
  const state = React.useSyncExternalStore(controller.store.subscribe, controller.store.getState, controller.store.getState);
  const [answer, setAnswer] = React.useState("");
  const [mode, setMode] = React.useState("buy");
  const [rewardLanded, setRewardLanded] = React.useState(false);
  const [gobblarPurchase, setGobblarPurchase] = React.useState(null);
  const [expanded, setExpanded] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  useFinaleFeedback(controller, reducedMotion);
  const answerInput = React.useRef(null), resultPanel = React.useRef(null);
  React.useEffect(() => {
    controller.resume();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionChanged = () => { setReducedMotion(preference.matches); if (preference.matches) controller.finishReveal(); };
    const visibilityChanged = () => { if (document.hidden) controller.finishReveal(); };
    motionChanged(); preference.addEventListener("change", motionChanged); document.addEventListener("visibilitychange", visibilityChanged);
    return () => { preference.removeEventListener("change", motionChanged); document.removeEventListener("visibilitychange", visibilityChanged); controller.dispose(); };
  }, [controller]);
  React.useEffect(() => { if (mode === "answer") answerInput.current?.focus({ preventScroll: true }); }, [mode]);
  React.useEffect(() => { if (state.outcome) {
    setExpanded(false); setGobblarPurchase(null);
    if (!document.querySelector('[data-chat-panel], .stats-overlay')) resultPanel.current?.focus({ preventScroll: true });
  } }, [state.outcome]);
  const validAnswer = Boolean(normalizeFinaleAnswer(answer));
  async function payLetter(letter, payment) {
    const bought = await controller.buyLetter(letter, payment);
    if (bought && reducedMotion) controller.finishReveal();
    if (bought) setGobblarPurchase(null);
  }
  function buyLetter(letter) {
    if (state.busy) return;
    if (finaleBankExhausted(state)) setGobblarPurchase({ letter, cost: finaleGobblarPrice(state.gobblarPurchases) });
    else void payLetter(letter);
  }
  const converted = state.outcome?.correct && rewardLanded;
  const virtualWallet = state.virtualWallet ? state.gobblarsBalance - (!rewardLanded ? state.outcome?.gobblars || 0 : 0) : undefined;
  return <InfortuneGameSurface variant="game" title="La finale" subtitle={actions ? undefined : subtitle} headingExtra={actions} bank={converted ? 0 : state.bank} wallet={virtualWallet} onClose={onClose}
    leadingActions={settingsButton} actions={<button type="button" aria-label={expanded ? "Revenir aux commandes" : "Agrandir le tableau"} aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "↩" : "⛶"}</button>}>
    <div className="infortune-finale" data-expanded={expanded} data-mode={mode} data-outcome={state.outcome ? state.outcome.correct ? "won" : "lost" : "playing"}>
      <FinaleLetterBoard tiles={state.tiles} category={state.category} kind={state.kind} reveal={state.reveal} reducedMotion={reducedMotion} />
      {state.outcome ? <section className="infortune-finale-result" ref={resultPanel} tabIndex={-1} aria-label="Résultat de la finale">
        <p>{state.outcome.correct ? "BIEN JOUÉ !" : "LE MYSTÈRE ÉTAIT…"}</p><h2>{state.outcome.answer}</h2>
        {state.outcome.correct ? <><FinaleWinReward bank={state.bank} outcome={state.outcome}
          onLand={() => { setRewardLanded(true); onRewardLand?.(); }} />
          {state.outcome.typo && <p>Petite faute tolérée.</p>}</>
          : <p>Ta proposition : « {state.outcome.proposal} ». Aucun gain de finale cette fois.</p>}
        {onReplay && <button type="button" className="infortune-finale-primary" onClick={onReplay}>Une autre énigme</button>}
        {onContinue && <><button type="button" className="infortune-finale-primary" onClick={onContinue}>Voir le classement</button>
          <p className="infortune-finale-result__next" role="status">Classement dans {resultSeconds} s</p></>}
      </section> : <section className="infortune-finale__commands" aria-label="Lettres et réponse">
        <div className="infortune-finale__tabs" aria-label="Action de finale">
          <button type="button" aria-pressed={mode === "buy"} disabled={state.busy} onClick={() => setMode("buy")}>Acheter des lettres</button>
          <button type="button" aria-pressed={mode === "answer"} disabled={state.busy} onClick={() => setMode("answer")}>J’ai la réponse</button>
        </div>
          {mode === "answer" && <form id="finale-answer-form" className="infortune-finale-answer" onSubmit={event => { event.preventDefault(); if (validAnswer && !state.busy) void controller.submitAnswer(answer); }}>
            <label className="infortune-finale-sr-only" htmlFor="infortune-finale-answer">Ta proposition en un mot</label>
            <input ref={answerInput} id="infortune-finale-answer" value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Ta réponse en un mot…"
              disabled={state.busy} autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={40} inputMode="none" enterKeyHint="done" />
          </form>}
          {mode === 'answer' ? <FinaleAnswerKeyboard disabled={state.busy} onType={letter => setAnswer(value => (value + letter).slice(0, 40))} onErase={() => setAnswer(value => value.slice(0, -1))} />
            : <FinaleLetterShop state={state} onBuy={buyLetter} />}
          {mode === "answer" && <button type="submit" form="finale-answer-form" className="infortune-finale-primary" disabled={state.busy || !validAnswer}>{state.busy ? 'Validation…' : 'Valider ma réponse · une seule tentative'}</button>}
        <p className="infortune-finale__potential">À gagner : <strong>+{number(state.rules.victoryPoints)} points</strong> et <strong>{number(Math.floor(state.bank / state.rules.bankPerGobblar))} gobblars</strong></p>
        {state.error && <p className="infortune-finale-answer__error" role="alert">{state.error}</p>}
      </section>}
    </div>
    {gobblarPurchase && !state.outcome && <FinaleGobblarConfirmation purchase={gobblarPurchase} state={state} onCancel={() => setGobblarPurchase(null)}
      onConfirm={() => payLetter(gobblarPurchase.letter, { currency: 'gobblars', confirmedCost: gobblarPurchase.cost })} />}
  </InfortuneGameSurface>;
}
