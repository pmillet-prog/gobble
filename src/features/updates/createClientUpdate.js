import { createFeatureStore } from '../../app/core/createFeatureStore.js';
import { CLIENT_VERSION_PATH, clientVersionFromHtml, isClientVersion } from '../../../shared/clientVersion.js';

export function createClientUpdate({ currentVersion, canPrompt, subscribeSafePoint = () => () => {}, socket,
  windowObject = globalThis.window, documentObject = globalThis.document, fetchFn = globalThis.fetch,
  now = Date.now, timers = globalThis, intervalMs = 60_000,
  navigate = url => windowObject.location.replace(url) }) {
  const store = createFeatureStore({ version: null, visible: false, updating: false, error: '' });
  let active = false, generation = 0, lastCheck = -Infinity, poll = null, safety = null, recovery = null;
  let request = null, checking = null, unsubscribe;
  const foreground = () => !documentObject.hidden;
  function refreshPrompt() {
    if (!active) return;
    const pending = !!store.getState().version;
    store.set('visible', pending && foreground() && canPrompt());
    timers.clearTimeout(safety); safety = null;
    // Only a pending update watches for a closed menu or the tournament's end;
    // it never mounts game features merely to inspect their state.
    if (pending && foreground()) safety = timers.setTimeout(refreshPrompt, 1000);
  }
  function schedule(delay = intervalMs) {
    timers.clearTimeout(poll); poll = null;
    if (active && foreground()) poll = timers.setTimeout(() => { poll = null; void check(); }, delay);
  }
  async function read(url, type) {
    const controller = new AbortController(); request = controller;
    const timeout = timers.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchFn(url, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
        headers: { Accept: type === 'json' ? 'application/json' : 'text/html' } });
      if (!response.ok) throw new Error('update_unavailable');
      const value = await response[type]();
      if (controller.signal.aborted) throw new Error('update_cancelled');
      return value;
    } finally { timers.clearTimeout(timeout); if (request === controller) request = null; }
  }
  function check(force = false) {
    if (checking) return checking;
    if (!force && store.getState().updating) return Promise.resolve(null);
    if (!active || !foreground() || windowObject.navigator?.onLine === false) return Promise.resolve(null);
    if (!force && now() - lastCheck < 5000) { schedule(5000 - (now() - lastCheck)); return Promise.resolve(null); }
    lastCheck = now();
    const token = generation;
    checking = (async () => {
      try {
        const value = await read(`${CLIENT_VERSION_PATH}?check=${now()}`, 'json');
        if (!active || token !== generation || value?.schema !== 1 || !isClientVersion(value.version)) return null;
        store.patch({ version: value.version === currentVersion ? null : value.version, error: '' });
        refreshPrompt(); return value.version;
      } catch { return null; } // Offline/maintenance/HTML fallback is not evidence of an obsolete game.
      finally { if (token === generation) { checking = null; schedule(); } }
    })();
    return checking;
  }
  async function update() {
    if (!active || !store.getState().visible || store.getState().updating || !canPrompt()) return false;
    const token = generation;
    store.patch({ updating: true, error: '' });
    try {
      const latest = await check(true);
      if (!active || token !== generation) return false;
      if (latest === currentVersion) { store.set('updating', false); return false; }
      if (!latest) throw new Error('update_unavailable');
      const url = new URL(windowObject.location.href);
      url.searchParams.set('gobble-update', latest);
      const html = await read(url.href, 'text');
      if (clientVersionFromHtml(html) !== latest) throw new Error('update_not_ready');
      // A server countdown may have started a round while the download waited.
      if (!active || token !== generation) return false;
      if (!foreground() || !canPrompt()) { store.set('updating', false); refreshPrompt(); return false; }
      // A real navigation also refreshes Android's media manifest. It works in
      // the browser, installed PWA/TWA and hybrid app without changing the APK.
      navigate(url.href);
      recovery = timers.setTimeout(() => store.patch({ updating: false,
        error: 'Le jeu n’a pas été rechargé. Réessaie avec une connexion disponible.' }), 10_000);
      return true;
    } catch {
      if (active && token === generation) store.patch({ updating: false,
        error: 'La mise à jour n’est pas encore accessible. Vérifie ta connexion puis réessaie.' });
      return false;
    }
  }
  const onForeground = () => { refreshPrompt(); if (foreground()) void check(); else { timers.clearTimeout(poll); poll = null; } };
  const onConnect = () => { void check(); };
  return { store, check, update, refreshPrompt,
    start() {
      if (active || !isClientVersion(currentVersion)) return;
      active = true; generation++;
      unsubscribe = subscribeSafePoint(refreshPrompt);
      documentObject.addEventListener('visibilitychange', onForeground);
      windowObject.addEventListener('pageshow', onForeground);
      windowObject.addEventListener('online', onConnect);
      socket?.on('connect', onConnect);
      void check();
    },
    stop() {
      active = false; generation++; request?.abort(); checking = null;
      for (const handle of [poll, safety, recovery]) timers.clearTimeout(handle);
      poll = safety = recovery = null;
      unsubscribe?.(); unsubscribe = null;
      documentObject.removeEventListener('visibilitychange', onForeground);
      windowObject.removeEventListener('pageshow', onForeground);
      windowObject.removeEventListener('online', onConnect);
      socket?.off('connect', onConnect);
      store.patch({ visible: false, updating: false });
    },
  };
}
