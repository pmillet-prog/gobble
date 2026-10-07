import { randomUUID } from "node:crypto";
import { TARGET_QUIZ_FEEDBACK_MS, TARGET_QUIZ_QUESTION_FADE_MS } from "../../shared/targetQuizTiming.js";

const REPLAY_BELOW_MS = 5000;

function validatePlayerKey(playerKey) {
  if (typeof playerKey !== "string" || !playerKey || playerKey.length > 200) {
    throw new Error("invalid_target_quiz_player");
  }
}

function normalizeRoundId(roundId) {
  if ((typeof roundId !== "string" && typeof roundId !== "number") || !String(roundId)) {
    throw new Error("invalid_target_quiz_round");
  }
  return String(roundId);
}

function normalizeProgress(progress, catalog) {
  if (progress?.version !== catalog.version ||
      !Number.isInteger(progress.routeIndex) || progress.routeIndex < 0 ||
      progress.routeIndex >= catalog.routeCount ||
      !Number.isInteger(progress.questionIndex) || progress.questionIndex < 0 ||
      progress.questionIndex >= catalog.questionCount) {
    return { version: catalog.version, routeIndex: 0, questionIndex: 0 };
  }
  return { version: catalog.version, routeIndex: progress.routeIndex, questionIndex: progress.questionIndex };
}

function publicQuestion(question) {
  if (!question) return null;
  return {
    id: question.id,
    questionToken: question.questionToken,
    definition: question.definition,
    mode: question.mode,
    choices: [...question.choices],
  };
}

function view(session, phase = session.phase) {
  return {
    ok: true,
    roundId: session.roundId,
    endsAt: session.endsAt,
    phase,
    score: session.score,
    streak: session.streak,
    bestStreak: session.bestStreak,
    correctCount: session.correctCount,
    wrongCount: session.wrongCount,
    progression: session.progression,
    ...(session.cancelled ? { cancelled: true } : {}),
    question: phase === "feedback" ? publicQuestion(session.feedbackQuestion)
      : phase === "question" ? publicQuestion(session.question) : null,
    nextQuestion: phase === "feedback" ? publicQuestion(session.question) : null,
    feedback: phase === "feedback" ? { ...session.feedback } : null,
  };
}

// Callers supply server-derived eligibility/identity only. Client round IDs or deadlines
// must never be used to grant entry. All work for an identity is serialized, including I/O.
export function createTargetQuizService({
  loadCatalog,
  loadProgress,
  saveProgress,
  loadPoints = async () => null,
  saveAnswer = null,
  finishPoints = null,
  onReward = () => {},
  now = Date.now,
  createId = randomUUID,
  timers = { setTimeout, clearTimeout },
  onError = error => console.error("[target-quiz] expiry failed", error.message),
}) {
  const sessions = new Map();
  const queues = new Map();
  const closedRounds = new Map();
  const finishedPlayers = new Map();
  let expiryTimer = null;
  let disposed = false;

  function pruneClosures() {
    const at = now();
    for (const [roundId, expiresAt] of closedRounds) {
      if (expiresAt <= at) closedRounds.delete(roundId);
    }
    for (const [playerKey, finished] of finishedPlayers) {
      if (finished.until <= at) finishedPlayers.delete(playerKey);
    }
  }

  async function settle(session, cancelled = false) {
    if (session.settled) return;
    const progression = await finishPoints?.({ playerKey: session.playerKey, roundId: session.roundId, cancelled });
    if (progression) session.progression = { ...progression, settled: true };
    if (cancelled) {
      session.cancelled = true;
      session.score = 0;
      session.streak = 0;
      if (session.progression) session.progression = { before: session.progression.before, after: session.progression.before, steps: [], rewards: [], settled: true };
    }
    session.settled = true;
    if (!cancelled) for (const reward of progression?.rewards || []) {
      try { onReward({ playerKey: session.playerKey, roundId: session.roundId, reward }); } catch (error) { onError(error); }
    }
    session.onSummary?.(view(session));
  }

  async function forgetSession(session) {
    await settle(session);
    sessions.delete(session.playerKey);
    if (session.roundEndsAt > now()) {
      finishedPlayers.set(session.playerKey, { roundId: session.roundId, until: session.roundEndsAt });
    }
  }

  function serialize(playerKey, operation) {
    validatePlayerKey(playerKey);
    const previous = queues.get(playerKey) || Promise.resolve();
    const pending = previous.then(operation, operation);
    const settled = pending.then(() => undefined, () => undefined);
    queues.set(playerKey, settled);
    settled.then(() => {
      if (queues.get(playerKey) === settled) queues.delete(playerKey);
    });
    return pending;
  }

  function scheduleExpiry() {
    if (!timers) return;
    if (expiryTimer !== null) timers.clearTimeout(expiryTimer);
    expiryTimer = null;
    if (disposed || (sessions.size === 0 && finishedPlayers.size === 0)) return;
    const deadline = Math.min(...[...sessions.values()].map(session => session.endsAt),
      ...[...finishedPlayers.values()].map(finished => finished.until));
    expiryTimer = timers.setTimeout(() => {
      expiryTimer = null;
      closeExpired().catch(onError);
    }, Math.max(1000, deadline - now()));
    expiryTimer?.unref?.();
  }

  async function advance(session) {
    const next = { version: session.catalog.version, ...session.catalog.advance(session.cursor) };
    // Do not consume a question or award points until its cursor is durable.
    await saveProgress(session.playerKey, next);
    session.cursor = next;
  }

  function makeQuestion(session) {
    return { ...session.catalog.getQuestion(session.cursor), questionToken: createId() };
  }

  function finishFeedback(session, at = now()) {
    if (session.phase !== "feedback" || at < session.feedback.availableAt) return;
    session.phase = "question";
    session.feedback = null;
    session.feedbackQuestion = null;
  }

  async function interrupt(session, interruptedAt, preserveFeedback = false) {
    session.pendingInterruptionAt ??= interruptedAt;
    if (session.question && session.shownAt !== null &&
        Math.max(0, Math.min(session.pendingInterruptionAt, session.endsAt) - session.shownAt) >= REPLAY_BELOW_MS) {
      await advance(session);
    }
    if (preserveFeedback && session.phase === "feedback" && interruptedAt < session.feedback.availableAt) {
      // The prepared question has only just appeared. Reissue its token on resume
      // and keep the answered question's short reaction/cooldown intact.
      session.question = makeQuestion(session);
      session.shownAt = null;
      session.pendingInterruptionAt = null;
      return;
    }
    session.question = null;
    session.shownAt = null;
    session.feedback = null;
    session.feedbackQuestion = null;
    session.previousQuestionToken = null;
    session.phase = "stopped";
    session.pendingInterruptionAt = null;
  }

  function getSession(playerKey, roundId) {
    const session = sessions.get(playerKey);
    if (!session || session.roundId !== roundId) throw new Error("target_quiz_session_missing");
    return session;
  }

  async function requireActive(playerKey, roundId) {
    const session = getSession(playerKey, roundId);
    if (disposed || closedRounds.has(roundId) || now() >= session.endsAt) {
      await interrupt(session, now());
      await forgetSession(session);
      scheduleExpiry();
      throw new Error("target_quiz_round_finished");
    }
    if (session.pendingInterruptionAt !== null) {
      await interrupt(session, session.pendingInterruptionAt);
      throw new Error("target_quiz_question_stale");
    }
    finishFeedback(session);
    return session;
  }

  async function closeExpired() {
    const at = now();
    pruneClosures();
    const results = await Promise.allSettled([...sessions.values()]
      .filter(session => session.endsAt <= at)
      .map(session => serialize(session.playerKey, async () => {
        if (sessions.get(session.playerKey) !== session || session.endsAt > now()) return;
        await interrupt(session, at);
        await forgetSession(session);
      })));
    scheduleExpiry();
    const failure = results.find(result => result.status === "rejected");
    if (failure) throw failure.reason;
  }

  return {
    start({ playerKey, roundId: rawRoundId, endsAt, roundEndsAt = endsAt, onSummary }) {
      const roundId = normalizeRoundId(rawRoundId);
      return serialize(playerKey, async () => {
        pruneClosures();
        if (disposed || closedRounds.has(roundId) || !Number.isFinite(endsAt) || endsAt <= now() ||
            !Number.isFinite(roundEndsAt) || roundEndsAt < endsAt ||
            finishedPlayers.get(playerKey)?.roundId === roundId) {
          throw new Error("target_quiz_round_finished");
        }
        let session = sessions.get(playerKey);
        if (session && session.roundId !== roundId) {
          await interrupt(session, now());
          await settle(session);
          sessions.delete(playerKey);
          session = null;
        }
        if (!session) {
          const catalog = await loadCatalog();
          const cursor = normalizeProgress(await loadProgress(playerKey), catalog);
          const points = await loadPoints(playerKey);
          if (disposed || closedRounds.has(roundId) || endsAt <= now()) {
            throw new Error("target_quiz_round_finished");
          }
          session = {
            playerKey, roundId, endsAt, roundEndsAt, catalog, cursor, pendingInterruptionAt: null,
            phase: "stopped", question: null, shownAt: null, feedback: null, feedbackQuestion: null,
            previousQuestionToken: null,
            score: 0, streak: 0, bestStreak: 0, correctCount: 0, wrongCount: 0,
            progression: points ? { before: points, after: points, steps: [], rewards: [] } : null,
          };
          sessions.set(playerKey, session);
        }
        // Repeated starts cannot lengthen a session, including after a reconnect.
        session.onSummary = onSummary;
        session.endsAt = Math.min(session.endsAt, endsAt);
        session.roundEndsAt = Math.min(session.roundEndsAt, roundEndsAt);
        if (session.endsAt <= now()) {
          await interrupt(session, now());
          await forgetSession(session);
          scheduleExpiry();
          throw new Error("target_quiz_round_finished");
        }
        if (session.pendingInterruptionAt !== null) await interrupt(session, session.pendingInterruptionAt);
        if (disposed || closedRounds.has(roundId) || session.endsAt <= now()) {
          await interrupt(session, now());
          await forgetSession(session);
          scheduleExpiry();
          throw new Error("target_quiz_round_finished");
        }
        finishFeedback(session);
        if (session.phase === "feedback") {
          scheduleExpiry();
          return view(session);
        }
        if (session.phase !== "question") {
          session.question = makeQuestion(session);
          session.phase = "question";
          session.feedback = null;
          session.shownAt = null;
        }
        scheduleExpiry();
        return view(session);
      });
    },
    shown({ playerKey, roundId: rawRoundId, questionToken }) {
      const roundId = normalizeRoundId(rawRoundId);
      const receivedAt = now();
      return serialize(playerKey, async () => {
        const session = await requireActive(playerKey, roundId);
        const isPreview = session.phase === "feedback" && receivedAt >= session.feedback.nextQuestionAt;
        if ((session.phase !== "question" && !isPreview) || session.question?.questionToken !== questionToken) {
          throw new Error("target_quiz_question_stale");
        }
        if (session.shownAt === null) session.shownAt = receivedAt;
        session.onSummary?.(view(session));
        session.previousQuestionToken = null;
        return view(session);
      });
    },
    answer({ playerKey, roundId: rawRoundId, questionToken, choiceIndex }) {
      const roundId = normalizeRoundId(rawRoundId);
      return serialize(playerKey, async () => {
        const session = await requireActive(playerKey, roundId);
        if (session.phase !== "question" || session.question?.questionToken !== questionToken) {
          throw new Error("target_quiz_question_stale");
        }
        if (session.shownAt === null) throw new Error("target_quiz_question_not_shown");
        if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= session.question.choices.length) {
          throw new Error("target_quiz_choice_invalid");
        }
        const correct = choiceIndex === session.question.answerIndex;
        const streak = correct ? session.streak + 1 : 0;
        const delta = correct ? Math.min(200, 100 + (streak - 1) * 25) : -75;
        if (saveAnswer) {
          const progress = { version: session.catalog.version, ...session.catalog.advance(session.cursor) };
          const receipt = await saveAnswer({ playerKey, roundId, questionToken, delta, progress, endsAt: session.endsAt });
          session.cursor = progress;
          if (receipt) {
            session.progression = {
              before: session.progression?.before || receipt.before,
              after: receipt.after,
              steps: [...(session.progression?.steps || []), delta],
              rewards: [...(session.progression?.rewards || []), ...(receipt.reward ? [receipt.reward] : [])],
            };
            if (receipt.reward) {
              try { onReward({ playerKey, roundId, reward: receipt.reward }); } catch (error) { onError(error); }
            }
          }
        } else await advance(session);
        const availableAt = now() + TARGET_QUIZ_FEEDBACK_MS;
        session.score += delta;
        session.streak = streak;
        session.bestStreak = Math.max(session.bestStreak, streak);
        session.correctCount += correct ? 1 : 0;
        session.wrongCount += correct ? 0 : 1;
        session.onSummary?.(view(session));
        session.phase = "feedback";
        session.feedbackQuestion = session.question;
        session.previousQuestionToken = session.question.questionToken;
        session.question = makeQuestion(session);
        session.shownAt = null;
        session.feedback = {
          questionToken, selectedIndex: choiceIndex, answerIndex: session.feedbackQuestion.answerIndex,
          correct, delta, availableAt, nextQuestionAt: availableAt - TARGET_QUIZ_QUESTION_FADE_MS,
        };
        return view(session);
      });
    },
    stop({ playerKey, roundId: rawRoundId, questionToken }) {
      const roundId = normalizeRoundId(rawRoundId);
      const interruptedAt = now();
      return serialize(playerKey, async () => {
        const session = sessions.get(playerKey);
        if (!session || session.roundId !== roundId) return { ok: true, roundId, phase: "stopped" };
        finishFeedback(session, interruptedAt);
        if (questionToken && session.question?.questionToken !== questionToken &&
            !(session.shownAt === null && session.previousQuestionToken === questionToken)) return view(session);
        await interrupt(session, interruptedAt, true);
        const finished = interruptedAt >= session.endsAt || closedRounds.has(roundId);
        if (finished) await forgetSession(session);
        scheduleExpiry();
        return view(session, finished ? "finished" : "stopped");
      });
    },
    dismiss({ playerKey, roundId: rawRoundId }) {
      const roundId = normalizeRoundId(rawRoundId);
      const at = now();
      return serialize(playerKey, async () => {
        const session = getSession(playerKey, roundId);
        if (at >= session.endsAt || session.settled) throw new Error("target_quiz_round_finished");
        await interrupt(session, at);
        await settle(session, true);
        await forgetSession(session);
        scheduleExpiry();
        return view(session, "stopped");
      });
    },
    async closeRound(rawRoundId) {
      const roundId = normalizeRoundId(rawRoundId);
      pruneClosures();
      // Register before awaiting in-flight starts/saves, so none can issue a late question.
      closedRounds.set(roundId, Math.max(now() + 60_000,
        ...[...sessions.values()].filter(session => session.roundId === roundId).map(session => session.endsAt)));
      const keys = new Set([...sessions.keys(), ...queues.keys()]);
      const results = await Promise.allSettled([...keys].map(playerKey => serialize(playerKey, async () => {
        const session = sessions.get(playerKey);
        if (!session || session.roundId !== roundId) return;
        await interrupt(session, now());
        await forgetSession(session);
      })));
      for (const [playerKey, finished] of finishedPlayers) {
        if (finished.roundId === roundId) finishedPlayers.delete(playerKey);
      }
      scheduleExpiry();
      const failure = results.find(result => result.status === "rejected");
      if (failure) throw failure.reason;
    },
    closeExpired,
    async dispose() {
      disposed = true;
      if (expiryTimer !== null) timers?.clearTimeout(expiryTimer);
      expiryTimer = null;
      const results = await Promise.allSettled([...new Set([...sessions.keys(), ...queues.keys()])]
        .map(playerKey => serialize(playerKey, async () => {
          const session = sessions.get(playerKey);
          if (!session) return;
          await interrupt(session, now());
          await settle(session);
          sessions.delete(playerKey);
        })));
      closedRounds.clear();
      finishedPlayers.clear();
      const failure = results.find(result => result.status === "rejected");
      if (failure) throw failure.reason;
    },
  };
}
