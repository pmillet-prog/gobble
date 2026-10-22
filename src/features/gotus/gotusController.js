import { GOTUS_MAX_ATTEMPTS, GOTUS_WORD_LENGTH, evaluateGotusGuess, normalizeGotusWord } from "../../../shared/gotusRules.js";

const REVEAL_MS = 260;
const REQUEST_TIMEOUT_MS = 6000;
const TERMINAL = new Set(["won", "lost", "expired", "dismissed"]);
const ERROR_MESSAGES = {
  invalid_word: "Il faut un mot de six lettres.", unknown_word: "Ce mot ne figure pas dans le dictionnaire.",
  duplicate_guess: "Ce mot a déjà été proposé.", request_conflict: "Cette proposition a déjà été traitée. Reprends la partie.",
};
let trainingBankPromise;
const loadBrowserTrainingWords = () => trainingBankPromise ||= fetch("/gotus/words.json").then(response => {
  if (!response.ok) throw new Error("Banque indisponible");
  return response.json();
}).catch(error => { trainingBankPromise = null; throw error; });

const initialState = () => ({
  phase: "idle", firstLetter: "", known: Array(GOTUS_WORD_LENGTH).fill(""), attempts: [],
  draft: "", revealed: GOTUS_WORD_LENGTH, remainingAttempts: GOTUS_MAX_ATTEMPTS,
  remainingSeconds: 0, endsAt: 0, canAnswer: false, error: "", solution: "", summary: null,
  wordsFound: 0, progression: null,
});

// Owns the active puzzle and all of its timers/listeners. Live answers and rewards
// are server-owned; training uses only an in-memory dictionary and never emits.
export function createGotusController({
  socket, roundId, mode = "live", getNow = () => Date.now(),
  schedule = setTimeout, cancel = clearTimeout, repeat = setInterval, cancelRepeat = clearInterval,
  loadTrainingWords = loadBrowserTrainingWords, random = Math.random,
} = {}) {
  const training = mode === "training";
  let state = initialState(), authoritative = null, active = false, visible = true;
  let epoch = 0, requestSequence = 0, requestVersion = 0, deadline = 0, revealTimer = null, clockTimer = null, requestTimer = null;
  let pendingDismiss = null;
  let trainingBank = null, trainingTarget = "";
  const listeners = new Set(), cueListeners = new Set();
  const commit = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const cue = value => cueListeners.forEach(listener => listener(value));
  const clearTimers = () => {
    epoch++;
    pendingDismiss?.(false); pendingDismiss = null;
    if (requestTimer !== null) cancel(requestTimer);
    if (revealTimer !== null) cancel(revealTimer);
    requestTimer = revealTimer = null;
    cue({ type: "reset" });
  };
  const remainingSeconds = () => Math.max(0, Math.ceil((deadline - getNow()) / 1000));
  const finishReveal = token => {
    revealTimer = null;
    if (!active || !visible || token !== epoch || !authoritative) return;
    if (state.revealed < GOTUS_WORD_LENGTH) {
      const column = state.revealed;
      commit({ revealed: column + 1 });
      cue({ type: "letter", mark: state.attempts.at(-1).marks[column], index: column, row: state.attempts.length - 1 });
      revealTimer = schedule(() => finishReveal(token), REVEAL_MS);
      return;
    }
    commit({ ...authoritative, draft: authoritative.firstLetter || "", revealed: GOTUS_WORD_LENGTH,
      canAnswer: authoritative.phase === "playing", error: "" });
    if (state.phase === "won" || (state.phase === "lost" && state.attempts.length === GOTUS_MAX_ATTEMPTS)) {
      cue({ type: state.phase, row: state.attempts.length - 1 });
    }
  };
  const accept = (response, animate = false) => {
    if (!active || (response.roundId != null && String(response.roundId) !== String(roundId))) return;
    const attempts = Array.isArray(response.attempts) ? response.attempts : [];
    if (!training && attempts.length < state.attempts.length) return;
    const snapshot = {
      phase: response.phase || "playing", firstLetter: response.firstLetter || state.firstLetter,
      known: response.known || state.known, attempts, remainingAttempts: response.remainingAttempts ?? GOTUS_MAX_ATTEMPTS - attempts.length,
      endsAt: Number(response.endsAt) || deadline, remainingSeconds: training ? 0 : remainingSeconds(),
      solution: response.solution || "", summary: response.summary || null,
      wordsFound: response.wordsFound ?? response.summary?.wordsFound ?? 0,
      progression: response.progression || state.progression,
    };
    if (snapshot.endsAt) deadline = snapshot.endsAt;
    const newer = attempts.length > state.attempts.length;
    authoritative = snapshot;
    // The private progress push and the ACK may describe the same accepted guess.
    // Preserve the in-flight reveal instead of replaying or skipping its letters.
    if (state.phase === "revealing" && !newer && attempts.at(-1)?.word === state.attempts.at(-1)?.word) return;
    if (newer && animate && visible) {
      if (revealTimer !== null) cancel(revealTimer);
      commit({ ...snapshot, phase: "revealing", revealed: 0, canAnswer: false, error: "",
        summary: state.summary, progression: state.progression, wordsFound: state.wordsFound, solution: "" });
      const token = epoch;
      revealTimer = schedule(() => finishReveal(token), REVEAL_MS);
    } else {
      if (revealTimer !== null) cancel(revealTimer);
      revealTimer = null;
      commit({ ...snapshot, revealed: GOTUS_WORD_LENGTH, draft: snapshot.firstLetter, canAnswer: snapshot.phase === "playing", error: "" });
    }
  };
  const tick = () => {
    if (!active || training) return;
    const remaining = remainingSeconds();
    if (remaining === 0 && deadline) {
      clearTimers();
      if (clockTimer !== null) cancelRepeat(clockTimer);
      clockTimer = null;
      commit({ phase: TERMINAL.has(state.phase) ? state.phase : "expired", canAnswer: false, remainingSeconds: 0 });
    } else if (remaining !== state.remainingSeconds) commit({ remainingSeconds: remaining });
  };
  const send = (event, payload, onResponse, onFailure = () => {}) => {
    if (!active || !visible || !socket?.connected) return false;
    const token = epoch, version = ++requestVersion;
    let settled = false;
    requestTimer = schedule(() => {
      requestTimer = null;
      if (settled || token !== epoch || version !== requestVersion || !active) return;
      settled = true;
      commit({ phase: "error", canAnswer: false, error: "La réponse du serveur tarde. Reprends la partie pour retrouver tes essais." });
      onFailure();
    }, REQUEST_TIMEOUT_MS);
    socket.emit(event, { roundId, ...payload }, response => {
      if (settled || token !== epoch || version !== requestVersion || !active || !visible) return;
      settled = true;
      if (requestTimer !== null) cancel(requestTimer);
      requestTimer = null;
      if (!response?.ok) {
        const recoverable = ["invalid_word", "unknown_word", "duplicate_guess"].includes(response?.error);
        commit({ phase: recoverable ? "playing" : "error", canAnswer: recoverable,
          error: ERROR_MESSAGES[response?.error] || "Le mini-jeu est indisponible. Reprends la partie." });
        onFailure();
        return;
      }
      onResponse(response);
    });
    return true;
  };
  const beginTraining = async () => {
    clearTimers();
    const token = epoch;
    commit({ ...initialState(), phase: "loading" });
    try {
      if (!trainingBank) {
        const bank = await loadTrainingWords();
        if (!bank?.targets?.length || !bank?.accepted?.length) throw new Error("Banque vide");
        trainingBank = { targets: bank.targets, accepted: new Set(bank.accepted) };
      }
      if (!active || token !== epoch) return;
      let index = Math.floor(random() * trainingBank.targets.length);
      if (trainingBank.targets.length > 1 && trainingBank.targets[index] === trainingTarget) index = (index + 1) % trainingBank.targets.length;
      trainingTarget = trainingBank.targets[index];
      authoritative = { ...initialState(), phase: "playing", firstLetter: trainingTarget[0],
        known: [...trainingTarget].map((letter, column) => column ? "" : letter) };
      accept(authoritative);
    } catch {
      if (active && token === epoch) commit({ phase: "error", error: "Les mots de Gotus sont indisponibles. Réessaie.", canAnswer: false });
    }
  };
  const start = () => {
    if (!active || !visible) return;
    if (training) { if (authoritative) accept(authoritative); else void beginTraining(); return; }
    clearTimers();
    if (!socket?.connected) { commit({ phase: "disconnected", canAnswer: false }); return; }
    commit({ phase: "loading", canAnswer: false, error: "" });
    send("gotus:start", {}, response => accept(response));
  };
  const onConnect = () => start();
  const onDisconnect = () => { clearTimers(); commit({ phase: "disconnected", canAnswer: false }); };
  const onProgress = response => {
    if (active && visible && String(response?.roundId) === String(roundId)) {
      if (state.phase === "submitting" && response.attempts?.length > state.attempts.length && requestTimer !== null) {
        cancel(requestTimer); requestTimer = null;
      }
      accept(response, state.phase === "submitting");
    }
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    subscribeCue(listener) { cueListeners.add(listener); return () => cueListeners.delete(listener); },
    activate({ deadline: nextDeadline = 0, isVisible = true } = {}) {
      if (active) return;
      active = true; visible = isVisible; deadline = training ? 0 : Number(nextDeadline) || 0;
      if (!training) {
        socket?.on?.("connect", onConnect); socket?.on?.("disconnect", onDisconnect); socket?.on?.("gotus:progress", onProgress);
        clockTimer = repeat(tick, 250);
      }
      start();
    },
    deactivate() {
      if (!active) return;
      active = false; clearTimers();
      if (clockTimer !== null) cancelRepeat(clockTimer);
      clockTimer = null;
      if (!training) {
        socket?.off?.("connect", onConnect); socket?.off?.("disconnect", onDisconnect); socket?.off?.("gotus:progress", onProgress);
      }
    },
    setDeadline(value) { if (!training) { deadline = Number(value) || deadline; if (active) tick(); } },
    setVisible(value) {
      if (!active || visible === value) return;
      visible = value;
      if (visible) start();
      else { clearTimers(); commit({ phase: "paused", canAnswer: false }); }
    },
    edit(value) {
      if (!active || !state.canAnswer) return;
      commit({ draft: normalizeGotusWord(value).replace(/[^A-Z]/g, "").slice(0, GOTUS_WORD_LENGTH), error: "" });
    },
    submit() {
      if (!active || !visible || !state.canAnswer || state.phase !== "playing") return false;
      if (!training && deadline && getNow() >= deadline) { tick(); return false; }
      const word = normalizeGotusWord(state.draft);
      if (word.length !== GOTUS_WORD_LENGTH) { commit({ error: ERROR_MESSAGES.invalid_word }); return false; }
      if (training) {
        if (!trainingBank.accepted.has(word)) { commit({ error: ERROR_MESSAGES.unknown_word }); return false; }
        if (state.attempts.some(attempt => attempt.word === word)) { commit({ error: ERROR_MESSAGES.duplicate_guess }); return false; }
        const marks = evaluateGotusGuess(trainingTarget, word);
        const attempts = [...state.attempts, { word, marks }], won = word === trainingTarget;
        const phase = won ? "won" : attempts.length >= GOTUS_MAX_ATTEMPTS ? "lost" : "playing";
        accept({ ...authoritative, attempts, phase, wordsFound: won ? 1 : 0,
          known: state.known.map((letter, index) => marks[index] === "correct" ? word[index] : letter),
          remainingAttempts: GOTUS_MAX_ATTEMPTS - attempts.length, solution: TERMINAL.has(phase) ? trainingTarget : "",
          summary: { won, wordsFound: won ? 1 : 0, attemptsUsed: attempts.length, phase }, progression: null,
        }, true);
      } else {
        commit({ phase: "submitting", canAnswer: false, error: "" });
        if (!send("gotus:guess", { requestId: `${roundId}:${getNow()}:${++requestSequence}`, puzzleIndex: 0, word }, response => accept(response, true))) {
          commit({ phase: "disconnected", canAnswer: false });
        }
      }
      return true;
    },
    retry: start,
    newRound() { if (training && active) void beginTraining(); },
    giveUp() {
      if (!training || !active || !authoritative || TERMINAL.has(state.phase)) return;
      clearTimers(); accept({ ...authoritative, phase: "lost", solution: trainingTarget });
    },
    dismiss() {
      if (training) return Promise.resolve(true);
      if (!active || !socket?.connected) return Promise.resolve(false);
      clearTimers();
      commit({ phase: "submitting", canAnswer: false });
      return new Promise(resolve => {
        pendingDismiss = resolve;
        const finish = success => { pendingDismiss = null; resolve(success); };
        const sent = send("gotus:dismiss", {}, response => { accept(response); finish(true); }, () => finish(false));
        if (!sent) finish(false);
      });
    },
  };
}
