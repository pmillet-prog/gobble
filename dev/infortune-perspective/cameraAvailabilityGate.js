// Loading a replacement renderer must pause, then resume the same shot. Never
// restart an intro or resume a different shot selected manually in the meantime.
export function createCameraAvailabilityGate() {
  let paused = null;
  return {
    update(player, available) {
      if (!player) return;
      const state = player.snapshot();
      if (!available) {
        if (state.playing) { paused = { sequence: state.sequence, time: state.time }; player.pause(); }
      } else if (paused) {
        const resume = !state.playing && state.sequence === paused.sequence && state.time === paused.time;
        paused = null;
        if (resume) player.play();
      }
    },
    reset() { paused = null; },
  };
}
