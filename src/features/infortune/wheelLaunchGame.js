import { MAX_LAUNCH_SPEED, MIN_LAUNCH_SPEED } from "./wheelConfig.js";
import { createWheelSkillShot, GESTURE_MODES } from "./wheelSkillShot.js";
export const MINIMUM_LAUNCH_POWER = MIN_LAUNCH_SPEED / MAX_LAUNCH_SPEED;
export const PERFECT_WINDOW = 0.028;
export const GOOD_WINDOW = 0.11;
export const DEFAULT_LAUNCH_REWARDS = Object.freeze({ good: 50, perfect: 100 });
const fraction = value => value - Math.floor(value);

// The one visible power target stays fixed during an attempt. It never chooses
// a sector or modifies the velocity supplied to the physical simulation.
export function launchChallenge(attempt = 0) {
  return Object.freeze({
    power: 0.55 + 0.22 * fraction((attempt + 1) * 0.41421356237),
    powerDuration: 440 + 120 * fraction((attempt + 1) * 0.2360679775),
  });
}

export function gaugePosition(elapsed, duration) {
  const phase = (Math.max(0, elapsed) / duration) % 2;
  return phase <= 1 ? phase : 2 - phase;
}

export function launchQuality(power, challenge, rewards = DEFAULT_LAUNCH_REWARDS) {
  const error = Math.abs(power - challenge.power);
  const kind = Number.isFinite(error) && power >= MINIMUM_LAUNCH_POWER
    ? error <= PERFECT_WINDOW + 1e-10 ? "perfect" : error <= GOOD_WINDOW + 1e-10 ? "good" : "miss"
    : "miss";
  return Object.freeze({ kind, label: kind === "perfect" ? "Lancer parfait" : kind === "good" ? "Beau lancer"
    : power < MINIMUM_LAUNCH_POWER ? "Puissance insuffisante" : "Pas de bonus",
    bonus: kind === "miss" ? 0 : rewards[kind], power, targets: challenge });
}

// This satellite owns the input challenge, never the sector. The player's
// measured gesture (or chosen click power) supplies the physical impulse;
// the reward calculation never changes it.
export function createWheelLaunchGame(options = {}) {
  let attempt = 0, challenge = launchChallenge(attempt);
  let rewards = { ...DEFAULT_LAUNCH_REWARDS }, stage = "idle", startTime = 0, chosenPower = 0;
  let gestureMode = "power", skill = null, skillResult = null;
  function configure(value = {}) {
    if (Object.hasOwn(GESTURE_MODES, value.gestureMode)) gestureMode = value.gestureMode;
    for (const key of ["good", "perfect"]) {
      if (Number.isFinite(value.rewards?.[key])) rewards[key] = Math.max(0, Math.min(100000, Math.round(value.rewards[key])));
    }
  }
  configure(options);
  function cancel() { stage = "idle"; chosenPower = 0; skill = null; skillResult = null; }
  function view(time, velocity = 0) {
    return { attempt, stage, gestureMode, scoringMode: stage === "idle" ? gestureMode : skill ? gestureMode : "power",
      skill: stage === "drag" ? skill?.snapshot(time) : null,
      skillResult: stage === "launched" || stage === "rejected" ? skillResult : null,
      rewards: { ...rewards }, targets: challenge, minimumPower: MINIMUM_LAUNCH_POWER,
      power: stage === "power" ? gaugePosition(time - startTime, challenge.powerDuration)
        : stage === "drag" ? Math.min(1, Math.abs(velocity) / MAX_LAUNCH_SPEED) : chosenPower,
    };
  }
  return {
    view, configure, cancel,
    next() { if (stage === "launched") challenge = launchChallenge(++attempt); cancel(); },
    beginDrag(point, time) { cancel(); stage = "drag"; skill = createWheelSkillShot(gestureMode, point, time, attempt); },
    recordGesture(point, time, travel) { skill?.record(point, time, travel); },
    gestureVelocity(time, fallback) { return skill ? skill.velocity(time) : fallback; },
    scoreDrag(velocity, time) {
      // Freeze the actual release, including failed attempts. Later animation
      // frames must not decay its power or move a sling's target in the replay.
      skillResult = skill?.snapshot(time) ?? null;
      return skill ? skill.quality(time, rewards) : launchQuality(Math.abs(velocity) / MAX_LAUNCH_SPEED, challenge, rewards);
    },
    beginClick(time) { cancel(); stage = "power"; startTime = time; },
    click(time) {
      if (stage !== "power") return null;
      chosenPower = gaugePosition(time - startTime, challenge.powerDuration);
      return { velocity: chosenPower * MAX_LAUNCH_SPEED, quality: launchQuality(chosenPower, challenge, rewards) };
    },
    commit(quality, accepted = true) { stage = accepted ? "launched" : "rejected"; chosenPower = quality.power; },
  };
}
