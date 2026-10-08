import React from "react";
import { createPortal } from "react-dom";
import LiveFeedSatellite from "../../features/live/LiveFeedSatellite.jsx";
import useTargetQuizSession from "../../features/targetQuiz/useTargetQuizSession.js";
import useTargetQuizAudio from "../../features/targetQuiz/useTargetQuizAudio.js";
import useTargetQuizFeedbackAudio from "../../features/targetQuiz/useTargetQuizFeedbackAudio.js";
import useTargetQuizTimeoutAudio from "../../features/targetQuiz/useTargetQuizTimeoutAudio.js";
import FoucaultPresenter from "./FoucaultPresenter.jsx";
import TargetQuizLightingIntro from "./TargetQuizLightingIntro.jsx";
import TargetQuizTargetLink from "./TargetQuizTargetLink.jsx";
import TargetQuizBackdrop from "./TargetQuizBackdrop.jsx";
import useTargetQuizPresenterDismiss from "../../features/targetQuiz/useTargetQuizPresenterDismiss.js";
import { TARGET_QUIZ_QUESTION_FADE_MS } from "../../../shared/targetQuizTiming.js";
import "./targetQuiz.css";

const QUESTION_STYLE = { "--tq-fade-duration": `${TARGET_QUIZ_QUESTION_FADE_MS}ms` };

export default function TargetQuizPlayground({
  active = false,
  gridHost = null,
  sideHost = null,
  socket = null,
  darkMode = false,
  roundId,
  endsAt,
  getNowServerMs,
  devPreview = false,
  onSessionStateChange = null,
  compact = false,
  getNickClassName = null,
  targetWord = "",
  onOpenTargetDefinition,
  onDismiss,
}) {
  const { state, controller } = useTargetQuizSession({
    active: active && !!gridHost,
    socket,
    roundId,
    endsAt,
    getNowServerMs,
    devPreview,
  });
  const { question, feedback, phase, transition } = state;
  const questionFeedback = feedback?.questionToken === question?.questionToken ? feedback : null;
  const questionToken = question?.questionToken;
  const panelRef = React.useRef(null);
  const stageRef = React.useRef(null);
  const cardsRef = React.useRef(null);
  const feedbackRef = React.useRef(null);
  const { reaction, hit } = useTargetQuizPresenterDismiss({ enabled: active && phase !== "finished", onDismiss, roundId, devPreview,
    onHit: async () => { const accepted = await controller.dismiss(); if (accepted) stopQuizSounds(); return accepted; } });
  const playing = !reaction && (phase === "running" || phase === "submitting" || phase === "feedback");
  const shown = !!question && phase !== "idle" && phase !== "finished";
  const sessionKey = String(roundId ?? "quiz");
  const { introReady, onIntroStart, stop: stopMusic } = useTargetQuizAudio({ active: active && !!gridHost && playing, sessionKey });
  const stopFeedback = useTargetQuizFeedbackAudio({ active: active && !!gridHost && playing, sessionKey, feedback });
  const stopQuizSounds = React.useCallback(() => { stopMusic(); stopFeedback(); }, [stopMusic, stopFeedback]);
  useTargetQuizTimeoutAudio({ active: active && !!gridHost, sessionKey, endsAt: state.endsAt || endsAt, getNowServerMs, onTimeout: stopQuizSounds });

  React.useEffect(() => {
    if (!active || !gridHost || !questionToken ||
        (phase !== "running" && !(phase === "feedback" && transition === "in"))) return undefined;
    // The server starts the five-second exposure window only after a visible
    // question has reached the screen, including on a resumed browser tab.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (document.visibilityState === "hidden" || !panelRef.current?.getClientRects().length) return;
        controller.markShown(questionToken);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, controller, gridHost, phase, questionToken, transition]);

  React.useEffect(() => {
    onSessionStateChange?.({
      phase,
      started: !!question,
      remainingSeconds: state.remainingSeconds,
      score: state.score,
      streak: state.streak,
      bestStreak: state.bestStreak,
      correctCount: state.correctCount,
      wrongCount: state.wrongCount,
      progression: state.progression,
      cancelled: state.cancelled,
    });
  }, [onSessionStateChange, phase, question, state.remainingSeconds, state.score, state.streak, state.bestStreak, state.correctCount, state.wrongCount, state.progression, state.cancelled]);

  if (!active || (!gridHost && !sideHost)) return null;

  const modeLabel = question?.mode === "spellings" ? "Quelle est la bonne orthographe ?" : "Quel mot correspond à cette définition ?";
  const statusText = phase === "disconnected"
    ? "Reconnexion au mini-jeu…"
    : phase === "paused"
    ? "Question en pause"
    : phase === "finished"
    ? "La manche est terminée"
    : state.error || "Préparation de la question…";
  const themeClass = `target-quiz${darkMode ? " target-quiz--dark" : ""}${compact ? " target-quiz--compact" : ""}`;

  const gridView = (
    <section ref={panelRef} className={`${themeClass} target-quiz__question`} style={QUESTION_STYLE} aria-label="Mini-jeu des mots rares">
      {!compact ? <TargetQuizTargetLink word={targetWord} onOpenDefinition={onOpenTargetDefinition} /> : null}
      {shown && question ? (
        <>
          <TargetQuizLightingIntro active={active && playing && introReady} sessionKey={sessionKey} questionToken={questionToken} onIntroStart={onIntroStart}
            stageRef={stageRef} cardsRef={cardsRef} feedbackRef={feedbackRef} />
          <div ref={stageRef} className={`target-quiz__stage${reaction ? ` target-quiz__stage--${reaction}` : ""}`}>
            <FoucaultPresenter questionToken={questionToken} feedback={reaction ? null : feedback} active={active && playing} dismissReaction={reaction} />
            {onDismiss ? <button type="button" className="target-quiz__presenter-hit" onClick={hit} disabled={phase === "finished" || reaction === "stars" || reaction === "exiting"}
              title="Assommer Jean-Bière FouKro" aria-label="Assommer Jean-Bière FouKro et fermer le mini-jeu" /> : null}
          </div>
          <div ref={cardsRef} key={questionToken} className={`target-quiz__cards${transition ? ` target-quiz__cards--${transition}` : ""}`}>
          <div className="target-quiz__eyebrow target-quiz__mode">{modeLabel}</div>
          <div className="target-quiz__definition-rail">
            <p id="target-quiz-definition" className="target-quiz__hex target-quiz__definition">{question.definition}</p>
          </div>
          <div className="target-quiz__choices" role="group" aria-label="Les quatre réponses" aria-describedby="target-quiz-definition">
            {question.choices.map((choice, index) => {
              const isAnswer = questionFeedback?.answerIndex === index;
              const isWrong = questionFeedback && !questionFeedback.correct && questionFeedback.selectedIndex === index;
              return (
                <button
                  type="button"
                  key={`${questionToken}:${index}`}
                  className={`target-quiz__hex target-quiz__choice${isAnswer ? " target-quiz__choice--correct" : ""}${isWrong ? " target-quiz__choice--wrong" : ""}`}
                  disabled={!state.canAnswer || phase !== "running" || !!reaction}
                  onClick={() => controller.answer(index)}
                  aria-label={`${String.fromCharCode(65 + index)} : ${choice}${isAnswer ? ", bonne réponse" : isWrong ? ", mauvaise réponse" : ""}`}
                >
                  <span className="target-quiz__letter">{String.fromCharCode(65 + index)}:</span>
                  <span className="target-quiz__word">{choice}</span>
                  {isAnswer || isWrong ? <span className="target-quiz__answer-icon" aria-hidden="true">{isAnswer ? "✓" : "×"}</span> : null}
                </button>
              );
            })}
          </div>
          </div>
          <div ref={feedbackRef} className={`target-quiz__feedback${feedback ? feedback.correct ? " target-quiz__feedback--correct" : " target-quiz__feedback--wrong" : ""}`} aria-live="polite" aria-atomic="true">
            {feedback ? `${feedback.correct ? "Bonne réponse" : "Mauvaise réponse"} · ${feedback.delta >= 0 ? "+" : "−"}${Math.abs(feedback.delta)} points` : phase === "submitting" ? "Validation…" : "Une seule bonne réponse"}
          </div>
          {!playing && !reaction ? (
            <div className="target-quiz__status target-quiz__connection" role="status">
              <div>{statusText}</div>
              {phase === "error" ? <button type="button" className="target-quiz__retry" onClick={controller.retry}>Réessayer</button> : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="target-quiz__status" role="status">
          <div>{statusText}</div>
          {phase === "error" ? <button type="button" className="target-quiz__retry" onClick={controller.retry}>Réessayer</button> : null}
        </div>
      )}
    </section>
  );

  const sideView = (
    <aside className={`${themeClass} target-quiz__side`} aria-label="Score du mini-jeu">
      <div className="target-quiz__score-row">
        <div>
          <div className="target-quiz__eyebrow">Cible trouvée · mots rares</div>
          <div className="target-quiz__score">{state.score}<span> points mini-jeu</span></div>
        </div>
        <div className="target-quiz__timer" aria-label={`${state.remainingSeconds} secondes restantes`}>{state.remainingSeconds}<span>s</span></div>
      </div>
      <div className="target-quiz__streak">Série en cours <strong>{state.streak}</strong></div>
      {!compact ? (
        <>
          <div className="target-quiz__rules">Bonne réponse : +100 à +200 points avec la série.<br />Erreur : −75 points, série remise à zéro.</div>
          <div className="target-quiz__feed">
            <LiveFeedSatellite darkMode maxHeight="100%" bannerText="La manche cible continue pour les autres joueurs" getNickClassName={getNickClassName} />
          </div>
        </>
      ) : null}
    </aside>
  );

  return <><TargetQuizBackdrop gridHost={gridHost} sideHost={sideHost} />{gridHost ? createPortal(gridView, gridHost) : null}{sideHost && !compact ? createPortal(sideView, sideHost) : null}</>;
}
