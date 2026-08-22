import { APPLICATION_ACTIONS, reduceApplicationState } from "./applicationReducer.js";
import { createInitialApplicationState } from "./applicationState.js";
import { GAME_ACTIONS } from "./gameReducer.js";
import { GAME_STATE_FIELDS } from "./gameState.js";
import { SESSION_ACTIONS } from "./sessionReducer.js";
import { SESSION_STATE_FIELDS } from "./sessionState.js";
import { REALTIME_ACTIONS } from "./realtimeReducer.js";
import { REALTIME_STATE_FIELDS } from "./realtimeState.js";
import { createFeatureRegistry } from "./createFeatureRegistry.js";

function setterNameForField(field) {
  return `set${field.charAt(0).toUpperCase()}${field.slice(1)}`;
}

export function createApplicationKernel(options = {}) {
  let state = createInitialApplicationState(options);
  let kernel = null;
  const listeners = new Set();
  const ports = Object.freeze({
    realtime: options.ports?.realtime || null,
  });
  const features = createFeatureRegistry({
    getKernel: () => kernel,
    ports,
  });

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

  const gameCommands = {
    patch: (patch) => dispatch({ type: GAME_ACTIONS.PATCHED, payload: patch }),
  };
  for (const field of GAME_STATE_FIELDS) {
    gameCommands[setterNameForField(field)] = (nextOrUpdater) => {
      const currentValue = getState().game[field];
      const value =
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(currentValue)
          : nextOrUpdater;
      return dispatch({
        type: GAME_ACTIONS.FIELD_CHANGED,
        payload: { field, value },
      });
    };
  }
  const sessionCommands = {
    patch: (patch) => dispatch({ type: SESSION_ACTIONS.PATCHED, payload: patch }),
  };
  for (const field of SESSION_STATE_FIELDS) {
    sessionCommands[setterNameForField(field)] = (nextOrUpdater) => {
      const currentValue = getState().session[field];
      const value =
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(currentValue)
          : nextOrUpdater;
      return dispatch({
        type: SESSION_ACTIONS.FIELD_CHANGED,
        payload: { field, value },
      });
    };
  }
  const realtimeCommands = {
    patch: (patch) => dispatch({ type: REALTIME_ACTIONS.PATCHED, payload: patch }),
  };
  for (const field of REALTIME_STATE_FIELDS) {
    realtimeCommands[setterNameForField(field)] = (nextOrUpdater) => {
      const currentValue = getState().realtime[field];
      const value =
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(currentValue)
          : nextOrUpdater;
      return dispatch({
        type: REALTIME_ACTIONS.FIELD_CHANGED,
        payload: { field, value },
      });
    };
  }

  const commands = Object.freeze({
    transition: Object.freeze({
      apply: (transition) =>
        dispatch({
          type: APPLICATION_ACTIONS.STATE_TRANSITIONED,
          payload: transition,
        }),
    }),
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
    game: Object.freeze(gameCommands),
    navigation: Object.freeze({
      go: (view) =>
        dispatch({
          type: APPLICATION_ACTIONS.NAVIGATION_GO,
          payload: view,
        }),
    }),
    realtime: Object.freeze(realtimeCommands),
    session: Object.freeze(sessionCommands),
  });

  const dispose = () => {
    features.dispose();
    listeners.clear();
  };
  kernel = Object.freeze({
    commands,
    dispatch,
    dispose,
    features,
    getState,
    ports,
    subscribe,
  });
  return kernel;
}
