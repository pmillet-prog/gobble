// "unlock" alone restores the manifest/TWA default, which is portrait here.
// The board explicitly requests "any"; other mobile views keep portrait.
export function watchScreenOrientation({ orientation, document, mode }) {
  if (!orientation || !mode) return () => {};
  let active = true;
  const release = () => { try { orientation.unlock?.(); } catch { /* Unsupported browser. */ } };
  const apply = () => {
    if (!active || document.visibilityState === "hidden") return;
    try {
      if (typeof orientation.lock !== "function") return;
      Promise.resolve(orientation.lock(mode)).catch(() => {
        // Ordinary browser tabs may refuse locks outside fullscreen. Release a
        // previous script lock there, leaving rotation to the browser/system.
        if (active && mode === "any") release();
      });
    } catch { /* Orientation locking is optional in regular browser tabs. */ }
  };
  apply();
  document.addEventListener("fullscreenchange", apply);
  document.addEventListener("visibilitychange", apply);
  return () => {
    active = false;
    document.removeEventListener("fullscreenchange", apply);
    document.removeEventListener("visibilitychange", apply);
    // Restore the manifest/TWA default even when a wide tablet uses the desktop
    // layout after leaving the board and has no explicit portrait policy.
    if (mode === "any") release();
  };
}
