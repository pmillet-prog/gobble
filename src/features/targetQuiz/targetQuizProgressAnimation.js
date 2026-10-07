import { advanceTargetQuizPoints, normalizeTargetQuizPoints, TARGET_QUIZ_POINTS_GOAL } from "../../../shared/targetQuizPoints.js";

export const TARGET_QUIZ_PROGRESS_DELAY = 450;
export const TARGET_QUIZ_PROGRESS_DURATION = 2600;

export function buildTargetQuizProgressFrames(progression) {
  const frames = [];
  let current = normalizeTargetQuizPoints(progression.before);
  let rewards = 0;
  for (const delta of progression.steps || []) {
    const { after, amount } = advanceTargetQuizPoints(current, delta);
    if (amount) {
      const top = { ...current, points: TARGET_QUIZ_POINTS_GOAL, total: current.total + TARGET_QUIZ_POINTS_GOAL - current.points };
      frames.push({ from: current, to: top, rewards, weight: Math.max(50, top.total - current.total) });
      rewards += 1;
      frames.push({ from: top, to: top, rewards, weight: 100 });
      frames.push({ from: { ...top, points: 0 }, to: after, rewards, weight: Math.max(50, after.points) });
    } else frames.push({ from: current, to: after, rewards, weight: Math.max(50, Math.abs(delta)) });
    current = after;
  }
  const weight = frames.reduce((sum, frame) => sum + frame.weight, 0);
  return { frames, weight, before: normalizeTargetQuizPoints(progression.before), after: normalizeTargetQuizPoints(progression.after), rewards };
}

export function getTargetQuizProgressFrame(timeline, fraction) {
  if (fraction >= 1 || !timeline.frames.length) return { ...timeline.after, rewards: timeline.rewards };
  let cursor = Math.max(0, fraction) * timeline.weight;
  for (const frame of timeline.frames) {
    if (cursor <= frame.weight) {
      const t = cursor / frame.weight;
      return { points: Math.round(frame.from.points + (frame.to.points - frame.from.points) * t),
        total: Math.round(frame.from.total + (frame.to.total - frame.from.total) * t), rewards: frame.rewards };
    }
    cursor -= frame.weight;
  }
  return { ...timeline.after, rewards: timeline.rewards };
}
