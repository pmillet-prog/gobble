import React from 'react';
import { createPortal } from 'react-dom';
import { WHEEL_VOTE_INTRO, WHEEL_VOTE_OPTIONS, WHEEL_VOTE_SUGGESTION_MAX } from '../../../shared/wheelVote.js';
import './wheelVote.css';

export function VoteDialogFrame({ children, title, onClose }) {
  const dialog = React.useRef(null);
  React.useLayoutEffect(() => {
    const node = dialog.current;
    const preventDismiss = event => event.preventDefault();
    node.addEventListener('cancel', preventDismiss);
    node.showModal();
    return () => { node.removeEventListener('cancel', preventDismiss); node.close(); };
  }, []);
  return createPortal(<dialog ref={dialog} className="wheel-vote" aria-label={title}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onClose?.(); }
    }}
    onCancel={event => { event.preventDefault(); onClose?.(); }}>
    <header><h1>{title}</h1>{onClose && <button type="button" onClick={onClose} aria-label="Fermer">×</button>}</header>
    {children}
  </dialog>, document.body);
}

export default function WheelVoteDialog({ state, controller }) {
  const [stage, setStage] = React.useState(state.vote ? 'choices' : 'welcome');
  const [choices, setChoices] = React.useState(state.vote?.choices || []);
  const [suggestion, setSuggestion] = React.useState(state.vote?.suggestion || '');
  const [confirmation, setConfirmation] = React.useState(null);
  const body = React.useRef(null);
  React.useLayoutEffect(() => { if (body.current) body.current.scrollTop = 0; }, [stage, confirmation]);
  const hasSuggestion = choices.includes(8);
  const ready = choices.length > 0 && (!hasSuggestion || suggestion.trim().length > 0);
  const close = state.vote && !state.busy ? controller.close : undefined;
  return <VoteDialogFrame title="Quel avenir pour la roue ?" onClose={close}>
    <div ref={body} className="wheel-vote__body">
      {confirmation ? <>
        <h2>{confirmation.status === 'skipped' ? 'Confirmer que tu passes ?' : 'Confirmer ton vote ?'}</h2>
        {confirmation.status === 'voted' ? <ul>{WHEEL_VOTE_OPTIONS.filter(option => choices.includes(option.id)).map(option =>
          <li key={option.id}><strong>Vote {option.id} :</strong> {option.label}</li>)}</ul>
          : <p>Ton choix « Passer » sera enregistré dans les résultats.</p>}
        {confirmation.suggestion && <p className="wheel-vote__suggestion">{confirmation.suggestion}</p>}
        {state.vote && <p>Cette validation remplacera ton choix précédent.</p>}
        <p>Tu pourras modifier ton vote depuis « À propos ».</p>
      </> : <>
        {stage === 'welcome' && WHEEL_VOTE_INTRO.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
        <p className="wheel-vote__notice"><strong>Plusieurs choix sont possibles.</strong> Coche toutes les propositions qui te conviennent.</p>
        {stage === 'welcome' ? <ol className="wheel-vote__proposals">{WHEEL_VOTE_OPTIONS.map(option =>
          <li key={option.id}><strong>Vote {option.id} :</strong> {option.label}</li>)}</ol> :
          <fieldset disabled={state.busy}><legend className="sr-only">Tes choix pour la roue</legend>
            {WHEEL_VOTE_OPTIONS.map(option => <label className="wheel-vote__choice" key={option.id}>
              <input type="checkbox" checked={choices.includes(option.id)} onChange={event => setChoices(previous =>
                event.target.checked ? [...previous, option.id].sort((a, b) => a - b) : previous.filter(id => id !== option.id))} />
              <span><strong>Vote {option.id} :</strong> {option.label}</span>
            </label>)}
            {hasSuggestion && <label className="wheel-vote__input">Ta suggestion (obligatoire)
              <textarea value={suggestion} onChange={event => setSuggestion(event.target.value)} rows={4} maxLength={WHEEL_VOTE_SUGGESTION_MAX} placeholder="Explique ce que tu proposes…" />
              <small>{suggestion.length} / {WHEEL_VOTE_SUGGESTION_MAX} caractères</small>
            </label>}
          </fieldset>}
        <p className="wheel-vote__privacy">Les responsables du jeu pourront consulter les choix et suggestions de chaque votant.</p>
      </>}
      {state.error && <p role="alert" className="wheel-vote__error">{state.error}</p>}
    </div>
    <footer>
      {confirmation ? <>
        <button disabled={state.busy} onClick={() => setConfirmation(null)}>Revenir à mes choix</button>
        <button className="wheel-vote__primary" disabled={state.busy} onClick={() => controller.submit(confirmation)}>{state.busy ? 'Enregistrement…' : 'Confirmer'}</button>
      </> : <>
        <button onClick={() => setConfirmation({ status: 'skipped', choices: [], suggestion: '' })}>Passer</button>
        <button className="wheel-vote__primary" disabled={stage === 'choices' && !ready} onClick={() => stage === 'welcome'
          ? setStage('choices') : setConfirmation({ status: 'voted', choices, suggestion: hasSuggestion ? suggestion.trim() : '' })}>
          {stage === 'welcome' ? 'Je vote' : 'Valider mon vote'}</button>
      </>}
    </footer>
  </VoteDialogFrame>;
}
