import { cameraAt, CAMERA_SEQUENCES } from "./cameraTimeline.js";

export function createCameraTimelinePlayer({ readTimeline, onFrame, onChange, onCommit,
  now = () => performance.now(), requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }) {
  let sequence = "intro", time = 0, playing = false, chain = false, frame = null, started = 0, disposed = false;
  const order = Object.keys(CAMERA_SEQUENCES);
  const snapshot = () => ({ sequence, time, playing });
  function cancel() { if (frame !== null) cancelFrame(frame); frame = null; }
  function apply(commit = false) {
    const camera = cameraAt(readTimeline(), sequence, time);
    onFrame(camera, snapshot());
    if (commit) onCommit?.(camera);
  }
  function tick(timestamp) {
    frame = null;
    if (disposed || !playing) return;
    time = Math.max(0, (timestamp - started) / 1000);
    while (time >= CAMERA_SEQUENCES[sequence].duration && chain && sequence !== order.at(-1)) {
      const duration = CAMERA_SEQUENCES[sequence].duration;
      time -= duration; started += duration * 1000; sequence = order[order.indexOf(sequence) + 1]; onChange?.(snapshot());
    }
    const duration = CAMERA_SEQUENCES[sequence].duration;
    if (time >= duration) { time = duration; playing = false; }
    apply(!playing);
    if (playing) frame = requestFrame(tick); else onChange?.(snapshot());
  }
  return {
    snapshot,
    seek(nextSequence, nextTime) {
      if (disposed) return;
      cancel(); playing = false; sequence = nextSequence;
      time = Math.max(0, Math.min(CAMERA_SEQUENCES[sequence].duration, nextTime));
      apply(true); onChange?.(snapshot());
    },
    play(nextSequence, options) {
      if (disposed) return;
      const resuming = nextSequence === undefined && options === undefined;
      nextSequence ??= sequence;
      const { from = time, together = resuming ? chain : false } = options || {};
      cancel(); sequence = nextSequence; chain = together;
      time = from >= CAMERA_SEQUENCES[sequence].duration ? 0 : Math.max(0, from);
      playing = true; started = now() - time * 1000;
      apply(); onChange?.(snapshot()); frame = requestFrame(tick);
    },
    pause() {
      if (disposed || !playing) return;
      cancel(); playing = false; apply(true); onChange?.(snapshot());
    },
    refresh() { if (!disposed) apply(true); },
    dispose() { disposed = true; playing = false; cancel(); },
  };
}
