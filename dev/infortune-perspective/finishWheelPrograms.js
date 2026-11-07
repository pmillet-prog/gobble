// Three r179's compile() submits the shader links, but without KHR it does not
// wait for completion. Validate each newly submitted WebGL program separately,
// yielding before the blocking driver query instead of hiding all that work in
// the first full render. renderer.info.programs also supplies our diagnostics.
// A retained renderer can outlive many scenes. Neither the renderer nor its
// released program wrappers should be kept alive just by this bookkeeping.
const completedByRenderer = new WeakMap();

export async function finishWheelPrograms(renderer, { isDisposed = () => false,
  onProgress = () => {}, onProgramTiming = () => {}, now = () => performance.now(),
  allowCheck = async () => true,
  yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  let completed = completedByRenderer.get(renderer);
  if (!completed) { completed = new WeakSet(); completedByRenderer.set(renderer, completed); }
  const programs = renderer.info.programs.filter(program => !completed.has(program));
  const gl = renderer.getContext();
  for (let index = 0; index < programs.length; index++) {
    const program = programs[index];
    onProgress(index, programs.length, program);
    const beforeYield = now();
    await yieldControl();
    if (!await allowCheck()) return false;
    if (isDisposed()) return false;
    const beforeCheck = now();
    const linked = gl.getProgramParameter(program.program, gl.LINK_STATUS);
    const afterCheck = now();
    // Measure the actual blocking query separately from scheduling delays. Do
    // not ask GL for shader sources/logs just to instrument a successful link.
    onProgramTiming({ id: program.id ?? index, type: program.type || "Shader", name: program.name || "",
      checkMs: afterCheck - beforeCheck, yieldMs: beforeCheck - beforeYield, linked });
    if (!linked) {
      throw new Error(`Wheel shader link failed: ${gl.getProgramInfoLog(program.program)}`);
    }
    completed.add(program);
  }
  if (programs.length) onProgress(programs.length, programs.length);
  return !isDisposed();
}
