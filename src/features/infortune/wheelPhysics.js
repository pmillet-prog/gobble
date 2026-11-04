import { DEFAULT_PHYSICS, PEG_PITCH, MAX_LAUNCH_SPEED, MIN_LAUNCH_SPEED } from "./wheelConfig.js";
import { MAX_CONTACT_STEP, pawlTorque, stepPawl } from "./wheelPawl.js";
import { WHEEL_GEOMETRY } from "./wheelGeometry.js";
import { CLASSIC_PAWL } from "./wheelPawlModels.js";

export function createWheelState(angle = PEG_PITCH / 2, pawl = 0, direction = 1, pegRadius = WHEEL_GEOMETRY.pegRadius, pawlModel = CLASSIC_PAWL) {
  const state = { angle, velocity: 0, pawl, pawlVelocity: 0, direction, pegRadius, pawlModel, restTime: 0, settled: true, contact: null, loadedPeg: null, pawlResting: true };
  stepPawl(state, 0);
  state.pawlResting = true;
  return state;
}

export function launchWheel(state, velocity) {
  if (!Number.isFinite(velocity) || Math.abs(velocity) < MIN_LAUNCH_SPEED) return false;
  state.velocity = Math.sign(velocity) * Math.min(Math.abs(velocity), MAX_LAUNCH_SPEED);
  state.direction = Math.sign(velocity);
  state.restTime = 0;
  state.settled = false;
  return true;
}

export function stepWheel(state, dt, physics = DEFAULT_PHYSICS) {
  if (state.settled) return 0;
  const steps = Math.max(1, Math.ceil(Math.abs(state.velocity) * dt / MAX_CONTACT_STEP));
  const step = dt / steps;
  let ticks = 0;
  for (let i = 0; i < steps; i++) {
    const previousAngle = state.angle;
    const freeVelocity = state.velocity + (pawlTorque(state, physics) - physics.drag * state.velocity) * step;
    // Low bearing friction plus speed-dependent resistance preserves the heavy
    // fast spin, while allowing elastic creep/rollback at very low speeds.
    const bearingResistance = physics.friction * (0.008 + 0.992 * Math.tanh(Math.abs(state.velocity) / 0.45));
    state.velocity = Math.sign(freeVelocity) * Math.max(0, Math.abs(freeVelocity) - bearingResistance * step);
    state.angle += state.velocity * step;
    if (Math.abs(state.velocity) > 0.025) state.direction = Math.sign(state.velocity);
    const released = stepPawl(state, step, previousAngle);
    if (released) {
      const speedSquared = state.velocity ** 2;
      const loss = physics.pegLoss * speedSquared / (speedSquared + 0.25);
      state.velocity = Math.sign(state.velocity) * Math.sqrt(Math.max(0, speedSquared - 2 * loss * released));
    }
    ticks += released;
    state.restTime = state.velocity === 0 ? state.restTime + step : 0;
  }
  state.settled = state.restTime >= 0.22 && state.pawlResting;
  return ticks;
}

export function angularDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

// Only the last 100 ms count. Holding the wheel still before release removes
// the impulse, and slow frame rates do not amplify a single movement event.
export function gestureVelocity(samples, now) {
  const recent = samples.filter(sample => now - sample.time <= 100);
  if (recent.length < 2) return 0;
  const first = recent[0], last = recent[recent.length - 1];
  const seconds = (last.time - first.time) / 1000;
  if (seconds < 0.008 || now - last.time > 60) return 0;
  return (last.angle - first.angle) / seconds;
}
