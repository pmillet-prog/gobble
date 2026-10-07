import { createFeatureStore } from "../../app/core/createFeatureStore.js";
import { normalizeTargetQuizSummary } from "../../../shared/targetQuizSummary.js";

const STORAGE_KEY = "gobble:targetQuiz:round";
const initialState = () => ({ key: "", roundId: null, targetFoundAt: null, entered: false, started: false, dismissed: false, finalized: false, summary: null, streak: 0, recap: null });

export function createTargetQuizFeature({ scope }, { storage = globalThis.sessionStorage, timers = globalThis } = {}) {
  const store = createFeatureStore(initialState());
  let recapTimer = null;
  let resolveRecap = null;
  let recapPromise = null;
  let userId = null;
  let nickname = "";

  function persist() {
    const { recap, ...saved } = store.getState();
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* private browsing */ }
  }
  function finishRecap() {
    if (recapTimer !== null) timers.clearTimeout(recapTimer);
    recapTimer = null;
    store.patch({ recap: null });
    resolveRecap?.();
    resolveRecap = null;
    recapPromise = null;
  }
  function configure({ key, roundId, selfUserId, selfNick }) {
    userId = selfUserId;
    nickname = selfNick;
    if (store.getState().key === key) return;
    finishRecap();
    let restored = null;
    try { restored = JSON.parse(storage?.getItem(STORAGE_KEY) || "null"); } catch { /* optional storage */ }
    store.replace(restored?.key === key && key
      ? { ...initialState(), ...restored, dismissed: restored.dismissed || !!restored.summary?.cancelled, recap: null }
      : { ...initialState(), key, roundId });
  }
  function enter({ endsAt, now, devPreview = false }) {
    const state = store.getState();
    if (!state.key || state.dismissed) return false;
    if (state.entered) return true;
    const foundAt = !devPreview && Number.isFinite(state.targetFoundAt) ? state.targetFoundAt : now;
    if (!Number.isFinite(endsAt) || endsAt <= now || endsAt - foundAt <= (devPreview ? 0 : 5000)) return false;
    store.patch({ entered: true });
    persist();
    return true;
  }
  function capture(roundId, value) {
    const state = store.getState();
    if (String(roundId) !== String(state.roundId) || !value.started || state.finalized) return;
    const summary = normalizeTargetQuizSummary(value);
    if (state.summary?.cancelled && !summary.cancelled) return;
    if (state.summary?.progression?.settled && !summary.progression?.settled) summary.progression = state.summary.progression;
    if (state.summary && summary.correctCount + summary.wrongCount < state.summary.correctCount + state.summary.wrongCount) return;
    const streak = Math.max(0, Math.trunc(Number(value.streak) || 0));
    if (state.started && state.streak === streak && Object.keys(summary).every(key => state.summary?.[key] === summary[key])) return;
    store.patch({ started: true, summary, streak, ...(state.recap ? { recap: summary } : {}) });
    persist();
  }
  function hasPlayed(roundId) {
    const state = store.getState();
    return state.started && String(state.roundId) === String(roundId);
  }
  function reconcile(payload) {
    if (!payload || !hasPlayed(payload.roundId)) return;
    const entries = Array.isArray(payload.results) ? payload.results : [];
    const own = entries.find(entry => userId != null ? Number(entry.userId) === Number(userId) : entry.nick === nickname);
    if (!own?.targetQuiz) return;
    const summary = normalizeTargetQuizSummary({ ...own.targetQuiz, progression: store.getState().summary?.progression });
    store.patch({ finalized: true, summary, ...(store.getState().recap ? { recap: summary } : {}) });
    persist();
  }
  function showRecap(roundId, payload) {
    if (!hasPlayed(roundId)) return Promise.resolve();
    reconcile(payload);
    if (recapPromise) return recapPromise;
    store.patch({ recap: store.getState().summary || normalizeTargetQuizSummary() });
    recapPromise = new Promise(resolve => { resolveRecap = resolve; });
    // Preserve the original black-hole duration and the results synchronization.
    recapTimer = timers.setTimeout(finishRecap, 6000);
    return recapPromise;
  }
  function dismiss() {
    store.patch({ dismissed: true });
    persist();
  }
  function noteDiscovery(roundId, foundAt) {
    if (String(roundId) !== String(store.getState().roundId) || !Number.isFinite(foundAt)) return;
    store.patch({ targetFoundAt: foundAt });
  }
  return { store, configure, enter, capture, hasPlayed, reconcile, showRecap, dismiss, noteDiscovery,
    start() { scope.add(finishRecap); } };
}
