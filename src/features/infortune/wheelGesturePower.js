import { MAX_LAUNCH_SPEED } from "./wheelConfig.js";

export const GESTURE_SMOOTHING_MS = 75;
export const GESTURE_IDLE_GRACE_MS = 50;
export const GESTURE_REFERENCE_SPEED = 4.5; // Wheel diameters per second for full power.

// Integrate the finger's signed travel, not the perspective-amplified wheel
// angle. The filter uses elapsed time, so 30/60/120 Hz inputs behave alike.
export function createGesturePower({ referenceSpeed = GESTURE_REFERENCE_SPEED, idleGraceMs = GESTURE_IDLE_GRACE_MS,
  smoothingMs = GESTURE_SMOOTHING_MS, decayMs = 100, response = "linear" } = {}) {
  let previousPosition = 0, previousTime = 0, speed = 0;
  return {
    reset(time = 0) { previousPosition = 0; previousTime = time; speed = 0; },
    record(position, time) {
      if (!Number.isFinite(position) || !Number.isFinite(time) || time <= previousTime) return;
      const elapsed = time - previousTime;
      const measured = (position - previousPosition) * 1000 / elapsed;
      const weight = -Math.expm1(-elapsed / smoothingMs);
      speed += (measured - speed) * weight;
      previousPosition = position; previousTime = time;
    },
    velocity(time) {
      // Pointer events are discrete, even during a continuous slide. Do not
      // mistake the normal gap between two samples for a stopped finger.
      const idle = Math.max(0, time - previousTime - idleGraceMs);
      const current = speed * Math.exp(-idle / decayMs);
      // Full power has a finite, reachable speed. Keep the older response only
      // for the separate trace experiment, whose path has its own calibration.
      const power = response === "soft" ? -Math.expm1(-Math.abs(current) / referenceSpeed)
        : Math.min(1, Math.abs(current) / referenceSpeed);
      return Math.sign(current) * MAX_LAUNCH_SPEED * power;
    },
  };
}
