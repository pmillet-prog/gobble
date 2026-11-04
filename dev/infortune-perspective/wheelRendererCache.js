// The cache owns the renderer; a lease owns the current scene. Keeping the
// suspended previous scene alive until ready() preserves Three's program refs
// while the next scene compiles its own materials, even with different players.
export function createWheelRendererCache({ createRenderer,
  disposeRenderer = renderer => { renderer.dispose(); renderer.forceContextLoss?.(); },
  idleMs = 5 * 60_000, schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  let idle = null, timer = null;
  const active = new Set(), releases = new Set(), retirements = new Set();

  function track(set, promise) {
    set.add(promise);
    // Cleanup is observed even when the UI does not await release()/clear().
    promise.then(() => set.delete(promise), () => set.delete(promise));
    return promise;
  }
  function takeIdle() {
    const value = idle;
    idle = null;
    if (timer !== null) { cancel(timer); timer = null; }
    return value;
  }
  function healthy(renderer) {
    try { return renderer.getContext?.()?.isContextLost?.() !== true; }
    catch { return false; }
  }
  function disposeScene(scene) {
    return Promise.resolve().then(() => scene?.dispose());
  }
  function retire(state) {
    if (state.retirement) return state.retirement;
    state.retirement = track(retirements, (async () => {
      const scenes = [...new Set([state.scene, state.previous].filter(Boolean))];
      const results = await Promise.allSettled([
        state.previousCleanup, ...scenes.map(disposeScene),
      ]);
      const errors = results.filter(result => result.status === "rejected").map(result => result.reason);
      try { await disposeRenderer(state.renderer); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, "Wheel renderer cleanup failed.");
    })());
    return state.retirement;
  }
  async function waitForCleanup() {
    // A cancelled scene may still be inside compileAsync. Do not allocate its
    // replacement context until that work and the renderer disposal settle.
    while (releases.size || retirements.size) {
      await Promise.allSettled([...releases, ...retirements]);
    }
  }

  return {
    async acquire({ retain = true } = {}) {
      // Fresh-context diagnostics neither consume nor evict the session cache.
      if (retain) await waitForCleanup();
      let cached = retain ? takeIdle() : null;
      if (cached && !healthy(cached.renderer)) {
        await retire(cached).catch(() => {}); cached = null;
      }
      const state = { renderer: cached?.renderer || createRenderer(), scene: null,
        previous: cached?.scene || null, previousCleanup: Promise.resolve(),
        retain, ready: false, released: false, release: null, retirement: null };
      active.add(state);
      return {
        renderer: state.renderer,
        reused: !!cached,
        bind(scene) {
          if (state.released || state.scene || !scene) throw new Error("Bind one wheel scene to an active lease.");
          state.scene = scene;
        },
        ready() {
          if (state.released || state.ready) return state.previousCleanup;
          if (!state.scene) throw new Error("Bind the wheel scene before marking it ready.");
          state.ready = true;
          const previous = state.previous; state.previous = null;
          state.previousCleanup = disposeScene(previous);
          state.previousCleanup.catch(() => { state.retain = false; });
          return state.previousCleanup;
        },
        release({ discard = false } = {}) {
          if (state.released) return state.release;
          state.released = true;
          try { state.scene?.suspend(); }
          catch { state.retain = false; }
          state.release = track(releases, (async () => {
            await state.previousCleanup.catch(() => { state.retain = false; });
            if (!discard && state.retain && state.ready && healthy(state.renderer)) {
              const replaced = takeIdle();
              idle = state;
              timer = schedule(() => {
                if (idle === state) void retire(takeIdle());
              }, idleMs);
              if (replaced) await retire(replaced);
            } else await retire(state);
          })());
          state.release.then(() => active.delete(state), () => active.delete(state));
          return state.release;
        },
      };
    },
    clear() {
      // Active gameplay continues; its eventual release will dispose resources.
      for (const state of active) state.retain = false;
      const cached = takeIdle();
      return cached ? retire(cached) : Promise.resolve();
    },
  };
}
