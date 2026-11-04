import { createFeatureStore } from "../../../app/core/createFeatureStore.js";

export const FINALE_FLIP_MS = 480;
export const FINALE_REVEAL_STEP_MS = 540;

const ERROR_MESSAGES = {
  insufficient_bank: "Ta cagnotte ne suffit pas pour cette lettre.",
  already_purchased: "Cette lettre est déjà achetée.",
  one_word_required: "Propose un seul mot, sans espace ni chiffre.",
  invalid_letter: "Choisis une lettre de A à Z.",
  finished: "Tu as déjà proposé ta réponse.",
};

// Owns only presentation timing. The injected session owns purchases and answers.
export function createFinaleController(session, { timers = globalThis } = {}) {
  const store = createFeatureStore({ ...session.snapshot(), busy: false, error: "", flippingIndex: null });
  let timer = null, target = null, queue = [], version = 0, stopped = false;
  const clearTimer = () => { if (timer !== null) timers.clearTimeout(timer); timer = null; };

  function finishReveal() {
    clearTimer();
    if (target) store.replace({ ...target, busy: false, error: "", flippingIndex: null });
    target = null;
    queue = [];
  }

  function flipNext(token) {
    if (stopped || token !== version || !target) return;
    const index = queue.shift();
    if (index === undefined) { finishReveal(); return; }
    store.patch({ flippingIndex: index,
      tiles: store.getState().tiles.map(tile => tile.index === index ? target.tiles[index] : tile) });
    timer = timers.setTimeout(() => flipNext(token), queue.length ? FINALE_REVEAL_STEP_MS : FINALE_FLIP_MS);
  }

  function buyLetter(letter) {
    if (stopped || store.getState().busy || store.getState().outcome) return false;
    const response = session.buyLetter(letter);
    if (!response.ok) { store.set("error", ERROR_MESSAGES[response.error] || "Achat impossible."); return false; }
    target = response.snapshot;
    queue = [...response.indices];
    const oldTiles = store.getState().tiles;
    store.replace({ ...target, tiles: oldTiles, busy: queue.length > 0, error: "", flippingIndex: null });
    flipNext(++version);
    return true;
  }

  function submitAnswer(answer) {
    if (stopped || store.getState().busy || store.getState().outcome) return false;
    const response = session.submitAnswer(answer);
    if (!response.ok) { store.set("error", ERROR_MESSAGES[response.error] || "Réponse impossible."); return false; }
    store.replace({ ...response.snapshot, busy: false, error: "", flippingIndex: null });
    return true;
  }

  return Object.freeze({ store, buyLetter, submitAnswer,
    // Backgrounding / reduced motion completes an already paid reveal. Never
    // leave controls locked behind suspended animation timers.
    finishReveal() { version++; finishReveal(); },
    resume() { stopped = false; },
    dispose() { stopped = true; version++; finishReveal(); },
  });
}
