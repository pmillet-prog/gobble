import { PMREMGenerator, WebGLRenderer } from "three";
import { createWheelScene } from "./createWheelScene.js";
import { createWheelRendererCache } from "./wheelRendererCache.js";

const environments = new WeakMap();
const cache = createWheelRendererCache({
  createRenderer() {
    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    environments.set(renderer, new PMREMGenerator(renderer));
    return renderer;
  },
  disposeRenderer(renderer) {
    environments.get(renderer)?.dispose(); environments.delete(renderer);
    renderer.dispose(); renderer.forceContextLoss();
  },
});

// A page-local cache, never persisted. Page navigation and hot replacement
// invalidate it; idle expiration is owned by the cache itself.
const clear = () => { void cache.clear(); };
if (typeof window !== "undefined") window.addEventListener("pagehide", clear);
if (import.meta.hot) import.meta.hot.dispose(() => {
  window.removeEventListener("pagehide", clear); clear();
});

export async function acquireWheelScene(host, projection, onError, onStatus, options, isDisposed = () => false) {
  const lease = await cache.acquire({ retain: options.retain !== false });
  if (isDisposed()) { await lease.release({ discard: true }); return null; }
  const canvas = lease.renderer.domElement;
  let failed = false;
  try {
    canvas.className = "perspective-workshop__canvas";
    canvas.style.cssText = "display:block;width:100%;height:100%";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    const scene = createWheelScene(canvas, projection, message => { failed = true; onError(message); }, state => {
      if (state.phase === "ready") void lease.ready();
      if (state.phase === "error") failed = true;
      onStatus(state);
    }, { ...options, renderer: lease.renderer, environmentGenerator: environments.get(lease.renderer), reusedContext: lease.reused });
    lease.bind(scene);
    return { ...scene, canvas, dispose({ discard = false } = {}) {
      canvas.remove();
      return lease.release({ discard: discard || failed });
    } };
  } catch (error) {
    canvas.remove(); await lease.release({ discard: true }); throw error;
  }
}
