import { createFeatureStore } from '../../app/core/createFeatureStore.js';
import { subscribeForegroundClockRefresh } from '../../utils/realtimeClock.js';
import { INFORTUNE_OUTRO_MS } from '../../../shared/infortuneIntermission.js';

export function createResultsLoadingFeature({ getKernel, ports, scope }, { now = Date.now, timers = globalThis } = {}) {
  const store = createFeatureStore({ visible: false });
  const listeners = new Set();
  let pending = null, timer = null, snapshot;
  const active = value => {
    const state = getKernel().getState();
    return state.session.isLoggedIn && ['live', 'vault'].includes(state.navigation.view)
      && String(state.game.currentRoomId) === String(value?.roomId);
  };
  function clear() { timers.clearTimeout(timer); timer = null; pending = null; store.set('visible', false); }
  function refresh() {
    timers.clearTimeout(timer); timer = null;
    if (!pending) return;
    if (!active(pending)) { clear(); return; }
    const remaining = pending.showAt - now();
    store.set('visible', remaining <= 0);
    if (remaining > 0) timer = timers.setTimeout(refresh, remaining);
  }
  function receive(value, resumed = false) {
    if (!active(value)) return;
    pending = { ...value, showAt: now() + (resumed || value.skipOutro ? 0 : INFORTUNE_OUTRO_MS) };
    if (!resumed && !value.skipOutro) for (const listener of listeners) listener(value);
    refresh();
  }
  function observe() {
    if (pending && !active(pending)) clear();
    const next = getKernel().getState().session.resumeSnapshot;
    if (next === snapshot) return;
    snapshot = next;
    if (next?.resultsPending) receive(next.resultsPending, true);
    else if (next && active(next)) clear();
  }
  return { store, onResolving(fn) { listeners.add(fn); return () => listeners.delete(fn); }, start() {
    scope.add(ports.realtime.bind({ roundResolving: receive,
      roundEnded(value) { if (String(value.roomId) === String(pending?.roomId) && String(value.roundId) === String(pending?.roundId)) clear(); },
      roundStarted(value) { if (active(value)) clear(); }, tournamentLobbyUpdate(value) { if (active(value)) clear(); } }));
    scope.add(getKernel().subscribe(observe)); observe();
    scope.add(subscribeForegroundClockRefresh(refresh)); scope.add(clear);
  } };
}
