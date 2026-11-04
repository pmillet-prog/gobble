import { Group } from "three";

// Three r179's compile(scene) traverses every mesh, including hidden meshes and
// other camera layers. A cube/mirror warmup must not compile the entire wheel.
// Detached shallow copies preserve geometry/material features without moving
// the real objects out of their parents or creating a second renderer.
export async function compileWheelPass(renderer, scene, camera, {
  isDisposed = () => false, yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)),
  onProgress = () => {}, include = [],
} = {}) {
  const objects = new Set();
  function collect(object) {
    if (!(object.isMesh || object.isLine || object.isPoints || object.isSprite) || !object.layers.test(camera.layers)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(material => material?.visible)) objects.add(object);
  }
  scene.traverseVisible(collect);
  for (const root of include) root.traverse(collect);
  const candidates = [...objects], batch = new Group();
  const parallel = renderer.extensions?.has("KHR_parallel_shader_compile") === true;
  const gl = parallel ? renderer.getContext() : null;
  const completion = parallel ? renderer.extensions.get("KHR_parallel_shader_compile").COMPLETION_STATUS_KHR : null;
  const size = parallel ? candidates.length || 1 : 4;
  for (let start = 0; start < candidates.length; start += size) {
    if (isDisposed() || gl?.isContextLost()) return false;
    batch.clear();
    for (const object of candidates.slice(start, start + size)) batch.add(object.clone(false));
    const previous = parallel ? new Set(renderer.info.programs) : null;
    renderer.compile(batch, camera, scene);
    if (parallel) {
      // Three r179's compileAsync owns an uncancellable polling timer. A lost
      // context can leave it pending forever. Own the polling here so a scene
      // cancellation/context loss releases the renderer lease without a timer
      // or stale material references surviving it.
      const pending = new Set(renderer.info.programs.filter(program => !previous.has(program)));
      while (pending.size) {
        if (isDisposed() || gl.isContextLost()) return false;
        for (const program of pending) {
          const ready = gl.getProgramParameter(program.program, completion);
          if (gl.isContextLost()) return false;
          if (ready === null) throw new Error("Wheel shader compilation was interrupted.");
          if (ready) pending.delete(program);
        }
        if (pending.size) await yieldControl();
      }
    }
    onProgress(Math.min(start + size, candidates.length), candidates.length);
    await yieldControl();
  }
  batch.clear();
  return !isDisposed();
}
