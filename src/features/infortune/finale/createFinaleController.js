import { createFeatureStore } from "../../../app/core/createFeatureStore.js";

export const FINALE_FLIP_MS = 480;
export const FINALE_REVEAL_MS = 1500;

const ERROR_MESSAGES = {
  insufficient_bank: "Ta cagnotte ne suffit pas pour cette lettre.",
  already_purchased: "Cette lettre est déjà achetée.",
  one_word_required: "Propose un seul mot, sans espace ni chiffre.",
  invalid_letter: "Choisis une lettre de A à Z.",
  finished: "Tu as déjà proposé ta réponse.",
  expired: "Le temps de la finale est écoulé.",
  connection: "Connexion interrompue. Réessaie : tes achats sont conservés.",
  not_started: "La finale va commencer.",
  insufficient_funds: "Tu n’as pas assez de gobblars pour cette lettre.",
  bank_available: "Ta cagnotte permet encore d’acheter des lettres.",
  price_changed: "Le tarif a changé. Confirme le nouveau prix avant d’acheter.",
  payment_required: "Confirme l’achat avec tes gobblars.",
};

// Owns only presentation timing. The injected session owns purchases and answers.
export function createFinaleController(session, { timers = globalThis } = {}) {
  const store = createFeatureStore({ ...session.snapshot(), busy: false, error: "", reveal: null, feedback: null });
  let timer = null, target = null, version = 0, stopped = false;
  const clearTimer = () => { if (timer !== null) timers.clearTimeout(timer); timer = null; };

  function finishReveal() {
    clearTimer();
    if (target) store.replace({ ...target, busy: false, error: "", reveal: null, feedback: store.getState().feedback });
    target = null;
  }

  function buyLetter(letter, payment) {
    if (stopped || store.getState().busy || store.getState().outcome) return false;
    const response = session.buyLetter(letter, payment);
    return acceptResponse(response, revealPurchase);
  }
  function acceptResponse(response, accept) {
    if (!response?.then) return accept(response);
    const token = ++version;
    store.set("busy", true);
    return response.catch(() => ({ ok: false, error: "connection" })).then(value => {
      if (stopped || version !== token) return false;
      store.set("busy", false);
      return accept(value);
    });
  }
  function revealPurchase(response) {
    if (!response.ok) { store.patch({ ...(response.snapshot || {}), error: ERROR_MESSAGES[response.error] || "Achat impossible." }); return false; }
    target = response.snapshot;
    const indices = [...(response.indices || [])];
    const token = ++version;
    if (!indices.length) {
      store.replace({ ...target, busy: false, error: '', reveal: null, feedback: { id: token, kind: 'absent' } });
      target = null; return true;
    }
    // CSS staggers the whole batch on one timeline. No per-letter JS timer or
    // rerender: even a long phrase finishes within the same 1.5-second window.
    const durationMs = indices.length > 1 ? FINALE_REVEAL_MS : FINALE_FLIP_MS;
    const stepMs = indices.length > 1 ? (durationMs - FINALE_FLIP_MS) / (indices.length - 1) : 0;
    store.replace({ ...target, busy: true, error: "", feedback: { id: token, kind: 'reveal', count: indices.length, stepMs, flipMs: FINALE_FLIP_MS },
      reveal: { indices, stepMs, flipMs: FINALE_FLIP_MS } });
    timer = timers.setTimeout(() => {
      if (!stopped && token === version) finishReveal();
    }, durationMs);
    return true;
  }

  function submitAnswer(answer) {
    if (stopped || store.getState().busy || store.getState().outcome) return false;
    const response = session.submitAnswer(answer);
    return acceptResponse(response, acceptAnswer);
  }
  function acceptAnswer(response) {
    if (!response.ok) { store.set("error", ERROR_MESSAGES[response.error] || "Réponse impossible."); return false; }
    store.replace({ ...response.snapshot, busy: false, error: "", reveal: null, feedback: null });
    return true;
  }

  return Object.freeze({ store, buyLetter, submitAnswer,
    hydrate(snapshot) {
      version++; clearTimer(); target = null;
      store.replace({ ...snapshot, busy: false, error: "", reveal: null, feedback: null });
    },
    // Backgrounding / reduced motion completes an already paid reveal. Never
    // leave controls locked behind suspended animation timers.
    finishReveal() { version++; finishReveal(); },
    resume() { stopped = false; },
    dispose() { stopped = true; version++; finishReveal(); },
  });
}
