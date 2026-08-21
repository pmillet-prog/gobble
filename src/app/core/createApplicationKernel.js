import { APPLICATION_ACTIONS, reduceApplicationState } from "./applicationReducer.js";
import { createInitialApplicationState } from "./applicationState.js";

export function createApplicationKernel(options = {}) {
  let state = createInitialApplicationState(options);
  const listeners = new Set();

  const getState = () => state;
  const subscribe = (listener) => {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const dispatch = (action) => {
    const nextState = reduceApplicationState(state, action);
    if (nextState === state) return state;
    state = nextState;
    for (const listener of [...listeners]) listener();
    return state;
  };

  const commands = Object.freeze({
    boot: Object.freeze({
      resolveAmbientTracks: (tracks) =>
        dispatch({
          type: APPLICATION_ACTIONS.BOOT_AMBIENT_TRACKS_RESOLVED,
          payload: tracks,
        }),
      setOverlayVisible: (visible) =>
        dispatch({
          type: APPLICATION_ACTIONS.BOOT_OVERLAY_VISIBILITY_CHANGED,
          payload: visible,
        }),
      setReady: () => dispatch({ type: APPLICATION_ACTIONS.BOOT_READY }),
    }),
    navigation: Object.freeze({
      go: (view) =>
        dispatch({
          type: APPLICATION_ACTIONS.NAVIGATION_GO,
          payload: view,
        }),
    }),
  });

  return Object.freeze({ commands, dispatch, getState, subscribe });
}
