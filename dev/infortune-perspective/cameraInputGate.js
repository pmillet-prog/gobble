// Keep a paused / scrubbed intro locked as well. Disabling automatic direction
// is the workshop's explicit bypass; a manually playing intro still owns input.
export function createCameraInputGate(setLocked) {
  let pending = true, state = { sequence: "intro", time: 0, playing: false };
  return {
    begin() { pending = true; setLocked(true); },
    update(nextState, { stageReady, automatic }) {
      state = nextState || state;
      if (state.sequence === "intro") pending = state.time < 5;
      setLocked(!stageReady || (automatic && pending) || (state.sequence === "intro" && state.playing && state.time < 5));
    },
  };
}
