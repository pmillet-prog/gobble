import React from "react";
import { createPortal } from "react-dom";
import useGotusSession from "../../features/gotus/useGotusSession.js";
import useGotusFeedback from "../../features/gotus/useGotusFeedback.js";
import useGotusIntro from "../../features/gotus/useGotusIntro.js";
import GotusIntro from "./GotusIntro.jsx";
import GotusProgress from "./GotusProgress.jsx";
import TargetQuizBackdrop from "../targetQuiz/TargetQuizBackdrop.jsx";
import "./gotus.css";
import "./gotusResponsive.css";

const MARK_LABELS = { correct: "bien placée", present: "mal placée", absent: "absente", known: "déjà trouvée", draft: "proposée", empty: "à trouver" };
const TERMINAL = new Set(["won", "lost", "expired", "dismissed"]);

function Board({ state, boardRef }) {
  const activeRow = state.phase === "revealing" ? state.attempts.length - 1 : ["playing", "submitting"].includes(state.phase) ? state.attempts.length : -1;
  return <div className="gotus__board" ref={boardRef} role="table" aria-label="Grille Gotus : six essais, six lettres">
    {Array.from({ length: 6 }, (_, row) => <div className="gotus__row" key={row} role="row" aria-label={`Essai ${row + 1}`} data-active={row === activeRow}>
      {Array.from({ length: 6 }, (_, column) => {
        const attempt = state.attempts[row];
        let letter = "", mark = "empty";
        if (attempt) {
          letter = attempt.word[column];
          mark = state.phase === "revealing" && row === activeRow && column >= state.revealed ? "draft" : attempt.marks[column];
        } else if (row === activeRow) {
          letter = state.draft[column] || state.known[column] || "·";
          mark = state.draft[column] ? "draft" : state.known[column] ? "known" : "empty";
        }
        return <div className="gotus__cell" key={column} role="cell" data-mark={mark} data-gotus-row={row} data-gotus-column={column}
          aria-label={letter && letter !== "·" ? `${letter}, ${MARK_LABELS[mark]}` : "Case vide"}><span>{letter}</span></div>;
      })}
    </div>)}
  </div>;
}

function Keyboard({ state, controller }) {
  const marks = React.useMemo(() => {
    const result = {}, ranks = { absent: 1, present: 2, correct: 3 };
    state.attempts.forEach((attempt, row) => {
      const visible = state.phase === "revealing" && row === state.attempts.length - 1 ? state.revealed : 6;
      [...attempt.word].slice(0, visible).forEach((letter, column) => {
        if ((ranks[result[letter]] || 0) < ranks[attempt.marks[column]]) result[letter] = attempt.marks[column];
      });
    });
    return result;
  }, [state.attempts, state.phase, state.revealed]);
  return <div className="gotus__keyboard" aria-label="Clavier Gotus">
    {["AZERTYUIOP", "QSDFGHJKLM", "⌫WXCVBN↵"].map(letters => <div key={letters}>{[...letters].map(letter => <button key={letter}
      type="button" data-mark={marks[letter]} disabled={!state.canAnswer} aria-label={letter === "⌫" ? "Effacer une lettre" : letter === "↵" ? "Proposer" : `${letter}${marks[letter] ? `, ${MARK_LABELS[marks[letter]]}` : ""}`}
      onClick={() => letter === "↵" ? controller.submit() : controller.edit(letter === "⌫" ? state.draft.slice(0, -1) : state.draft + letter)}>{letter}</button>)}</div>)}
  </div>;
}

export default function GotusPlayground({ active = true, gridHost, sideHost, socket, roundId, endsAt, getNowServerMs,
  mode = "live", darkMode = false, compact = false, onDismiss, onSessionStateChange, onClose, onJoinLive, onNewRound,
}) {
  const training = mode === "training";
  const { state, controller } = useGotusSession({ active, socket, roundId, endsAt, getNowServerMs, mode });
  const intro = useGotusIntro({ active, controller, state });
  const boardRef = React.useRef(null), inputRef = React.useRef(null);
  const [soundEnabled, setSoundEnabled] = React.useState(true);
  const feedbackId = React.useId();
  useGotusFeedback({ active, controller, boardRef, enabled: soundEnabled });
  React.useEffect(() => {
    onSessionStateChange?.({ ...state.summary, started: !!state.firstLetter, phase: state.phase, solution: state.solution, progression: state.progression });
  }, [onSessionStateChange, state.summary, state.firstLetter, state.phase, state.solution, state.progression]);
  React.useEffect(() => {
    if (state.canAnswer && !intro.playing && window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, [state.canAnswer, intro.playing]);
  if (!active) return null;
  const finished = TERMINAL.has(state.phase);
  const feedback = state.error || (state.phase === "won" ? training ? "C’est le bon mot ! Bravo !" : "+1 mot trouvé ! Bravo !"
    : state.phase === "lost" ? state.attempts.length >= 6 ? "Les six essais sont terminés." : "Voici la solution."
    : state.phase === "expired" ? "La manche est terminée."
    : state.phase === "revealing" ? "Voyons cela…" : state.phase === "submitting" ? "Validation du mot…"
    : state.phase === "loading" || state.phase === "idle" ? "Préparation du mot…"
    : state.phase === "disconnected" ? "Reconnexion à Gotus…" : state.phase === "paused" ? "Gotus en pause"
    : "Six lettres, six essais. À vous !");
  const close = async () => {
    if (training) { onClose?.(); return; }
    if (finished || await controller.dismiss()) onDismiss?.();
  };
  const keyboard = event => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.target.closest("input, textarea, select") || !state.canAnswer) return;
    if (/^[a-zA-ZÀ-ÿ]$/.test(event.key)) controller.edit(state.draft + event.key);
    else if (event.key === "Backspace") controller.edit(state.draft.slice(0, -1));
    else if (event.key === "Enter") controller.submit();
    else return;
    event.preventDefault(); event.stopPropagation();
  };
  const theme = `gotus${darkMode ? " gotus--dark" : ""}${compact ? " gotus--compact" : ""}`;
  const progress = !training && state.progression ? <GotusProgress progression={state.progression} /> : null;
  const panel = <section className={`${theme} gotus__playground`} inert={intro.playing ? "" : undefined} aria-label={training ? "Entraînement Gotus" : "Gotus"} onKeyDown={keyboard}>
    <header className="gotus__header"><img src="/gotus/gotus-logo.webp" alt="Gotus" /><div><strong>Avec Thierry Baccardo</strong><span>{training ? "Entraînement" : `${state.remainingSeconds} s restantes`}</span></div>
      <label className="gotus__sound"><input type="checkbox" checked={soundEnabled} onChange={event => setSoundEnabled(event.target.checked)} /> Sons</label>
      {(onClose || onDismiss) ? <button type="button" className="gotus__close" onClick={close} aria-label="Fermer Gotus">×</button> : null}
    </header>
    <div className="gotus__puzzle">
    <div className="gotus__studio"><img className="gotus__presenter" src={`/gotus/thierry-baccardo-${state.phase === "won" ? 5 : state.phase === "revealing" ? 0 : 6}.webp`} alt="Thierry Baccardo" />
      <span>{state.phase === "won" ? "C’est le bon mot !" : "Le bon mot, à la bonne place."}</span></div>
    <Board state={state} boardRef={boardRef} />
    </div>
    <div className="gotus__controls">
    <div className="gotus__feedback" id={feedbackId} role="status" aria-live="polite" data-error={!!state.error}>{feedback}</div>
    {finished ? <div className="gotus__finish">
      {state.solution ? <p>Le mot était <strong>{state.solution}</strong></p> : null}
      {training ? <button type="button" className="gotus__primary" onClick={() => { controller.newRound(); onNewRound?.(); }}>Nouveau mot</button> : <p>La manche cible continue pour les autres joueurs.</p>}
      {!sideHost || compact ? progress : null}
    </div> : <>
      <form className="gotus__form" onSubmit={event => { event.preventDefault(); controller.submit(); }}>
        <input ref={inputRef} type="text" aria-label="Votre mot de six lettres" aria-describedby={feedbackId} aria-invalid={!!state.error}
          value={state.draft} maxLength={12} disabled={!state.canAnswer} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          onChange={event => controller.edit(event.target.value)} />
        <button type="submit" className="gotus__primary" disabled={!state.canAnswer}>Proposer</button>
      </form>
      <Keyboard state={state} controller={controller} />
      {state.phase === "error" ? <button type="button" className="gotus__secondary" onClick={controller.retry}>Reprendre Gotus</button> : null}
    </>}
    <div className="gotus__legend"><span><i data-kind="correct" />Bien placée</span><span><i data-kind="present" />Mal placée</span></div>
    {!training && compact && !finished ? progress : null}
    </div>
    {training && (!finished || onJoinLive) ? <footer className="gotus__footer">
      {!finished ? <button type="button" onClick={controller.giveUp} disabled={state.phase === "loading"}>Voir la solution</button> : null}
      {onJoinLive ? <button type="button" onClick={onJoinLive}>Rejoindre le live</button> : null}
    </footer> : null}
    {training ? <p className="gotus__training-note">Entraînement libre, sans récompense ni progression.</p> : null}
  </section>;
  const side = <aside className={`${theme} gotus__side`} aria-label="Règles et progression Gotus">
    <img src="/gotus/gotus-logo.webp" alt="" /><h2>Un mot, six essais</h2>
    <p>La première lettre est offerte. Les carrés rouges indiquent une lettre bien placée ; les ronds jaunes, une lettre présente ailleurs.</p>
    <p>La même lettre ne peut être signalée plus de fois qu’elle n’apparaît dans le mot.</p>
    <strong>{state.attempts.length} / 6 essais</strong>
    {!training ? <><p>Un mot trouvé avance votre jauge. Chaque série de 10 mots rapporte 500 gobblars.</p>{progress}</> : <p>Entraînement libre, sans récompense.</p>}
  </aside>;
  const introduction = <GotusIntro active={intro.playing} enabled={soundEnabled} onFinish={intro.finish} />;
  if (compact && !training) return <>{introduction}{createPortal(<div className="gotus-mobile-surface" role="dialog" aria-modal="true" aria-label="Gotus">
    <div className="gotus__standalone">{panel}</div>
  </div>, document.body)}</>;
  if (gridHost || sideHost) return <>{introduction}<TargetQuizBackdrop gridHost={gridHost} sideHost={sideHost} />{gridHost ? createPortal(panel, gridHost) : null}{sideHost && !compact ? createPortal(side, sideHost) : null}</>;
  return <>{introduction}<div className="gotus__standalone">{panel}</div></>;
}
