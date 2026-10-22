import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { normalizeGotusSummary } from "../../../shared/gotusRules.js";

const STORAGE_KEY = "gobble:gotus:round";
const terminal = new Set(["won", "lost", "expired", "dismissed"]);
const initialState = () => ({ key: "", roundId: null, started: false, dismissed: false, finalized: false, summary: null, recap: null });
const total = progression => Number(progression?.after?.totalWins) || 0;

function preserveProgression(summary, value, previous) {
  const saved = previous?.progression;
  const incoming = value?.progression;
  const progression = incoming && (!saved || total(incoming) > total(saved) ||
    (total(incoming) === total(saved) && (!saved.reward || incoming.reward))) ? incoming : saved;
  return progression ? { ...summary, progression } : summary;
}

export function createGotusFeature({ scope }, { storage = globalThis.sessionStorage, timers = globalThis } = {}) {
  const store = createFeatureStore(initialState());
  let userId = null, nickname = "", recapTimer = null, resolveRecap = null, recapPromise = null;
  function persist() {
    const { recap, ...saved } = store.getState();
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* optional session storage */ }
  }
  function finishRecap() {
    if (recapTimer !== null) timers.clearTimeout(recapTimer);
    recapTimer = null;
    store.patch({ recap: null });
    resolveRecap?.();
    resolveRecap = recapPromise = null;
  }
  function configure({ key, roundId, selfUserId, selfNick }) {
    userId = selfUserId;
    nickname = selfNick;
    if (store.getState().key === key) return;
    finishRecap();
    let restored;
    try { restored = JSON.parse(storage?.getItem(STORAGE_KEY) || "null"); } catch { /* optional session storage */ }
    store.replace(restored?.key === key && key
      ? { ...initialState(), ...restored, recap: null }
      : { ...initialState(), key, roundId });
  }
  function capture(roundId, value = {}) {
    const state = store.getState();
    if (!state.key || String(roundId) !== String(state.roundId) || (!state.started && !value.started)) return;
    let summary = state.finalized ? state.summary : normalizeGotusSummary(value);
    if (!state.finalized && state.summary && ((state.summary.won && !summary.won) ||
      (terminal.has(state.summary.phase) && !terminal.has(summary.phase)) ||
      summary.attemptsUsed < state.summary.attemptsUsed)) summary = state.summary;
    summary = preserveProgression(summary, value, state.summary);
    if (state.started && Object.keys(summary).every(key => state.summary?.[key] === summary[key]) &&
      Object.keys(state.summary || {}).length === Object.keys(summary).length) return;
    store.patch({ started: true, summary, ...(state.recap ? { recap: summary } : {}) });
    persist();
  }
  function hasPlayed(roundId) {
    const state = store.getState();
    return state.started && String(roundId) === String(state.roundId);
  }
  function reconcile(payload) {
    if (!payload || !hasPlayed(payload.roundId)) return;
    const entries = Array.isArray(payload.results) ? payload.results : [];
    const own = entries.find(entry => userId != null ? Number(entry.userId) === Number(userId) : entry.nick === nickname);
    if (!own?.gotus) return;
    const state = store.getState();
    const summary = preserveProgression(normalizeGotusSummary(own.gotus), own.gotus, state.summary);
    store.patch({ finalized: true, summary, ...(state.recap ? { recap: summary } : {}) });
    persist();
  }
  function showRecap(roundId, payload) {
    if (!hasPlayed(roundId)) return Promise.resolve();
    reconcile(payload);
    if (recapPromise) return recapPromise;
    store.patch({ recap: store.getState().summary });
    recapPromise = new Promise(resolve => { resolveRecap = resolve; });
    // Gotus occupies the same six-second outro slot as the other waiting game.
    recapTimer = timers.setTimeout(finishRecap, 6000);
    return recapPromise;
  }
  function dismiss() {
    store.patch({ dismissed: true });
    persist();
  }
  return { store, configure, capture, hasPlayed, reconcile, showRecap, dismiss,
    start() { scope.add(finishRecap); } };
}
