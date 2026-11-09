import { DEFAULT_PHYSICS, FIXED_STEP, MAX_LAUNCH_SPEED, MIN_LAUNCH_SPEED, PEG_PITCH, TAU, WHEEL_SECTORS, normalizeAngle, sectorAtPointer } from "./wheelConfig.js";
import { angularDelta, createWheelState, gestureVelocity, launchWheel, stepWheel } from "./wheelPhysics.js";
import { dragWheelTo, stepPawl } from "./wheelPawl.js";
import { WHEEL_GEOMETRY } from "./wheelGeometry.js";
import { CLASSIC_PAWL } from "./wheelPawlModels.js";
import { createWheelLaunchGame } from "./wheelLaunchGame.js";
import { createGesturePower } from "./wheelGesturePower.js";
import { createWheelDragMotion } from "./wheelDragMotion.js";

export function createWheelController({
  render, onChange, onResult, onLaunch, onSpinProgress, audio, launchGame = null, inputLocked = false, catchUpElapsed = false,
  pegRadius = WHEEL_GEOMETRY.pegRadius,
  pawlModel: initialPawlModel = CLASSIC_PAWL,
  readSectors = () => undefined,
  now = () => performance.now(),
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = handle => cancelAnimationFrame(handle),
  random = Math.random,
}) {
  let pawlModel = initialPawlModel;
  // Shift by whole wedges: the peg physics is unchanged, while identical
  // gestures no longer start on the same denomination every round.
  const initialAngle = PEG_PITCH / 2 + Math.floor(random() * WHEEL_SECTORS.length) * TAU / WHEEL_SECTORS.length;
  let state = createWheelState(initialAngle, 0, 1, pegRadius, pawlModel), physics = DEFAULT_PHYSICS;
  let phase = "ready", frame = null, previousTime = null, accumulator = 0;
  let disposed = false, paused = false, samples = [], dragAngle = 0, gestureStart = null;
  let dragMotion = null, dragTarget = 0;
  let chargeStart = 0, launchAngle = 0, launchSpeed = 0, spinTime = 0, spinId = 0;
  const aiming = launchGame ? createWheelLaunchGame(launchGame) : null;
  const gesturePower = aiming ? createGesturePower() : null;
  const inputVelocity = time => {
    const velocity = gesturePower ? gesturePower.velocity(time) : gestureVelocity(samples, time);
    return aiming ? aiming.gestureVelocity(time, velocity) : velocity;
  };
  let lastLaunchQuality = null;
  const allowed = () => !disposed && !paused && !inputLocked && phase === "ready";
  const power = (time = now()) => phase === "charging" ? Math.min(1, (time - chargeStart) / 1450)
    : phase === "dragging" ? Math.min(1, Math.abs(inputVelocity(time)) / MAX_LAUNCH_SPEED) : 0;
  const draw = (time = now()) => {
    const sectors = readSectors();
    onSpinProgress?.({ id: spinId, phase, elapsed: spinTime, velocity: state.velocity, sectors,
      sectorIndex: phase === 'spinning' && Math.abs(state.velocity) <= 2.02
        ? sectorAtPointer(state.angle, state.pawl, pawlModel, sectors).index : null });
    render?.(state, phase, power(time), aiming?.view(time, inputVelocity(time)));
  };
  function setPhase(next, message = "", result = null) {
    phase = next;
    onChange?.({ phase, message, result, launchGame: aiming?.view(now(), inputVelocity(now())), launchQuality: lastLaunchQuality });
  }
  function stopFrame() {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    previousTime = null;
    accumulator = 0;
  }
  function schedule() {
    if (!disposed && !paused && frame === null && phase !== "finished" && (phase !== "ready" || !state.settled || !state.pawlResting)) frame = requestFrame(update);
  }
  function followDrag(time) {
    return dragMotion ? dragWheelTo(state, dragMotion.position(time)) : 0;
  }
  function update(time) {
    frame = null;
    if (disposed || paused) return;
    // A suspended live presentation must advance the same fixed-step physics,
    // not stretch a spin by the time spent in another tab. Bound catch-up work.
    const delta = previousTime === null ? 0 : Math.max(0, Math.min(catchUpElapsed ? 60 : 0.1, (time - previousTime) / 1000));
    previousTime = time;
    accumulator += delta;
    let clicks = phase === "dragging" ? followDrag(time) : 0;
    while (accumulator + 1e-10 >= FIXED_STEP) {
      if (phase === "spinning" || (phase === "ready" && !state.settled)) {
        clicks += stepWheel(state, FIXED_STEP, physics);
        if (phase === "spinning") spinTime += FIXED_STEP;
        if (state.settled) break;
      } else clicks += stepPawl(state, FIXED_STEP);
      accumulator -= FIXED_STEP;
    }
    if (clicks && delta <= 0.1) audio?.tick(phase === "dragging" ? inputVelocity(time) : state.velocity);
    if (phase === "spinning" && state.settled) {
      const result = { ...sectorAtPointer(state.angle, state.pawl, pawlModel, readSectors()), angle: normalizeAngle(state.angle), pawlAngle: state.pawl,
        turns: Math.abs(state.angle - launchAngle) / TAU, duration: spinTime, launchSpeed };
      if (lastLaunchQuality) result.launchQuality = lastLaunchQuality;
      stopFrame();
      setPhase("finished", "", result);
      draw();
      onResult?.(result);
      return;
    }
    draw();
    schedule();
  }
  function launch(velocity, quality = null) {
    dragMotion = null;
    stopFrame();
    if (!launchWheel(state, velocity)) {
      // The minimum impulse still gates a scored spin. A hand-released, loaded
      // blade may nevertheless relax the wheel through its own elastic energy.
      state.velocity = 0;
      state.restTime = 0;
      state.settled = !state.contact && state.pawlResting;
      if (quality) aiming?.commit(quality, false);
      else aiming?.cancel();
      lastLaunchQuality = quality;
      setPhase("ready", quality?.detail || (quality?.skillMode === "sling" ? "Puissance insuffisante : étirez davantage le lien avant de lâcher."
        : "Puissance insuffisante : accélérez le glissement jusqu’au repère minimum, puis lâchez."));
      draw();
      schedule();
      return false;
    }
    launchSpeed = state.velocity;
    launchAngle = state.angle;
    spinTime = 0;
    spinId++;
    lastLaunchQuality = quality;
    if (quality) aiming?.commit(quality);
    setPhase("spinning");
    if (catchUpElapsed) previousTime = now();
    onLaunch?.({ velocity: launchSpeed, quality });
    draw();
    schedule();
    return true;
  }
  function cancelGesture() {
    if (phase !== "dragging" && phase !== "charging" && phase !== "aiming") return;
    stopFrame();
    state = { ...gestureStart };
    dragMotion = null;
    samples = [];
    aiming?.cancel(); lastLaunchQuality = null;
    setPhase("ready");
    draw();
    schedule();
  }
  return {
    initialize() { setPhase("ready"); draw(); },
    beginDrag(angle, time = now(), gesturePoint) {
      if (!allowed()) return false;
      audio?.unlock();
      gestureStart = { ...state };
      state.velocity = 0;
      state.settled = true;
      dragAngle = angle;
      samples = [{ time, angle: state.angle }];
      gesturePower?.reset(time);
      aiming?.beginDrag(gesturePoint, time);
      dragTarget = state.angle;
      dragMotion = aiming?.view(time).gestureMode === "power" ? createWheelDragMotion(state.angle, time) : null;
      lastLaunchQuality = null;
      setPhase("dragging");
      schedule();
      return true;
    },
    drag(angle, time = now(), travel, { deferRender = false, gesturePoint } = {}) {
      if (phase !== "dragging" || disposed) return;
      const delta = angularDelta(dragAngle, angle);
      dragTarget += delta;
      dragMotion?.record(dragTarget, time);
      const releases = dragMotion ? followDrag(time) : dragWheelTo(state, state.angle + delta);
      gesturePower?.record(Number.isFinite(travel) ? travel : (dragTarget - gestureStart.angle) * 0.3, time);
      aiming?.recordGesture(gesturePoint, time, travel);
      dragAngle = angle;
      samples.push({ time, angle: state.angle });
      samples = samples.filter(sample => time - sample.time <= 120);
      if (releases) audio?.tick(gestureVelocity(samples, time));
      // The 3D input path can consume all coalesced samples without rendering
      // the entire set several times before the next display frame.
      if (!deferRender) draw(time);
    },
    endDrag(time = now()) {
      if (phase !== "dragging" || disposed) return false;
      const releases = followDrag(time);
      const velocity = inputVelocity(time);
      if (releases) audio?.tick(velocity);
      return launch(velocity, aiming?.scoreDrag(velocity, time));
    },
    clickLaunch(time = now()) {
      if (!aiming || disposed || paused) return false;
      if (allowed()) {
        audio?.unlock(); gestureStart = { ...state };
        state.velocity = 0; state.settled = true; samples = [];
        lastLaunchQuality = null;
        aiming.beginClick(time); setPhase("aiming"); draw(); schedule(); return true;
      }
      if (phase !== "aiming") return false;
      const action = aiming.click(time);
      if (!action) return false;
      return launch(action.velocity, action.quality);
    },
    autoLaunch() {
      if (disposed || paused || inputLocked || ["spinning", "finished"].includes(phase)) return false;
      cancelGesture();
      // Expiry cannot award a precision bonus or inherit a held gesture.
      return launch((MIN_LAUNCH_SPEED + MAX_LAUNCH_SPEED) / 2);
    },
    setLaunchOptions(value) {
      // Choosing a workshop variant during the intro does not unlock input.
      if (!aiming || disposed || paused || phase !== "ready") return false;
      aiming.configure(value); setPhase("ready"); draw(); return true;
    },
    beginCharge() {
      if (!allowed() || aiming) return false;
      audio?.unlock();
      gestureStart = { ...state };
      state.velocity = 0;
      state.settled = true;
      chargeStart = now();
      setPhase("charging");
      schedule();
      return true;
    },
    endCharge() {
      if (phase !== "charging" || disposed) return false;
      const velocity = power() * MAX_LAUNCH_SPEED;
      const launched = launch(velocity);
      if (!launched) setPhase("ready", "Maintenez un peu plus longtemps, jusqu’au repère, puis relâchez.");
      return launched;
    },
    cancelGesture,
    setInputLocked(value) {
      inputLocked = Boolean(value);
      if (inputLocked) cancelGesture();
    },
    reset() {
      if (disposed || (phase !== "finished" && phase !== "ready")) return;
      stopFrame();
      state = createWheelState(normalizeAngle(state.angle), state.pawl, state.direction, pegRadius, pawlModel);
      aiming?.next(); lastLaunchQuality = null; samples = [];
      setPhase("ready");
      draw();
    },
    setPhysics(value = {}) {
      if (phase !== "ready" && phase !== "finished") return;
      // Keep the prototype sliders in a dissipative, bounded simulation range.
      physics = { ...DEFAULT_PHYSICS };
      for (const [key, min, max] of [["friction", 0.6, 1.5], ["drag", 0.08, 0.25], ["pegBarrier", 0.01, 0.06], ["pegLoss", 0.003, 0.02]]) {
        if (Number.isFinite(value[key])) physics[key] = Math.min(max, Math.max(min, value[key]));
      }
    },
    setPawlModel(value = CLASSIC_PAWL) {
      if (disposed || (phase !== "ready" && phase !== "finished")) return false;
      stopFrame(); pawlModel = value;
      state = createWheelState(normalizeAngle(state.angle), 0, state.direction, pegRadius, pawlModel);
      aiming?.next(); lastLaunchQuality = null; samples = [];
      state.settled = !state.contact;
      setPhase("ready"); draw(); schedule(); return true;
    },
    setMuted(value) { audio?.setMuted(value); },
    unlockAudio() { audio?.unlock(); },
    pause() { cancelGesture(); paused = true; stopFrame(); audio?.suspend(); },
    resume() { if (disposed) return; paused = false; audio?.resume(); schedule(); },
    dispose() { disposed = true; stopFrame(); audio?.dispose(); },
    minimumPower: MIN_LAUNCH_SPEED / MAX_LAUNCH_SPEED,
  };
}
