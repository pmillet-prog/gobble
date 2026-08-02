import React from "react";
import { createPortal } from "react-dom";
import LiveFeed from "../LiveFeed.jsx";
import TargetWaitPuzzleGrid from "./TargetWaitPuzzleGrid.jsx";
import {
  TARGET_WAIT_SESSION_SECONDS,
  TARGET_WAIT_WRONG_PENALTY,
  buildTargetWaitChoices,
  getTargetWaitCorrectScore,
  isTargetWaitPuzzle,
  shuffleTargetWaitValues,
} from "./targetWaitGame.js";

const CORRECT_FEEDBACK_MS = 950;
const WRONG_FEEDBACK_MS = 1250;

function getWordLength(puzzle) {
  return String(puzzle?.word || "").length;
}

function LoadingPanel({ message, darkMode }) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center rounded-xl border p-5 text-center text-sm font-bold ${
        darkMode
          ? "border-amber-300/30 bg-slate-950 text-amber-200"
          : "border-amber-700/25 bg-amber-50 text-amber-800"
      }`}
    >
      {message}
    </div>
  );
}

export default function TargetWaitDevPlayground({
  active = false,
  gridHost = null,
  sideHost = null,
  socket = null,
  darkMode = false,
  liveFeedItems = [],
  getNickClassName = null,
  onToast = null,
  onSessionStateChange = null,
  compact = false,
}) {
  const [catalog, setCatalog] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [choiceCount, setChoiceCount] = React.useState(5);
  const [phase, setPhase] = React.useState("idle");
  const [remainingMs, setRemainingMs] = React.useState(TARGET_WAIT_SESSION_SECONDS * 1000);
  const [order, setOrder] = React.useState([]);
  const [cursor, setCursor] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [streak, setStreak] = React.useState(0);
  const [bestStreak, setBestStreak] = React.useState(0);
  const [correctCount, setCorrectCount] = React.useState(0);
  const [wrongCount, setWrongCount] = React.useState(0);
  const [feedback, setFeedback] = React.useState(null);
  const deadlineRef = React.useRef(0);
  const feedbackTimerRef = React.useRef(null);
  const catalogRef = React.useRef([]);

  const currentPuzzle = catalog[order[cursor]] || null;
  const currentWordLength = getWordLength(currentPuzzle);
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const choices = React.useMemo(
    () => buildTargetWaitChoices(currentPuzzle, choiceCount),
    [choiceCount, currentPuzzle]
  );
  const panelClass = darkMode
    ? "border-slate-700 bg-slate-950 text-slate-100"
    : "border-amber-700/25 bg-amber-50 text-slate-900";

  const clearFeedbackTimer = React.useCallback(() => {
    if (!feedbackTimerRef.current) return;
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
  }, []);

  const finishSession = React.useCallback(() => {
    clearFeedbackTimer();
    setRemainingMs(0);
    setFeedback(null);
    setPhase("finished");
  }, [clearFeedbackTimer]);

  const startSession = React.useCallback(
    (puzzles = catalogRef.current) => {
      if (!Array.isArray(puzzles) || puzzles.length === 0) return;
      clearFeedbackTimer();
      setOrder(
        shuffleTargetWaitValues(
          puzzles.map((_, index) => index),
          `${Date.now()}:${Math.random()}`
        )
      );
      setCursor(0);
      setScore(0);
      setStreak(0);
      setBestStreak(0);
      setCorrectCount(0);
      setWrongCount(0);
      setFeedback(null);
      setRemainingMs(TARGET_WAIT_SESSION_SECONDS * 1000);
      deadlineRef.current = performance.now() + TARGET_WAIT_SESSION_SECONDS * 1000;
      setPhase("running");
    },
    [clearFeedbackTimer]
  );

  React.useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  React.useEffect(() => {
    if (!active) {
      clearFeedbackTimer();
      setPhase("idle");
      return undefined;
    }
    if (!socket?.connected) {
      setError("Le serveur local n’est pas connecté.");
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    let settled = false;
    setLoading(true);
    setError("");
    const responseTimeout = window.setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      setLoading(false);
      setError("Le backend local chargé ne connaît pas encore le catalogue du mini-jeu.");
    }, 5000);
    socket.emit("dev:targetWait:catalog", { limit: 1000 }, (response) => {
      if (cancelled || settled) return;
      settled = true;
      window.clearTimeout(responseTimeout);
      const puzzles = Array.isArray(response?.puzzles)
        ? response.puzzles.filter(isTargetWaitPuzzle)
        : [];
      setLoading(false);
      if (!response?.ok || puzzles.length === 0) {
        setCatalog([]);
        setError("Catalogue du mini-jeu indisponible sur ce backend local.");
        return;
      }
      setCatalog(puzzles);
      catalogRef.current = puzzles;
      startSession(puzzles);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(responseTimeout);
    };
  }, [active, clearFeedbackTimer, socket, startSession]);

  React.useEffect(() => {
    if (!active || phase !== "running") return undefined;
    const updateTimer = () => {
      const next = Math.max(0, deadlineRef.current - performance.now());
      setRemainingMs(next);
      if (next <= 0) finishSession();
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 100);
    return () => window.clearInterval(timer);
  }, [active, finishSession, phase]);

  React.useEffect(
    () => () => {
      clearFeedbackTimer();
    },
    [clearFeedbackTimer]
  );

  React.useEffect(() => {
    if (typeof onSessionStateChange !== "function") return;
    onSessionStateChange({
      phase,
      remainingSeconds,
      wordLength: currentWordLength,
      score,
      streak,
      bestStreak,
      correctCount,
      wrongCount,
    });
  }, [
    bestStreak,
    correctCount,
    currentWordLength,
    onSessionStateChange,
    phase,
    remainingSeconds,
    score,
    streak,
    wrongCount,
  ]);

  const advancePuzzle = React.useCallback(() => {
    setFeedback(null);
    setCursor((previous) => {
      if (previous + 1 < order.length) return previous + 1;
      setOrder(
        shuffleTargetWaitValues(
          catalogRef.current.map((_, index) => index),
          `${Date.now()}:loop`
        )
      );
      return 0;
    });
  }, [order.length]);

  const chooseLetter = React.useCallback(
    (letter) => {
      if (phase !== "running" || feedback || !currentPuzzle) return;
      const isCorrect = letter === currentPuzzle.answer;
      if (isCorrect) {
        const nextStreak = streak + 1;
        const delta = getTargetWaitCorrectScore(nextStreak);
        setScore((previous) => previous + delta);
        setStreak(nextStreak);
        setBestStreak((previous) => Math.max(previous, nextStreak));
        setCorrectCount((previous) => previous + 1);
        setFeedback({ selected: letter, correct: true, delta });
        onToast?.(
          `Bonne lettre · +${delta} points · série ${nextStreak}`,
          1700,
          { position: "top-right" }
        );
      } else {
        setScore((previous) => Math.max(0, previous - TARGET_WAIT_WRONG_PENALTY));
        setStreak(0);
        setWrongCount((previous) => previous + 1);
        setFeedback({
          selected: letter,
          correct: false,
          delta: -TARGET_WAIT_WRONG_PENALTY,
        });
        onToast?.(
          `Mauvaise lettre · −${TARGET_WAIT_WRONG_PENALTY} points · série remise à zéro`,
          1900,
          { position: "top-right" }
        );
      }
      clearFeedbackTimer();
      feedbackTimerRef.current = window.setTimeout(
        advancePuzzle,
        isCorrect ? CORRECT_FEEDBACK_MS : WRONG_FEEDBACK_MS
      );
    },
    [
      advancePuzzle,
      clearFeedbackTimer,
      currentPuzzle,
      feedback,
      onToast,
      phase,
      streak,
    ]
  );

  if (!active || (!gridHost && !sideHost)) return null;

  const statusMessage = loading
    ? "Chargement des grilles pré-calculées…"
    : error || "Préparation du mini-jeu…";

  const gridView =
    loading || error || !currentPuzzle ? (
      <LoadingPanel message={statusMessage} darkMode={darkMode} />
    ) : phase === "finished" ? (
      <div
        className={`flex h-full w-full flex-col items-center justify-center rounded-xl border p-5 text-center ${panelClass}`}
      >
        <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-500">
          90 secondes écoulées
        </div>
        <div className="mt-3 text-6xl font-black text-amber-500">{score}</div>
        <div className="mt-1 text-sm font-bold opacity-70">points mini-jeu</div>
        <div className="mt-4 text-sm font-semibold">
          {correctCount} bonnes réponses · {wrongCount} erreurs · meilleure série {bestStreak}
        </div>
        <button
          type="button"
          onClick={() => startSession()}
          className="mt-5 rounded-xl bg-amber-400 px-5 py-2.5 font-black text-slate-950"
        >
          Rejouer 90 secondes
        </button>
      </div>
    ) : (
      <TargetWaitPuzzleGrid
        puzzle={currentPuzzle}
        revealAnswer={!!feedback}
        darkMode={darkMode}
        wordLength={currentWordLength}
        feedbackCorrect={feedback?.correct}
      />
    );

  const sideView =
    loading || error || !currentPuzzle ? (
      <LoadingPanel message={statusMessage} darkMode={darkMode} />
    ) : (
      <div
        className={`flex h-full w-full min-h-0 flex-col rounded-xl border ${
          compact ? "p-2" : "p-3"
        } ${panelClass}`}
      >
        <div className="shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">
                Cible déjà trouvée · entraînement Dev
              </div>
              <div className="mt-1 text-lg font-black">
                Mot à trouver :{" "}
                <span className="text-amber-500">{currentWordLength} lettres</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black tabular-nums text-amber-500">{score}</div>
              <div className="text-[10px] font-bold uppercase opacity-60">points</div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-1.5 text-sm">
            <span className="font-bold">Série en cours</span>
            <span className="text-xl font-black text-violet-500">×{streak}</span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-60">
              Choisis la lettre manquante
            </div>
            <div className="flex rounded-lg border border-amber-400/35 p-0.5">
              {[4, 5].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setChoiceCount(count)}
                  className={`rounded-md px-2 py-1 text-[10px] font-black ${
                    choiceCount === count
                      ? "bg-amber-400 text-slate-950"
                      : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <div className={`mt-2 grid gap-2 ${choiceCount === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
            {choices.map((letter) => {
              const isSelected = feedback?.selected === letter;
              const isAnswer = feedback && currentPuzzle.answer === letter;
              const isWrongSelected = isSelected && feedback && !feedback.correct;
              return (
                <button
                  key={letter}
                  type="button"
                  disabled={!!feedback || phase !== "running"}
                  onClick={() => chooseLetter(letter)}
                  aria-label={`Choisir la lettre ${letter}`}
                  className={`relative aspect-square rounded-xl border text-[clamp(1.2rem,2vw,2rem)] font-black shadow transition active:scale-95 disabled:cursor-default ${
                    isAnswer
                      ? "border-emerald-100 bg-emerald-500 text-white"
                      : isWrongSelected
                      ? "border-rose-100 bg-rose-600 text-white"
                      : "border-amber-700/35 bg-gradient-to-br from-amber-50 to-amber-300 text-slate-950 hover:-translate-y-0.5"
                  }`}
                >
                  {letter === "Q" ? "Qu" : letter}
                  {isAnswer ? (
                    <span className="absolute -right-1 -top-2 text-lg text-white drop-shadow">✓</span>
                  ) : null}
                  {isWrongSelected ? (
                    <span className="absolute inset-0 flex items-center justify-center text-5xl text-white drop-shadow">
                      ×
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            className={`mt-3 flex min-h-[3.5rem] items-center justify-center rounded-xl border px-3 py-2 text-center ${
              feedback
                ? feedback.correct
                  ? "border-emerald-400/45 bg-emerald-500/15"
                  : "border-rose-400/45 bg-rose-500/15"
                : "border-slate-400/20 bg-slate-500/5"
            }`}
          >
            {feedback ? (
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-65">
                  Le mot à trouver était
                </div>
                <div
                  className={`text-xl font-black tracking-wide ${
                    feedback.correct ? "text-emerald-500" : "text-rose-500"
                  }`}
                >
                  {currentPuzzle.word}
                </div>
              </div>
            ) : (
              <div className="text-xs font-semibold opacity-60">
                Une seule proposition permet le mot de {currentWordLength} lettres.
              </div>
            )}
          </div>
        </div>

        {!compact ? (
          <>
            <div className="my-3 h-px shrink-0 bg-amber-400/20" />
            <div className="min-h-0 flex-1">
              <LiveFeed
                items={liveFeedItems}
                darkMode={darkMode}
                maxHeight="100%"
                bannerText="La manche cible continue pour les autres joueurs"
                getNickClassName={getNickClassName}
              />
            </div>
          </>
        ) : null}
      </div>
    );

  return (
    <>
      {gridHost ? createPortal(gridView, gridHost) : null}
      {sideHost ? createPortal(sideView, sideHost) : null}
    </>
  );
}
