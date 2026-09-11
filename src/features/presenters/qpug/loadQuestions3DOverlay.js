let overlayModulePromise = null;

export function loadQuestions3DOverlay() {
  if (!overlayModulePromise) {
    overlayModulePromise = import("./Questions3DOverlay.jsx");
  }
  return overlayModulePromise;
}
