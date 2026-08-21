import { SESSION_STATE_FIELD_SET } from "./sessionState.js";
import { reduceFieldSlice } from "./fieldSlice.js";

export const SESSION_ACTIONS = Object.freeze({
  FIELD_CHANGED: "session/field-changed",
  PATCHED: "session/patched",
});

export function reduceSessionState(state, action) {
  return reduceFieldSlice(state, action, {
    fieldChanged: SESSION_ACTIONS.FIELD_CHANGED,
    fields: SESSION_STATE_FIELD_SET,
    patched: SESSION_ACTIONS.PATCHED,
  });
}
