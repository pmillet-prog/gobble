import { createRound, submitGuess, revealLetter } from "./model.mjs";
import { normalizeWord } from "./word-rules.mjs";

// Owns the round and its single timer. The DOM is only a subscriber.
// Audio and victory effects subscribe to semantic cues outside the controller.
export function createMotusController({ accepted, targets, onChange, onCue = () => {}, schedule = setTimeout, cancel = clearTimeout, random = Math.random }) {
  let state = null;
  let timer = null;
  let generation = 0;
  let disposed = false;
  let delay = 260;
  const targetSet = new Set(targets);
  if (!targets.length || targets.some(word => !accepted.has(word))) throw new Error("Banque de mots incohérente.");
  const notify = () => { if (!disposed) onChange(state); };
  const clear = () => {
    generation++;
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const tick = token => {
    if (disposed || token !== generation) return;
    timer = null;
    state = revealLetter(state);
    const attempt = state.attempts.at(-1);
    notify();
    onCue(state.phase === "revealing"
      ? { type: "letter", mark: attempt.marks[state.revealed - 1], index: state.revealed - 1, row: state.attempts.length - 1 }
      : { type: state.phase === "playing" ? "next-attempt" : state.phase, row: state.attempts.length - 1 });
    if (state.phase === "revealing") timer = schedule(() => tick(token), delay);
  };
  return {
    getState: () => state,
    newRound(value) {
      if (disposed) return false;
      let target = normalizeWord(value);
      if (value && !targetSet.has(target)) return false;
      if (!target) {
        const previous = state?.target;
        let index = Math.floor(random() * targets.length);
        if (targets.length > 1 && targets[index] === previous) index = (index + 1) % targets.length;
        target = targets[index];
      }
      clear(); onCue({ type: "reset" }); state = createRound(target); notify(); return true;
    },
    edit(value) {
      if (disposed || state?.phase !== "playing") return;
      const draft = normalizeWord(value).replace(/[^A-Z]/g, "").slice(0, 6);
      state = { ...state, draft, error: "" }; notify();
    },
    submit() {
      if (disposed || state?.phase !== "playing") return;
      const result = submitGuess(state, state.draft, accepted);
      state = result.error ? { ...state, error: result.error } : { ...result.state, error: "" };
      notify();
      if (!result.error) {
        const token = generation;
        timer = schedule(() => tick(token), delay);
      }
    },
    setFast(enabled) { delay = enabled ? 70 : 260; },
    giveUp() {
      if (disposed || !state || ["won", "lost"].includes(state.phase)) return;
      clear();
      onCue({ type: "reset" });
      state = { ...state, phase: "lost", revealed: 6, error: "", message: `Le mot était ${state.target}. On en essaie un autre ?` };
      notify();
    },
    dispose() { clear(); onCue({ type: "reset" }); disposed = true; },
  };
}
