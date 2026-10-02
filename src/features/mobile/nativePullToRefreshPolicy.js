const BLOCKING_FEATURES = ["overlays", "chat", "preferences", "admin", "daily", "duel", "stats"];

export function canNativePullToRefresh(state, getFeatureState = () => ({}), hasLocalDialog = false) {
  if (state.navigation.view !== "home" || !state.boot.ready || state.boot.overlayVisible ||
      state.session.isLoggedIn || state.session.isConnecting || state.session.resumePending ||
      state.game.phase === "playing" || hasLocalDialog) return false;
  for (const name of BLOCKING_FEATURES) {
    const feature = getFeatureState(name) || {};
    if (Object.entries(feature).some(([key, value]) =>
      ((key === "open" || key.endsWith("Open")) && value === true) || value?.open === true)) return false;
    if (name === "overlays" && (feature.authModalMode || feature.trainingConfirm)) return false;
    if (name === "daily" && feature.launchDialog) return false;
    if (name === "duel" && feature.popup?.mode) return false;
  }
  return true;
}

export function isEditableElement(element) {
  return !!(element?.isContentEditable || element?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}

export function isPullToRefreshSurfaceAtTop(target, document, window) {
  if (!target?.closest?.(".home-lobby-screen") || isEditableElement(target) ||
      isEditableElement(document.activeElement) || Math.abs(window.scrollY || 0) > 1 ||
      Math.abs((window.visualViewport?.scale || 1) - 1) > 0.01) return false;
  for (let element = target; element; element = element.parentElement) {
    if (element.scrollTop > 1) return false;
  }
  for (const dialog of document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')) {
    if (dialog.getClientRects().length && window.getComputedStyle(dialog).visibility !== "hidden") return false;
  }
  return true;
}
