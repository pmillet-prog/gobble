import { prepareWheelWorkerPortraits } from './prepareWheelWorkerPortraits.js';

let serial = 0;
const view = projection => ({ width: projection.width, height: projection.height, settings: { ...projection.settings } });

export async function createWheelWorkerScene(endpoint, projection, onError, onStatus, options, isDisposed) {
  const id = ++serial, pending = new Map();
  let disposed = false, suspended = false, frame = null, inFlight = false, unsubscribe = () => {};
  const cancelled = () => disposed || isDisposed();
  const failed = error => { if (!cancelled() && !suspended) onError(error.message || String(error)); };
  function flush() {
    if (frame !== null) cancelAnimationFrame(frame); frame = null;
    if (disposed || suspended || !pending.size || inFlight) return;
    const commands = [...pending]; pending.clear(); inFlight = true;
    endpoint.call(id, 'batch', [commands]).catch(failed).finally(() => {
      inFlight = false; if (pending.size && !disposed && !suspended) schedule();
    });
  }
  function schedule() { if (frame === null) frame = requestAnimationFrame(flush); }
  function command(name, args) { if (!disposed && !suspended) { pending.set(name, args); schedule(); } }
  async function request(name, args = []) {
    if (cancelled() || suspended) return null;
    // Drain the newest camera/state before a hit test or a presentation capture.
    if (pending.size) { const commands = [...pending]; pending.clear(); await endpoint.call(id, 'batch', [commands]); }
    return cancelled() || suspended ? null : endpoint.call(id, name, args);
  }
  function suspend() {
    if (suspended) return;
    suspended = true; pending.clear(); if (frame !== null) cancelAnimationFrame(frame); frame = null;
    unsubscribe(); endpoint.notify(id, 'suspend');
    options = {}; onError = onStatus = () => {}; isDisposed = () => true;
  }
  const stopStartup = endpoint.subscribeStartup(onStatus);
  try { await endpoint.ready; } finally { stopStartup(); }
  if (cancelled()) return null;
  onStatus({ phase: 'loading', message: 'Préparation des avatars…' });
  const portraits = await prepareWheelWorkerPortraits(options.contestants, cancelled);
  if (cancelled()) { for (const portrait of portraits) portrait.image.close(); return null; }
  unsubscribe = endpoint.subscribe(id, (name, value, callback) => {
    if (cancelled() || suspended) return;
    if (name === 'status') onStatus(value);
    if (name === 'error') onError(value);
    if (name === 'timings') options.onTimings?.(value);
    if (name === 'slow') options.onStartupSlow?.(value);
    if (name === 'frame') options.onFrame?.(value[0] - performance.timeOrigin, value[1], value[2]);
    if (name === 'benchmark') {
      const next = options.onBenchmark?.(...value) || value[2];
      endpoint.notify(id, 'benchmarkResult', [callback, next]);
    }
  });
  try {
    onStatus({ phase: 'loading', message: 'Installation du plateau 3D…' });
    await endpoint.call(id, 'create', [view(projection), { profile: options.profile, contestants: options.contestants,
      exchangeEnabled: options.exchangeEnabled, reusedContext: options.reusedContext, portraits,
      diagnostic: !!options.onBenchmark, pixelRatio: window.devicePixelRatio || 1 }], portraits.map(portrait => portrait.image));
  } catch (error) {
    unsubscribe(); for (const portrait of portraits) portrait.image.close(); throw error;
  }
  const api = { canvas: endpoint.canvas, suspend,
    pickContestant: (x, y) => request('pickContestant', [x, y]),
    getContestantPresentation: id => request('getContestantPresentation', [id]),
    takeResultPresentation: () => request('takeResultPresentation'),
    setProjection: (projection, reflections) => command('setProjection', [view(projection), reflections]),
    update(state, phase) { endpoint.canvas.dataset.motion = phase; command('update', [{ ...state }, phase]); },
    async dispose() {
      if (disposed) return;
      suspend(); disposed = true;
      // A blocked driver cannot process cancellation. Retire this endpoint if
      // it fails to acknowledge, so leaving a screen cannot retain a stuck worker.
      const timer = setTimeout(() => endpoint.dispose(), 2000);
      try { await endpoint.call(id, 'dispose'); } finally { clearTimeout(timer); }
    },
  };
  for (const name of ['setExchangeProgress', 'setBanks', 'setSelectedContestant', 'setCameraSequence', 'setQuality', 'setActorShade', 'draw']) {
    api[name] = (...args) => command(name, args);
  }
  return api;
}
