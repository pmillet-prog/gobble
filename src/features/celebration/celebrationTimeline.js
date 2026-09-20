export const CELEBRATION_DURATION = 6800;
export const PODIUM_ARRIVAL = Object.freeze({ 3: 1000, 2: 2150, 1: 3450 });
const BLINK_AT = Object.freeze({ 1: 5230, 2: 4860, 3: 5680 });

export function getPodiumPose(rank, elapsed) {
  if (elapsed >= BLINK_AT[rank] && elapsed < BLINK_AT[rank] + 140) return "blink";
  return elapsed >= PODIUM_ARRIVAL[rank] + 700 ? "happy" : "neutral";
}

// Only pose changes and milestones update React. Movement is handled by CSS.
export const CELEBRATION_CUES = Object.freeze([...new Set([
  ...Object.values(PODIUM_ARRIVAL),
  ...Object.values(PODIUM_ARRIVAL).map(value => value + 700),
  ...Object.values(BLINK_AT).flatMap(value => [value, value + 140]),
  CELEBRATION_DURATION,
])].sort((a, b) => a - b));

export function startCelebration({ onCue, schedule = setTimeout, cancel = clearTimeout }) {
  let active = true;
  const timers = CELEBRATION_CUES.map(at => schedule(() => { if (active) onCue(at); }, at));
  return () => { active = false; timers.forEach(cancel); };
}
