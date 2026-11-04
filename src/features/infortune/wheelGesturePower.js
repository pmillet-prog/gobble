import { MAX_LAUNCH_SPEED } from "./wheelConfig.js";

export const GESTURE_SMOOTHING_MS = 100;
export const GESTURE_IDLE_GRACE_MS = 50;
export const GESTURE_REFERENCE_SPEED = 1.8; // Visible wheel widths per second.

// Integrate the finger's signed travel, not the perspective-amplified wheel
// angle. The filter uses elapsed time, so 30/60/120 Hz inputs behave alike.
export function createGesturePower({ referenceSpeed = GESTURE_REFERENCE_SPEED, idleGraceMs = GESTURE_IDLE_GRACE_MS } = {}) {
  let previousPosition = 0, previousTime = 0, speed = 0;
  return {
    reset(time = 0) { previousPosition = 0; previousTime = time; speed = 0; },
    record(position, time) {
      if (!Number.isFinite(position) || !Number.isFinite(time) || time <= previousTime) return;
      const elapsed = time - previousTime;
      const measured = (position - previousPosition) * 1000 / elapsed;
      const weight = -Math.expm1(-elapsed / GESTURE_SMOOTHING_MS);
      speed += (measured - speed) * weight;
      previousPosition = position; previousTime = time;
    },
    velocity(time) {
      // Pointer events are discrete, even during a continuous slide. Do not
      // mistake the normal gap between two samples for a stopped finger.
      const idle = Math.max(0, time - previousTime - idleGraceMs);
      const current = speed * Math.exp(-idle / GESTURE_SMOOTHING_MS);
      // Soft saturation keeps normal slides in the useful middle of the gauge.
      return Math.sign(current) * MAX_LAUNCH_SPEED * -Math.expm1(-Math.abs(current) / referenceSpeed);
    },
  };
}
