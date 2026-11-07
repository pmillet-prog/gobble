import React from "react";
import useGotusSession from "../../features/gotus/useGotusSession.js";
import useGotusFeedback from "../../features/gotus/useGotusFeedback.js";
import useGotusIntro from "../../features/gotus/useGotusIntro.js";
import useGotusBoardInput from "../../features/gotus/useGotusBoardInput.js";
import GotusIntro from "./GotusIntro.jsx";
import GotusProgress from "./GotusProgress.jsx";
import GotusSolution from "./GotusSolution.jsx";
import GotusSurface from "./GotusSurface.jsx";
import GotusChatButton from "./GotusChatButton.jsx";
import GotusBoard from "./GotusBoard.jsx";
import GotusKeyboard from "./GotusKeyboard.jsx";
import "./gotus.css";
import "./gotusResponsive.css";

const TERMINAL = new Set(["won", "lost", "expired", "dismissed"]);

export default function GotusPlayground({ active = true, socket, roundId, endsAt, getNowServerMs, chat,
  mode = "live", darkMode = false, compact = false, onDismiss, onSessionStateChange, onClose, onJoinLive, onNewRound, onOpenDefinition,
}) {
  const training = mode === "training";
  const { state: sessionState, controller } = useGotusSession({ active, socket, roundId, endsAt, getNowServerMs, mode });
  const ending = !training && (sessionState.phase === "expired" || sessionState.endsAt > 0 && sessionState.remainingSeconds === 0);
  const lastFrame = React.useRef({ controller, state: sessionState });
  if (!ending || lastFrame.current.controller !== controller) lastFrame.current = { controller, state: sessionState };
  // Keep the board and keyboard in place beneath the round recap. The server
  // summary still updates independently; only this last visual frame is held.
  const state = ending ? { ...lastFrame.current.state, canAnswer: false, remainingSeconds: 0 } : sessionState;
  const intro = useGotusIntro({ active, controller, state: sessionState });
  const boardRef = React.useRef(null);
  const boardInput = useGotusBoardInput({ state, controller, boardRef, introPlaying: intro.playing, chat });
  const feedbackId = React.useId();
  useGotusFeedback({ active: active && !ending, controller, boardRef, enabled: true });
  React.useEffect(() => {
    onSessionStateChange?.({ ...sessionState.summary, started: !!sessionState.firstLetter, phase: sessionState.phase, solution: sessionState.solution, progression: sessionState.progression });
  }, [onSessionStateChange, sessionState.summary, sessionState.firstLetter, sessionState.phase, sessionState.solution, sessionState.progression]);
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
  const theme = `gotus${darkMode ? " gotus--dark" : ""}${compact ? " gotus--compact" : ""}`;
  const progress = !training && state.progression ? <GotusProgress progression={state.progression} /> : null;
  const panel = <section className={`${theme} gotus__playground`} inert={intro.playing || ending ? "" : undefined} aria-label={training ? "Entraînement Gotus" : "Gotus"}>
    <header className={`gotus__header${training ? "" : " gotus__header--timed"}`}><img src="/gotus/gotus-logo.webp" alt="Gotus" />
      <div className="gotus__heading">{training ? <><strong>Avec Thierry Baccardo</strong><span>Entraînement</span></>
        : <><strong className="gotus__clock" role="timer" aria-label={`${state.remainingSeconds} secondes restantes`}>{state.remainingSeconds}</strong><span>Gotus</span></>}</div>
      <div className="gotus__header-actions">
        {compact && chat ? <GotusChatButton chat={chat} training={training} /> : null}
        {(onClose || onDismiss) ? <button type="button" className="gotus__close" onClick={close} aria-label="Fermer Gotus">×</button> : null}
      </div>
    </header>
    <div className="gotus__puzzle">
    <div className="gotus__studio"><img className="gotus__presenter" src={`/gotus/thierry-baccardo-${state.phase === "won" ? 5 : state.phase === "revealing" ? 0 : 6}.webp`} alt="Thierry Baccardo" />
      <span>{state.phase === "won" ? "C’est le bon mot !" : "Le bon mot, à la bonne place."}</span></div>
    <GotusBoard state={state} boardRef={boardRef} input={boardInput} feedbackId={feedbackId} />
    </div>
    <div className="gotus__controls">
    <div className="gotus__feedback" id={feedbackId} role="status" aria-live="polite" data-error={!!state.error}>{feedback}</div>
    {finished ? <div className="gotus__finish">
      {state.solution ? <><p>Le mot était</p><GotusSolution word={state.solution} onOpenDefinition={onOpenDefinition} /></> : null}
      {training ? <button type="button" className="gotus__primary" onClick={() => { controller.newRound(); onNewRound?.(); }}>Nouveau mot</button> : <p>La manche cible continue pour les autres joueurs.</p>}
      {progress}
    </div> : <>
      <form className="gotus__form" onSubmit={event => { event.preventDefault(); controller.submit(); }}>
        <button type="submit" className="gotus__primary" disabled={!state.canAnswer}>Proposer</button>
      </form>
      <GotusKeyboard state={state} onKey={boardInput.onVirtualKey} />
      {state.phase === "error" ? <button type="button" className="gotus__secondary" onClick={controller.retry}>Reprendre Gotus</button> : null}
    </>}
    <div className="gotus__legend"><span><i data-kind="correct" />Bien placée</span><span><i data-kind="present" />Mal placée</span></div>
    {!training && !finished ? progress : null}
    </div>
    {training && (!finished || onJoinLive) ? <footer className="gotus__footer">
      {!finished ? <button type="button" onClick={controller.giveUp} disabled={state.phase === "loading"}>Voir la solution</button> : null}
      {onJoinLive ? <button type="button" onClick={onJoinLive}>Rejoindre le live</button> : null}
    </footer> : null}
    {training ? <p className="gotus__training-note">Entraînement libre, sans récompense ni progression.</p> : null}
  </section>;
  const introduction = <GotusIntro active={intro.playing} enabled onFinish={intro.finish} />;
  return <>{introduction}<GotusSurface compact={compact} training={training} darkMode={darkMode} chat={chat}>{panel}</GotusSurface></>;
}
