function freezeState(value) {
  return value && typeof value === "object" && !Object.isFrozen(value)
    ? Object.freeze(value)
    : value;
}

export function createFeatureStore(initialState) {
  let state = freezeState(initialState);
  const listeners = new Set();

  function getState() {
    return state;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function replace(nextOrUpdater) {
    const next = freezeState(
      typeof nextOrUpdater === "function" ? nextOrUpdater(state) : nextOrUpdater
    );
    if (Object.is(next, state)) return state;
    state = next;
    for (const listener of [...listeners]) listener();
    return state;
  }

  function patch(rawPatch) {
    if (!rawPatch || typeof rawPatch !== "object") return state;
    let changed = false;
    const next = { ...state };
    for (const [field, nextOrUpdater] of Object.entries(rawPatch)) {
      const value =
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(state?.[field])
          : nextOrUpdater;
      if (Object.is(state?.[field], value)) continue;
      next[field] = value;
      changed = true;
    }
    return changed ? replace(next) : state;
  }

  function set(field, nextOrUpdater) {
    return patch({ [field]: nextOrUpdater });
  }

  return Object.freeze({ getState, patch, replace, set, subscribe });
}
