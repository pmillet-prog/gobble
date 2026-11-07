// Without KHR_parallel_shader_compile, LINK_STATUS can synchronously block
// Firefox for seconds. Assets and shader submissions may preload; defer the
// blocking driver validation until this wheel becomes the foreground screen.
export function createWheelBackgroundPreparation({ canBlock = () => true,
  schedule = setTimeout, cancel = clearTimeout } = {}) {
  let disposed = false, timer = null, waiting = null, resolveWait = null;
  const finish = value => {
    if (timer !== null) cancel(timer); timer = null;
    const resolve = resolveWait; waiting = resolveWait = null; resolve?.(value);
  };
  const check = () => {
    timer = null;
    if (disposed || canBlock()) { finish(!disposed); return; }
    timer = schedule(check, 50);
  };
  return {
    wait() {
      if (disposed) return Promise.resolve(false);
      if (canBlock()) return Promise.resolve(true);
      if (!waiting) { waiting = new Promise(resolve => { resolveWait = resolve; }); timer = schedule(check, 50); }
      return waiting;
    },
    dispose() { disposed = true; finish(false); },
  };
}
