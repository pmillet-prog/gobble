import { GAME_STATE_FIELD_SET } from "./gameState.js";
import { reduceFieldSlice } from "./fieldSlice.js";

export const GAME_ACTIONS = Object.freeze({
  FIELD_CHANGED: "game/field-changed",
  PATCHED: "game/patched",
});

export function reduceGameState(state, action) {
  return reduceFieldSlice(state, action, {
    fieldChanged: GAME_ACTIONS.FIELD_CHANGED,
    fields: GAME_STATE_FIELD_SET,
    patched: GAME_ACTIONS.PATCHED,
  });
}
