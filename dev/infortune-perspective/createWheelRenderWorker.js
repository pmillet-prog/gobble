// A renderer endpoint owns one transferred canvas for its whole cached lifetime.
// Requests are cancelled together on failure; a late reply never reaches a new scene.
export function createWheelRenderWorker({ createCanvas = () => document.createElement('canvas'), visibility = document,
  createWorker = () => new Worker(new URL('./wheelRender.worker.js', import.meta.url), { type: 'module', name: 'gobble-wheel-render' }) } = {}) {
  const canvas = createCanvas(), worker = createWorker();
  const requests = new Map(), listeners = new Map(), startupListeners = new Set();
  let serial = 0, closed = false, initializing = false, resolveReady, rejectReady;
  let startup = { phase: 'loading', message: 'Démarrage du worker 3D…' };
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});
  function fail(error) {
    if (closed) return;
    closed = true; worker.terminate();
    rejectReady(error);
    for (const request of requests.values()) request.reject(error);
    requests.clear();
    for (const listener of listeners.values()) listener('error', error.message);
    listeners.clear(); startupListeners.clear(); visibility.removeEventListener('visibilitychange', visibilityChanged);
  }
  function call(scene, method, args = [], transfer = []) {
    if (closed) return Promise.reject(new Error('Wheel worker closed'));
    return new Promise((resolve, reject) => {
      const id = ++serial; requests.set(id, { resolve, reject });
      try { worker.postMessage({ id, scene, method, args }, transfer); }
      catch (error) { requests.delete(id); reject(error); }
    });
  }
  function notify(scene, method, args = []) { if (!closed && initializing) worker.postMessage({ scene, method, args }); }
  function visibilityChanged() { notify(null, 'visibility', [visibility.hidden]); }
  worker.onmessage = ({ data }) => {
    if (closed) return;
    if (data.event === 'booted') {
      if (initializing) return;
      initializing = true;
      try {
        const surface = canvas.transferControlToOffscreen();
        call(null, 'init', [surface, visibility.hidden], [surface]).then(resolveReady, fail);
      } catch (error) { fail(error); }
      return;
    }
    if (data.event === 'startup') {
      startup = data.value;
      for (const listener of startupListeners) listener(startup);
      return;
    }
    if (data.event) { listeners.get(data.scene)?.(data.event, data.value, data.id); return; }
    const pending = requests.get(data.id); if (!pending) return;
    requests.delete(data.id); data.error ? pending.reject(new Error(data.error)) : pending.resolve(data.value);
  };
  worker.onerror = event => { event.preventDefault(); fail(new Error(event.message || 'Wheel worker failed')); };
  worker.onmessageerror = () => fail(new Error('Wheel worker message failed'));
  visibility.addEventListener('visibilitychange', visibilityChanged);
  return { canvas, ready, call, notify,
    subscribeStartup(listener) {
      if (closed) return () => {};
      startupListeners.add(listener); listener(startup);
      return () => startupListeners.delete(listener);
    },
    subscribe(id, listener) { listeners.set(id, listener); return () => listeners.delete(id); },
    getContext: () => ({ isContextLost: () => closed }),
    dispose(error = new Error('Wheel worker disposed')) { fail(error); },
  };
}
