// Explicit rendering primitives shared by the main-thread fallback and worker.
// Never emulate a DOM in the worker: textures own real OffscreenCanvas surfaces.
export const inRenderWorker = typeof document === 'undefined';
const visibilityEvents = new EventTarget();
let hidden = false;
export const renderVisibility = inRenderWorker ? {
  get hidden() { return hidden; },
  addEventListener: (...args) => visibilityEvents.addEventListener(...args),
  removeEventListener: (...args) => visibilityEvents.removeEventListener(...args),
} : document;
export function setRenderHidden(value) {
  if (hidden === value) return;
  hidden = value; visibilityEvents.dispatchEvent(new Event('visibilitychange'));
}
export function createRenderCanvas(width = 300, height = 150) {
  return typeof document === 'undefined' ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement('canvas'), { width, height });
}
export async function loadRenderImage(url, { signal } = {}) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Wheel image: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob());
  // CanvasTexture keeps the same flipY semantics as the original DOM textures.
  // An ImageBitmap uploaded directly to WebGL would ignore texture.flipY.
  try {
    const canvas = createRenderCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return canvas;
  } finally { bitmap.close(); }
}
export async function renderCanvasDataUrl(canvas) {
  return canvas.toDataURL ? canvas.toDataURL()
    : new FileReaderSync().readAsDataURL(await canvas.convertToBlob());
}
