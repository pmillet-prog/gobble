// A failed worker path stays disabled only for this page. Do not overwrite the
// player's graphics preference or mistake driver startup for a low FPS score.
let disabled = false;
export const canUseWheelRenderWorker = () => !disabled && typeof Worker !== 'undefined'
  && typeof globalThis.HTMLCanvasElement?.prototype.transferControlToOffscreen === 'function';
export function disableWheelRenderWorker() { disabled = true; }
