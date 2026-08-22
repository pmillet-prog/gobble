import { createFeatureStore } from "./createFeatureStore.js";

export function createStateFeature({ scope }, initialState, options = {}) {
  const store = createFeatureStore(
    typeof initialState === "function" ? initialState() : initialState
  );
  let started = false;

  function start() {
    if (started) return;
    started = true;
    const cleanup = options.start?.({ scope, store });
    if (typeof cleanup === "function") scope.add(cleanup);
  }

  return Object.freeze({
    patch: store.patch,
    set: store.set,
    start,
    store,
  });
}
