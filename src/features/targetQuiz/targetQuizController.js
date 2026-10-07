import { TARGET_QUIZ_FEEDBACK_MS, TARGET_QUIZ_QUESTION_FADE_MS } from "../../../shared/targetQuizTiming.js";

const REQUEST_TIMEOUT_MS = 6000;

export function getTargetQuizRemainingSeconds(endsAt, now) {
  return Math.max(0, Math.ceil(((Number(endsAt) || 0) - now) / 1000));
}

function emptyState() {
  return {
    phase: "idle",
    question: null,
    feedback: null,
    transition: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    wrongCount: 0,
    progression: null,
    remainingSeconds: 0,
    endsAt: 0,
    canAnswer: false,
    error: "",
  };
}

// Owns only the active question. Answers, scoring and persistent progress stay on
// the server; leaving this surface releases every listener and timer.
export function createTargetQuizController({
  socket,
  roundId,
  devPreview = false,
  getNow = () => Date.now(),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let state = emptyState();
  let active = false;
  let visible = true;
  let endsAt = 0;
  let epoch = 0;
  let clockTimer = null;
  let feedbackTimer = null;
  let transitionTimer = null;
  let localFeedbackTimeline = null;
  let shownToken = "";
  let shownPending = false;
  let dismissal = null;
  let cancelDismissal = null;
  const pendingTimers = new Set();
  const listeners = new Set();

  const commit = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const clearPending = () => {
    cancelDismissal?.();
    epoch += 1;
    for (const timer of pendingTimers) clearTimeoutFn(timer);
    pendingTimers.clear();
    if (feedbackTimer !== null) clearTimeoutFn(feedbackTimer);
    feedbackTimer = null;
    if (transitionTimer !== null) clearTimeoutFn(transitionTimer);
    transitionTimer = null;
    localFeedbackTimeline = null;
    shownPending = false;
    shownToken = "";
  };
  const isConnected = () => !!socket?.connected;
  const stopOnServer = () => {
    if (!isConnected()) return;
    socket.emit("targetQuiz:stop", {
      roundId,
      ...(state.question?.questionToken
        ? { questionToken: state.question.questionToken }
        : {}),
    });
  };
  const finish = () => {
    clearPending();
    stopOnServer();
    if (clockTimer !== null) clearIntervalFn(clockTimer);
    clockTimer = null;
    commit({ phase: "finished", feedback: null, transition: null, canAnswer: false, remainingSeconds: 0, endsAt });
  };
  const tick = () => {
    const remainingSeconds = getTargetQuizRemainingSeconds(endsAt, getNow());
    if (endsAt && remainingSeconds === 0 && state.phase !== "finished") {
      finish();
    } else if (remainingSeconds !== state.remainingSeconds || state.endsAt !== endsAt) {
      commit({ remainingSeconds, endsAt });
    }
  };
  const send = (event, payload, onResponse) => {
    if (!active || !visible || !isConnected() || state.phase === "finished") return;
    const requestEpoch = epoch;
    let settled = false;
    const timer = setTimeoutFn(() => {
      pendingTimers.delete(timer);
      if (settled || requestEpoch !== epoch || !active) return;
      settled = true;
      clearPending();
      commit({
        phase: "error",
        feedback: null,
        transition: null,
        canAnswer: false,
        error: "La réponse du serveur tarde. Réessaie pour reprendre le mini-jeu.",
      });
    }, REQUEST_TIMEOUT_MS);
    pendingTimers.add(timer);
    socket.emit(event, { roundId, ...payload }, (response) => {
      if (settled) return;
      settled = true;
      clearTimeoutFn(timer);
      pendingTimers.delete(timer);
      if (requestEpoch !== epoch || !active || !visible) return;
      if (!response?.ok) {
        clearPending();
        commit({
          phase: "error",
          feedback: null,
          transition: null,
          canAnswer: false,
          error: "Le mini-jeu est momentanément indisponible. Réessaie pour reprendre.",
        });
        return;
      }
      if (response.roundId != null && String(response.roundId) !== String(roundId)) return;
      onResponse(response);
    });
  };
  const scheduleNext = (availableAt) => {
    if (feedbackTimer !== null) clearTimeoutFn(feedbackTimer);
    feedbackTimer = setTimeoutFn(() => {
      feedbackTimer = null;
      if (active && visible) requestQuestion();
    }, Math.max(20, Number(availableAt) - getNow() || 20));
  };
  const showPreparedQuestion = (nextQuestion, feedback, stats) => {
    if (feedbackTimer !== null) clearTimeoutFn(feedbackTimer);
    if (transitionTimer !== null) clearTimeoutFn(transitionTimer);
    feedbackTimer = null;
    transitionTimer = null;
    const reveal = () => {
      transitionTimer = null;
      if (!active || !visible) return;
      if (endsAt && getNow() >= endsAt) return finish();
      if (state.question?.questionToken !== nextQuestion.questionToken) shownToken = "";
      commit({ question: nextQuestion, transition: "in", canAnswer: false });
    };
    const complete = () => {
      feedbackTimer = null;
      if (!active || !visible) return;
      if (endsAt && getNow() >= endsAt) return finish();
      if (state.question?.questionToken !== nextQuestion.questionToken) shownToken = "";
      localFeedbackTimeline = null;
      commit({
        ...stats, phase: "running", question: nextQuestion, feedback: null, transition: null,
        canAnswer: shownToken === nextQuestion.questionToken, error: "", endsAt,
        remainingSeconds: getTargetQuizRemainingSeconds(endsAt, getNow()),
      });
    };
    const currentTime = getNow();
    if (currentTime >= feedback.availableAt) {
      complete();
      return;
    }
    if (currentTime >= feedback.nextQuestionAt) reveal();
    else transitionTimer = setTimeoutFn(reveal, feedback.nextQuestionAt - currentTime);
    feedbackTimer = setTimeoutFn(complete, feedback.availableAt - currentTime);
  };
  const acceptState = (response, freshAnswer = false) => {
    if (Number(response.endsAt) > 0) endsAt = Number(response.endsAt);
    const stats = { endsAt, ...(response.progression ? { progression: response.progression } : {}) };
    for (const key of ["score", "streak", "bestStreak", "correctCount", "wrongCount"]) {
      if (Number.isFinite(Number(response[key]))) stats[key] = Number(response[key]);
    }
    const question = response.question || null;
    let feedback = response.feedback || null;
    if (freshAnswer && feedback && response.nextQuestion) {
      const receivedAt = getNow();
      localFeedbackTimeline = {
        questionToken: feedback.questionToken,
        nextQuestionAt: receivedAt + TARGET_QUIZ_QUESTION_FADE_MS,
        availableAt: receivedAt + TARGET_QUIZ_FEEDBACK_MS,
      };
    }
    if (feedback && feedback.questionToken === localFeedbackTimeline?.questionToken) {
      feedback = { ...feedback, ...localFeedbackTimeline };
    }
    if (response.phase === "finished" || (endsAt && getNow() >= endsAt)) {
      commit(stats);
      finish();
      return;
    }
    if (feedback) {
      const hasPreparedQuestion = response.nextQuestion?.questionToken && response.nextQuestion.choices?.length === 4 &&
        Number.isFinite(feedback.nextQuestionAt);
      const revealingNext = hasPreparedQuestion && getNow() >= feedback.nextQuestionAt;
      commit({
        ...stats,
        phase: "feedback",
        question: revealingNext ? response.nextQuestion : question || state.question,
        feedback,
        transition: hasPreparedQuestion ? (revealingNext ? "in" : "out") : null,
        canAnswer: false,
        error: "",
      });
      if (hasPreparedQuestion) {
        showPreparedQuestion(response.nextQuestion, feedback, stats);
      } else scheduleNext(feedback.availableAt);
      return;
    }
    if (!question?.questionToken || !Array.isArray(question.choices) || question.choices.length !== 4) {
      commit({ ...stats, phase: "error", canAnswer: false, error: "La question n’est pas disponible. Réessaie pour reprendre." });
      return;
    }
    if (question.questionToken !== state.question?.questionToken) shownToken = "";
    commit({
      ...stats,
      phase: "running",
      question,
      feedback: null,
      transition: null,
      error: "",
      canAnswer: shownToken === question.questionToken,
      remainingSeconds: getTargetQuizRemainingSeconds(endsAt, getNow()),
    });
  };
  const requestQuestion = () => {
    if (!active || !visible) return;
    if (endsAt && getNow() >= endsAt) return finish();
    clearPending();
    if (!isConnected()) {
      commit({ phase: "disconnected", canAnswer: false, error: "" });
      return;
    }
    // Keep the existing card mounted during reconnect/retry; the view can use
    // `question` to avoid replacing it with a loading panel.
    commit({ phase: "loading", canAnswer: false, feedback: null, transition: null, error: "" });
    send("targetQuiz:start", devPreview ? { devPreview: true } : {}, acceptState);
  };
  const onConnect = () => requestQuestion();
  const onDisconnect = () => {
    clearPending();
    commit({ phase: "disconnected", feedback: null, transition: null, canAnswer: false });
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    activate({ deadline, isVisible = true } = {}) {
      if (active) return;
      active = true;
      visible = isVisible;
      endsAt = Number(deadline) || 0;
      socket?.on?.("connect", onConnect);
      socket?.on?.("disconnect", onDisconnect);
      clockTimer = setIntervalFn(tick, 200);
      commit({ ...emptyState(), endsAt, remainingSeconds: getTargetQuizRemainingSeconds(endsAt, getNow()) });
      if (visible) requestQuestion();
      else commit({ phase: "paused" });
    },
    deactivate() {
      if (!active) return;
      stopOnServer();
      active = false;
      clearPending();
      if (clockTimer !== null) clearIntervalFn(clockTimer);
      clockTimer = null;
      socket?.off?.("connect", onConnect);
      socket?.off?.("disconnect", onDisconnect);
    },
    dismiss() {
      if (dismissal) return dismissal;
      if (!active || !isConnected() || state.phase === "finished") return Promise.resolve(false);
      clearPending();
      commit({ phase: "submitting", canAnswer: false, feedback: null, transition: null });
      dismissal = new Promise(resolve => {
        let settled = false;
        const finishDismissal = response => {
          if (settled) return;
          settled = true;
          cancelDismissal = null;
          clearTimeoutFn(timer);
          pendingTimers.delete(timer);
          if (!response?.ok) {
            dismissal = null;
            if (active) commit({ phase: "error", error: "L’annulation n’a pas été confirmée. Reconnecte-toi puis réessaie.", canAnswer: false });
            resolve(false);
            return;
          }
          active = false;
          if (clockTimer !== null) clearIntervalFn(clockTimer);
          clockTimer = null;
          socket?.off?.("connect", onConnect);
          socket?.off?.("disconnect", onDisconnect);
          commit({ ...response, question: state.question, phase: "dismissed", canAnswer: false });
          resolve(true);
        };
        const timer = setTimeoutFn(() => finishDismissal(null), REQUEST_TIMEOUT_MS);
        cancelDismissal = () => finishDismissal(null);
        pendingTimers.add(timer);
        socket.emit("targetQuiz:dismiss", { roundId }, finishDismissal);
      });
      return dismissal;
    },
    setDeadline(deadline) {
      if (Number(deadline) > 0) endsAt = Number(deadline);
      if (active) tick();
    },
    setVisible(nextVisible) {
      if (!active || visible === nextVisible) return;
      visible = nextVisible;
      if (!visible) {
        stopOnServer();
        clearPending();
        if (state.phase !== "finished") commit({ phase: "paused", feedback: null, transition: null, canAnswer: false });
      } else if (state.phase !== "finished") {
        requestQuestion();
      }
    },
    markShown(questionToken) {
      const canBeShown = state.phase === "running" || (state.phase === "feedback" && state.transition === "in");
      if (!active || !visible || !canBeShown || shownPending ||
          state.question?.questionToken !== questionToken || shownToken === questionToken) return;
      shownPending = true;
      send("targetQuiz:shown", { questionToken }, (response) => {
        shownPending = false;
        shownToken = questionToken;
        if (response.phase === "finished") acceptState(response);
        else if (localFeedbackTimeline && state.phase === "feedback") {
          // The server's cooldown may have elapsed during network travel; its
          // display ACK must not shorten or restart this client's visible fade.
          commit({ canAnswer: false });
        } else if (response.feedback) acceptState(response);
        else if (state.question?.questionToken === questionToken) commit({ canAnswer: state.phase === "running" });
      });
    },
    answer(choiceIndex) {
      if (!active || !visible || state.phase !== "running" || !state.canAnswer ||
          !Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 3) return false;
      if (endsAt && getNow() >= endsAt) {
        finish();
        return false;
      }
      const questionToken = state.question.questionToken;
      commit({ phase: "submitting", canAnswer: false });
      send("targetQuiz:answer", { questionToken, choiceIndex }, response => acceptState(response, true));
      return true;
    },
    retry: requestQuestion,
  };
}
