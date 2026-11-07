import { createWheelRendererCache } from './wheelRendererCache.js';
import { createWheelRenderWorker } from './createWheelRenderWorker.js';
import { createWheelWorkerScene } from './createWheelWorkerScene.js';
import { createWheelWorkerStartupGuard } from './createWheelWorkerStartupGuard.js';

const cache = createWheelRendererCache({ createRenderer: createWheelRenderWorker, disposeRenderer: endpoint => endpoint.dispose() });
const clear = () => { void cache.clear().catch(() => {}); };
window.addEventListener('pagehide', clear);
if (import.meta.hot) import.meta.hot.dispose(() => { window.removeEventListener('pagehide', clear); clear(); });

export async function acquireWheelScene(host, projection, onError, onStatus, options, isDisposed = () => false) {
  const lease = await cache.acquire({ retain: options.retain !== false });
  let failed = false, scene;
  const canvas = lease.renderer.canvas;
  let cancelAcquire, rejectAcquire;
  const guard = createWheelWorkerStartupGuard({ onTimeout({ step, idleMs }) {
    failed = true;
    const error = new Error(`Wheel worker startup stalled (${Math.round(idleMs / 1000)}s): ${step}`);
    lease.renderer.dispose(error); rejectAcquire(error);
  } });
  const cancelled = new Promise((resolve, reject) => {
    rejectAcquire = reject;
    cancelAcquire = () => {
      // Termination is immediate even if worker WebGL initialization or shader
      // compilation is stuck and therefore cannot answer a cancellation message.
      lease.renderer.dispose(); reject(new DOMException('Cancelled', 'AbortError'));
    };
  });
  try {
    if (isDisposed()) { guard.dispose(); await lease.release({ discard: true }); return null; }
    options.signal?.addEventListener('abort', cancelAcquire, { once: true });
    canvas.className = 'perspective-workshop__canvas';
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.renderThread = 'worker'; host.appendChild(canvas);
    scene = await Promise.race([cancelled, createWheelWorkerScene(lease.renderer, projection, message => { guard.dispose(); failed = true; onError(message); }, status => {
      guard.progress(status);
      if (status.phase === 'ready') void lease.ready();
      if (status.phase === 'error') failed = true;
      onStatus(status);
    }, { ...options, reusedContext: lease.reused }, isDisposed)]);
    if (!scene) { guard.dispose(); canvas.remove(); await lease.release({ discard: true }); return null; }
    lease.bind(scene);
    return { ...scene, dispose({ discard = false } = {}) {
      guard.dispose(); canvas.remove(); return lease.release({ discard: discard || failed }).catch(() => {});
    } };
  } catch (error) {
    guard.dispose(); canvas.remove(); if (scene) await scene.dispose().catch(() => {});
    await lease.release({ discard: true }).catch(() => {}); throw error;
  } finally { options.signal?.removeEventListener('abort', cancelAcquire); }
}
