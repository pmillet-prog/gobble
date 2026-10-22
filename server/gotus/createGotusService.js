import { GOTUS_MAX_ATTEMPTS, GOTUS_WORD_LENGTH, evaluateGotusGuess, normalizeGotusSummary, normalizeGotusWord } from "../../shared/gotusRules.js";

const roundKey = (roomId, roundId) => `${roomId}#${roundId}`;
const copy = value => structuredClone(value);

export function createGotusService({ loadCatalog, loadProfile = async () => null, recordWin, now = Date.now, random = Math.random }) {
  const rounds = new Map();
  const queues = new Map();
  const preparations = new WeakMap();

  function serialize(context, operation) {
    const key = `${context.roundId}:${context.playerKey}`;
    const previous = queues.get(key)?.promise || Promise.resolve();
    const promise = previous.then(operation, operation);
    const done = promise.then(() => undefined, () => undefined);
    const entry = { promise: done, roundId: context.roundId };
    queues.set(key, entry);
    done.then(() => { if (queues.get(key) === entry) queues.delete(key); });
    return promise;
  }

  function requireRound(context, { allowClosed = false } = {}) {
    const round = context.room?.currentRound;
    if (round?.training || context.player?.standaloneTraining?.sessionId || context.player?.trainingPresenceOnly) throw new Error("training_disabled");
    if (String(round?.id) !== String(context.publicRoundId)) throw new Error("stale_round");
    const state = rounds.get(context.roundId);
    if (!state || state.round !== round || round.targetMiniGame?.kind !== "gotus") throw new Error("mini_game_unavailable");
    if (!allowClosed && (state.closed || round.status !== "running" || now() >= round.endsAt)) throw new Error("round_finished");
    return state;
  }

  function snapshot(state, session) {
    const phase = state.closed && ["playing", "dismissed"].includes(session.phase) ? "expired" : session.phase;
    const terminal = ["won", "lost", "expired"].includes(phase);
    const summary = normalizeGotusSummary({
      phase, won: phase === "won", attemptsUsed: session.attempts.length,
      ...(terminal ? { solution: state.word } : {}),
    });
    return {
      ok: true,
      roundId: state.round.id,
      puzzleIndex: 0,
      phase,
      endsAt: state.round.endsAt,
      firstLetter: state.word[0],
      wordLength: GOTUS_WORD_LENGTH,
      maxAttempts: GOTUS_MAX_ATTEMPTS,
      known: [...session.known],
      attempts: copy(session.attempts),
      remainingAttempts: GOTUS_MAX_ATTEMPTS - session.attempts.length,
      won: summary.won,
      wordsFound: summary.wordsFound,
      summary,
      progression: copy(session.progression),
      ...(terminal ? { solution: state.word } : {}),
    };
  }

  function publish(state, session) {
    const result = snapshot(state, session);
    session.onSummary?.(result);
    return result;
  }

  async function settleWin(state, session) {
    if (session.phase !== "won" || session.persisted || session.context.devPreview) return;
    const context = session.context;
    const result = await recordWin({
      userId: context.userId,
      installId: context.installId,
      nick: context.nick,
      roomId: context.room.id,
      roundId: String(context.publicRoundId),
      wonAt: session.wonAt,
      attemptsUsed: session.attempts.length,
      training: false,
    });
    if (result?.ok === false) throw new Error(result.error || "gotus_save_failed");
    session.persisted = true;
    if (result?.progression) session.progression = result.progression;
  }

  async function getOrCreateSession(context, onSummary) {
    const state = requireRound(context);
    let session = state.sessions.get(context.playerKey);
    if (!session) {
      const profile = context.devPreview ? null : await loadProfile(context.userId);
      requireRound(context);
      session = {
        context, phase: "playing", attempts: [], known: [...state.word].map((letter, index) => index === 0 ? letter : ""),
        requests: new Map(), progression: profile ? { before: profile, after: profile, reward: null } : null,
        persisted: false, wonAt: null, onSummary,
      };
      state.sessions.set(context.playerKey, session);
    }
    session.context = context;
    if (onSummary) session.onSummary = onSummary;
    await settleWin(state, session);
    return { state, session };
  }

  return Object.freeze({
    async prepareRound(roomId, round) {
      if (round.training || !["target_long", "target_score"].includes(round.special?.type)) return null;
      if (round.targetMiniGame) return round.targetMiniGame;
      if (!preparations.has(round)) {
        const prepare = async () => {
          const kind = random() < 0.5 ? "quiz" : "gotus";
          const catalog = kind === "gotus" ? await loadCatalog() : null;
          round.targetMiniGame = kind === "gotus"
            ? { kind, wordLength: GOTUS_WORD_LENGTH, maxAttempts: GOTUS_MAX_ATTEMPTS }
            : { kind };
          if (catalog) rounds.set(roundKey(roomId, round.id), { round, catalog, word: catalog.choose(random), sessions: new Map(), closed: false });
          return round.targetMiniGame;
        };
        preparations.set(round, prepare());
      }
      try { return await preparations.get(round); }
      finally { preparations.delete(round); }
    },

    start(context) {
      return serialize(context, async () => {
        const { state, session } = await getOrCreateSession(context, context.onSummary);
        return publish(state, session);
      });
    },

    guess(context, payload = {}) {
      return serialize(context, async () => {
        const state = requireRound(context);
        const session = state.sessions.get(context.playerKey);
        if (!session) throw new Error("gotus_session_missing");
        if (payload.puzzleIndex != null && payload.puzzleIndex !== 0) throw new Error("stale_puzzle");
        const requestId = String(payload.requestId || "");
        if (!requestId || requestId.length > 128) throw new Error("invalid_request_id");
        const word = normalizeGotusWord(payload.word);
        const previous = session.requests.get(requestId);
        if (previous) {
          if (previous.word !== word) throw new Error("request_conflict");
          await settleWin(state, session);
          return previous.result ? copy(previous.result) : publish(state, session);
        }
        if (session.phase !== "playing") return { ...snapshot(state, session), ok: false, error: "gotus_finished" };
        if (!/^[A-Z]{6}$/.test(word)) return { ...snapshot(state, session), ok: false, error: "invalid_word" };
        if (!state.catalog.has(word)) return { ...snapshot(state, session), ok: false, error: "unknown_word" };
        if (session.attempts.some(attempt => attempt.word === word)) return { ...snapshot(state, session), ok: false, error: "duplicate_guess" };
        const marks = evaluateGotusGuess(state.word, word);
        session.attempts.push({ word, marks });
        session.known = session.known.map((letter, index) => marks[index] === "correct" ? word[index] : letter);
        session.phase = word === state.word ? "won" : session.attempts.length >= GOTUS_MAX_ATTEMPTS ? "lost" : "playing";
        if (session.phase === "won") session.wonAt = now();
        const receipt = { word, result: null };
        session.requests.set(requestId, receipt);
        await settleWin(state, session);
        receipt.result = publish(state, session);
        return copy(receipt.result);
      });
    },

    dismiss(context) {
      return serialize(context, async () => {
        const state = requireRound(context);
        const session = state.sessions.get(context.playerKey);
        if (!session) throw new Error("gotus_session_missing");
        if (session.phase === "playing") session.phase = "dismissed";
        await settleWin(state, session);
        return publish(state, session);
      });
    },

    async closeRoomRound(roomId, publicRoundId) {
      const key = roundKey(roomId, publicRoundId);
      const state = rounds.get(key);
      if (!state) return;
      state.closed = true;
      await Promise.all([...queues.values()].filter(entry => entry.roundId === key).map(entry => entry.promise));
      const results = await Promise.allSettled([...state.sessions.values()].map(async session => {
        await settleWin(state, session);
        publish(state, session);
      }));
      rounds.delete(key);
      const failure = results.find(result => result.status === "rejected");
      if (failure) throw failure.reason;
    },
  });
}
