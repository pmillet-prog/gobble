import { PEG_PITCH } from "./wheelConfig.js";
import { contactSlope, pegExclusion } from "./wheelGeometry.js";
import { CLASSIC_PAWL, pawlSpringDisplacement } from "./wheelPawlModels.js";

const MAX_RECOIL_SPEED = 24;
export const MAX_CONTACT_STEP = PEG_PITCH / 12;

function contactBoundary(contact, angle, pegRadius, model) {
  const exclusion = pegExclusion(angle + contact.peg * PEG_PITCH, pegRadius, model);
  return exclusion ? exclusion[contact.side < 0 ? "min" : "max"] : null;
}

function passedPeg(state, contact, model) {
  const loaded = state.loadedPeg;
  let passed = 0;
  if (loaded && contactBoundary(loaded, state.angle, state.pegRadius, model) === null) {
    // A spring can momentarily detach and hit the same rod again. Remember
    // that rod through the bounce, until it actually clears the blade's tip.
    // Withdrawing from the entry side is not a completed passage either.
    passed = loaded.side * (state.angle + loaded.peg * PEG_PITCH) < 0 ? 1 : 0;
    state.loadedPeg = null;
  }
  if (contact) state.loadedPeg = contact;
  return passed;
}

export function pawlTorque(state, physics) {
  if (!state.contact) return 0;
  const model = state.pawlModel || CLASSIC_PAWL;
  const boundary = contactBoundary(state.contact, state.angle, state.pegRadius, model);
  if (boundary === null || Math.abs(state.pawl - boundary) > 0.0001) return 0;
  if (state.contact.side * state.pawl <= 0) return 0;
  // Flexible blades stiffen as they bend; the rigid model has a linear torsion
  // spring at its axle. Both return the stored elastic energy to the wheel.
  // This is the derivative of its stored elastic energy; no suspense phase
  // changes the wheel speed or decides whether a peg will pass.
  const stiffness = physics.pegBarrier * 3.5 * model.stiffness;
  const restoringForce = stiffness * pawlSpringDisplacement(state.pawl, model);
  return -restoringForce * contactSlope(state.angle + state.contact.peg * PEG_PITCH, state.contact.side, state.pegRadius, model);
}

export function stepPawl(state, dt, previousWheelAngle = state.angle) {
  const previousPawl = state.pawl;
  const previousContact = state.contact;
  const model = state.pawlModel || CLASSIC_PAWL;
  state.pawlVelocity += (-model.spring * pawlSpringDisplacement(state.pawl, model) - model.damping * state.pawlVelocity) * dt;
  let nextPawl = state.pawl + state.pawlVelocity * dt;
  let contact = null;
  const nearest = -Math.round(state.angle / PEG_PITCH);
  for (let offset = -2; offset <= 2; offset++) {
    const peg = nearest + offset;
    const exclusion = pegExclusion(state.angle + peg * PEG_PITCH, state.pegRadius, model);
    if (!exclusion) continue;
    const oldExclusion = pegExclusion(previousWheelAngle + peg * PEG_PITCH, state.pegRadius, model);
    let side;
    if (previousContact?.peg === peg) side = previousContact.side;
    else if (oldExclusion && previousPawl <= oldExclusion.min) side = -1;
    else if (oldExclusion && previousPawl >= oldExclusion.max) side = 1;
    else side = previousPawl < exclusion.center ? -1 : previousPawl > exclusion.center ? 1 : -state.direction;
    const boundary = exclusion[side < 0 ? "min" : "max"];
    // Swept constraint: retain the side from before the movement, even when a
    // fast peg crossed the unconstrained angle in this substep.
    if (side * (nextPawl - boundary) <= 0) {
      nextPawl = boundary;
      contact = { peg, side };
      const boundaryVelocity = dt > 0 ? (boundary - previousPawl) / dt : 0;
      state.pawlVelocity = Math.max(-MAX_RECOIL_SPEED, Math.min(MAX_RECOIL_SPEED, boundaryVelocity));
    }
  }
  state.pawl = nextPawl;
  state.contact = contact;
  const released = passedPeg(state, contact, model);
  state.pawlResting = Math.abs(state.pawl - previousPawl) < 0.00002 && Math.abs(state.pawlVelocity) < 0.015;
  if (!contact && state.pawlResting && Math.abs(state.pawl) < 0.0001) state.pawl = state.pawlVelocity = 0;
  return released;
}

// Pointer moves also sweep through the geometry before rendering, so dragging
// does not display a new wheel angle with a pawl left on the preceding frame.
export function dragWheelTo(state, angle) {
  const delta = angle - state.angle;
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / MAX_CONTACT_STEP));
  const start = state.angle;
  if (delta) state.direction = Math.sign(delta);
  let releases = 0;
  for (let i = 1; i <= steps; i++) {
    const previousAngle = state.angle;
    state.angle = start + delta * i / steps;
    releases += stepPawl(state, 0, previousAngle);
  }
  state.pawlResting = false;
  return releases;
}
