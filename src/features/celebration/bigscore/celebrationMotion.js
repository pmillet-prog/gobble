// Mirrors the existing CSS keyframes, including easing separately per segment.
const clamp = value => Math.max(0, Math.min(1, value));
export function cubicBezier(x, x1 = .2, y1 = .8, x2 = .25, y2 = 1) {
  if (x <= 0 || x >= 1) return clamp(x);
  const at = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 18; i++) {
    const mid = (low + high) / 2;
    if (at(mid, x1, x2) < x) low = mid; else high = mid;
  }
  return at((low + high) / 2, y1, y2);
}
const mix = (a, b, t) => a + (b - a) * t;

export function sampleCelebrationMotion(item, elapsedMs) {
  const progress = clamp(elapsedMs / item.duration);
  const gobble = item.type === "gobble";
  const frames = gobble
    ? [[0, 0, .2, 0], [.2, 0, 1, 1], [.72, .78, item.scale * .96, .98], [1, 1, item.scale, 0]]
    : [[0, 0, .16, 0], [.18, 0, 1, 1], [1, 1, item.scale, 0]];
  let index = 1;
  while (index < frames.length - 1 && progress > frames[index][0]) index++;
  const a = frames[index - 1], b = frames[index];
  const t = cubicBezier((progress - a[0]) / (b[0] - a[0]));
  const travel = mix(a[1], b[1], t);
  const imageAlpha = gobble ? .86 : item.type === "praise"
    ? mix(.76, 1, clamp((progress - .2) / .18)) : 1;
  const ringProgress = clamp(elapsedMs / 720);
  const ringAlpha = ringProgress < .18
    ? .52 * cubicBezier(ringProgress / .18, 0, 0, .58, 1)
    : .52 * (1 - cubicBezier((ringProgress - .18) / .82, 0, 0, .58, 1));
  return { x: item.dx * travel, y: item.dy * travel,
    scale: mix(a[2], b[2], t), alpha: mix(a[3], b[3], t) * imageAlpha, ringAlpha };
}
