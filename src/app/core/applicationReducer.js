import { normalizeAppView } from "./applicationState.js";
import { reduceGameState } from "./gameReducer.js";
import { reduceSessionState } from "./sessionReducer.js";
import { reduceRealtimeState } from "./realtimeReducer.js";

export const APPLICATION_ACTIONS = Object.freeze({
  BOOT_AMBIENT_TRACKS_RESOLVED: "boot/ambient-tracks-resolved",
  BOOT_OVERLAY_VISIBILITY_CHANGED: "boot/overlay-visibility-changed",
  BOOT_READY: "boot/ready",
  NAVIGATION_GO: "navigation/go",
});

function replaceBoot(state, patch) {
  const boot = Object.freeze({ ...state.boot, ...patch });
  return Object.freeze({ ...state, boot });
}

export function reduceApplicationState(state, action) {
  const nextGame = reduceGameState(state.game, action);
  if (nextGame !== state.game) {
    return Object.freeze({ ...state, game: nextGame });
  }
  const nextSession = reduceSessionState(state.session, action);
  if (nextSession !== state.session) {
    return Object.freeze({ ...state, session: nextSession });
  }
  const nextRealtime = reduceRealtimeState(state.realtime, action);
  if (nextRealtime !== state.realtime) {
    return Object.freeze({ ...state, realtime: nextRealtime });
  }
  switch (action?.type) {
    case APPLICATION_ACTIONS.BOOT_AMBIENT_TRACKS_RESOLVED: {
      const ambientTracks = Array.isArray(action.payload) ? action.payload : [];
      if (ambientTracks === state.boot.ambientTracks) return state;
      return replaceBoot(state, { ambientTracks });
    }
    case APPLICATION_ACTIONS.BOOT_OVERLAY_VISIBILITY_CHANGED: {
      const overlayVisible = !!action.payload;
      if (overlayVisible === state.boot.overlayVisible) return state;
      return replaceBoot(state, { overlayVisible });
    }
    case APPLICATION_ACTIONS.BOOT_READY:
      return state.boot.ready ? state : replaceBoot(state, { ready: true });
    case APPLICATION_ACTIONS.NAVIGATION_GO: {
      const view = normalizeAppView(action.payload, state.navigation.view);
      if (view === state.navigation.view) return state;
      return Object.freeze({
        ...state,
        navigation: Object.freeze({
          previousView: state.navigation.view,
          view,
        }),
      });
    }
    default:
      return state;
  }
}
