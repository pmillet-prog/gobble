export const WHEEL_DRAG_RESPONSE_MS = 75;

// The wheel gathers momentum under the hand instead of snapping to its angle.
// Integrate a linear finger segment analytically: event and display frequencies
// cannot change the position reached at release. Frame reads are non-mutating.
export function createWheelDragMotion(angle, time, responseMs = WHEEL_DRAG_RESPONSE_MS) {
  let target = angle, position = angle, sampledAt = time;
  return {
    record(next, at) {
      if (!Number.isFinite(next) || !Number.isFinite(at) || at < sampledAt) return;
      const elapsed = at - sampledAt;
      if (elapsed > 0) {
        const speed = (next - target) / elapsed;
        const decay = Math.exp(-elapsed / responseMs);
        position = next - speed * responseMs + (position - target + speed * responseMs) * decay;
      }
      target = next; sampledAt = at;
    },
    position(at) {
      return target + (position - target) * Math.exp(-Math.max(0, at - sampledAt) / responseMs);
    },
  };
}
