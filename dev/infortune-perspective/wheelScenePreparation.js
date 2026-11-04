// Give the loading UI a turn before allocating a WebGL scene. In development,
// StrictMode can cancel its rehearsal mount before any GPU work starts.
export function deferWheelSetup(setup, { schedule = setTimeout, cancel = clearTimeout } = {}) {
  let disposed = false, cleanup;
  const timer = schedule(() => { if (!disposed) cleanup = setup(); }, 0);
  return () => {
    if (disposed) return;
    disposed = true; cancel(timer); cleanup?.();
  };
}

const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));

// All passes use the final lighting/material configuration before the intro.
// The caller keeps GPU resources alive until this promise settles on unmount:
// Compilation polling must have settled before GPU resource cleanup.
export async function prepareWheelRendering({ renderer, scene, camera, isDisposed,
  prepareEnvironment, prepareShadows, captureShadows, captureReflections,
  prepareActorReflections, warmActorReflections, draw, onStatus, compile = () => renderer.compileAsync(scene, camera),
  onTiming = () => {}, now = () => performance.now(), yieldControl = yieldTask }) {
  async function measure(id, task) {
    const start = now();
    const result = await task(); onTiming(id, now() - start); return result;
  }
  async function stage(message) {
    if (isDisposed()) return false;
    onStatus({ phase: "loading", message });
    await yieldControl();
    return !isDisposed();
  }
  if (!await stage("Préparation des textures du plateau…")) return false;
  await measure("environment", prepareEnvironment);
  const textures = new Set();
  scene.traverse(object => {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value);
      }
    }
  });
  await measure("textures", async () => { for (const texture of textures) {
    if (isDisposed()) return;
    renderer.initTexture(texture);
    await yieldControl();
  } });
  if (!await stage("Préparation de l’éclairage…")) return false;
  prepareShadows();
  // Install final shader patches BEFORE the first compilation. The probe later
  // replaces an envMap of the same type/size, not the shader's source code.
  prepareActorReflections();
  await measure("shaders", compile);
  if (!await stage("Préparation des ombres et des reflets…")) return false;
  await measure("shadows", captureShadows);
  await yieldControl();
  if (isDisposed()) return false;
  await measure("studioReflection", captureReflections);
  if (!await stage("Préparation des reflets des candidats…")) return false;
  if (isDisposed()) return false;
  await measure("actorReflections", warmActorReflections);
  if (!await stage("Dernière préparation avant l’intro…")) return false;
  await measure("firstFrame", draw);
  await yieldControl();
  return !isDisposed();
}
