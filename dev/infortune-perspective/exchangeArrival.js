import { EXCHANGE_SECTOR_INDICES } from '../../shared/infortuneWheel.js';

export const EXCHANGE_ARRIVAL_SECONDS = 1.8;
const STAGGER_SECONDS = Math.min(.22, .7 / Math.max(1, EXCHANGE_SECTOR_INDICES.length - 1));
const FALL_SECONDS = 1.05, CONTACT_FRACTION = .82;
export const exchangeTileImpactSeconds = index => index * STAGGER_SECONDS + FALL_SECONDS * CONTACT_FRACTION;
export function exchangeTilePose(progress, index) {
  const t = Math.max(0, Math.min(1, (progress * EXCHANGE_ARRIVAL_SECONDS - index * STAGGER_SECONDS) / FALL_SECONDS));
  const falling = Math.min(1, t / CONTACT_FRACTION);
  const bounce = t > CONTACT_FRACTION ? Math.sin((t - CONTACT_FRACTION) / (1 - CONTACT_FRACTION) * Math.PI) * 5 : 0;
  return { visible: progress > 0, landed: t === 1, height: 1200 * (1 - falling * falling) + bounce, tilt: (1 - falling) * 0.1 };
}

// One cancellable clock for both renderers; hidden tabs don't skip the reveal.
export function createExchangeArrival({ onProgress, onDone, now = () => performance.now(),
  requestFrame = callback => requestAnimationFrame(callback), cancelFrame = handle => cancelAnimationFrame(handle),
  hidden = () => document.hidden }) {
  let frame = null, previous = null, elapsed = 0, started = false;
  function tick(time) {
    frame = null;
    if (!hidden() && previous !== null) elapsed += Math.min(100, Math.max(0, time - previous));
    previous = time;
    const progress = Math.min(1, elapsed / (EXCHANGE_ARRIVAL_SECONDS * 1000));
    onProgress(progress);
    if (progress === 1) onDone(); else frame = requestFrame(tick);
  }
  return {
    start() { if (started) return; started = true; previous = now(); frame = requestFrame(tick); },
    reset() { if (frame !== null) cancelFrame(frame); frame = previous = null; elapsed = 0; started = false; onProgress(0); },
    dispose() { if (frame !== null) cancelFrame(frame); frame = null; },
  };
}
