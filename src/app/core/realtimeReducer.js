import { reduceFieldSlice } from "./fieldSlice.js";
import { REALTIME_STATE_FIELD_SET } from "./realtimeState.js";

export const REALTIME_ACTIONS = Object.freeze({
  FIELD_CHANGED: "realtime/field-changed",
  PATCHED: "realtime/patched",
});

export function reduceRealtimeState(state, action) {
  return reduceFieldSlice(state, action, {
    fieldChanged: REALTIME_ACTIONS.FIELD_CHANGED,
    fields: REALTIME_STATE_FIELD_SET,
    patched: REALTIME_ACTIONS.PATCHED,
  });
}
