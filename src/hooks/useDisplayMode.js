import { useCallback, useEffect, useState } from "react";
import {
  exitDocumentFullscreen,
  getDisplayModeSnapshot,
  requestDocumentFullscreen,
} from "../utils/displayMode.js";

export default function useDisplayMode() {
  const [snapshot, setSnapshot] = useState(() => getDisplayModeSnapshot());

  const refresh = useCallback(() => {
    setSnapshot((previous) => {
      const next = getDisplayModeSnapshot();
      return Object.keys(next).every((key) => next[key] === previous[key]) ? previous : next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;
    const standaloneQuery = window.matchMedia?.("(display-mode: standalone)");
    const fullscreenQuery = window.matchMedia?.("(display-mode: fullscreen)");
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    document.addEventListener("fullscreenchange", refresh);
    document.addEventListener("webkitfullscreenchange", refresh);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("appinstalled", refresh);
    window.addEventListener("focus", refresh);
    standaloneQuery?.addEventListener?.("change", refresh);
    fullscreenQuery?.addEventListener?.("change", refresh);
    return () => {
      document.removeEventListener("fullscreenchange", refresh);
      document.removeEventListener("webkitfullscreenchange", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("appinstalled", refresh);
      window.removeEventListener("focus", refresh);
      standaloneQuery?.removeEventListener?.("change", refresh);
      fullscreenQuery?.removeEventListener?.("change", refresh);
    };
  }, [refresh]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (snapshot.isFullscreen) {
        await exitDocumentFullscreen();
      } else {
        await requestDocumentFullscreen();
      }
      refresh();
      return true;
    } catch (_) {
      refresh();
      return false;
    }
  }, [refresh, snapshot.isFullscreen]);

  return {
    ...snapshot,
    refresh,
    toggleFullscreen,
  };
}
