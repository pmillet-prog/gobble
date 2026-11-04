import { CAMERA_SEQUENCES } from "./cameraTimeline.js";

// A speed threshold triggers the launch once, regardless of rotation direction
// or late pawl rebounds. Wait for both the shot and the wheel before returning.
export function createCameraSpinDirector({ player, enabled, readSpeedThreshold }) {
  let spinId = null, previousPhase = null, overridden = false, latest = null;
  let launchStarted = false, awaitingResults = false;
  function finishIfReady() {
    if (!awaitingResults || !enabled() || overridden) return;
    const transport = player.snapshot();
    if (transport.sequence === "launch" && (transport.playing || transport.time < CAMERA_SEQUENCES.launch.duration)) return;
    awaitingResults = false; player.play("results", { from: 0 });
  }
  function update(progress) {
    latest = progress;
    const { id, phase, velocity } = progress;
    if (phase === "ready") awaitingResults = false;
    if (phase === "spinning" && id !== spinId) {
      spinId = id; overridden = false; launchStarted = false; awaitingResults = false;
      if (enabled()) player.seek("intro", CAMERA_SEQUENCES.intro.duration);
    }
    if (enabled() && !overridden) {
      if (phase === "spinning" && !launchStarted && Math.abs(velocity) / (Math.PI * 2) <= readSpeedThreshold()) {
        launchStarted = true; player.play("launch", { from: 0 });
      } else if (phase === "finished" && previousPhase === "spinning") {
        // A very low frame rate may jump directly across the threshold to rest.
        if (!launchStarted) { launchStarted = true; player.play("launch", { from: 0 }); }
        awaitingResults = true; finishIfReady();
      } else if ((phase === "dragging" || phase === "aiming") && phase !== previousPhase) player.pause();
    }
    previousPhase = phase;
  }
  return { update, onTransportChange: finishIfReady,
    override() { overridden = true; awaitingResults = false; },
    resume() { overridden = false; if (latest) update(latest); },
  };
}
