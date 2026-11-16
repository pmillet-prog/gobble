import { createFeatureStore } from '../../app/core/createFeatureStore.js';
import { wheelVoteApi } from './wheelVoteApi.js';

const empty = () => ({ userId: null, loading: false, eligible: false, vote: null, open: false, busy: false, error: '' });
export function createWheelVoteController({ api = wheelVoteApi, timers = globalThis } = {}) {
  const store = createFeatureStore(empty());
  let generation = 0, abort = null, timeout = null;
  function cancel() { generation++; abort?.abort(); abort = null; timers.clearTimeout(timeout); timeout = null; }
  async function request(vote) {
    cancel();
    const token = generation, controller = new AbortController(); abort = controller;
    timeout = timers.setTimeout(() => controller.abort(), 15_000);
    store.patch({ error: '', ...(vote ? { busy: true } : { loading: true }) });
    try {
      const value = await api('/api/infortune/vote', { signal: controller.signal, vote });
      if (token !== generation) return;
      if (vote) store.patch({ vote: value.vote, open: false });
      else store.patch({ eligible: value.eligible, vote: value.vote, open: value.eligible && !value.vote });
    } catch {
      if (token === generation) store.set('error', vote ? 'Enregistrement impossible. Ton choix n’a pas été confirmé. Réessaie.' : 'Le vote est momentanément indisponible. Réessaie pour continuer.');
    } finally {
      if (token === generation) { timers.clearTimeout(timeout); timeout = null; abort = null; store.patch({ loading: false, busy: false }); }
    }
  }
  return { store,
    setAccount(userId) {
      if (userId === store.getState().userId) return;
      cancel(); store.replace({ ...empty(), userId });
      if (userId) void request();
    },
    retry: () => request(),
    edit() { if (store.getState().eligible) store.patch({ open: true, error: '' }); },
    close() { if (store.getState().vote && !store.getState().busy) store.patch({ open: false, error: '' }); },
    submit(vote) { if (!store.getState().busy && store.getState().eligible) return request(vote); },
    dispose() { cancel(); store.replace(empty()); },
  };
}
