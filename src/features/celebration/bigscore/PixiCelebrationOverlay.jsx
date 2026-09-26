import React from "react";
import { useCelebrationSnapshot } from "../CelebrationRuntime.jsx";
import { celebrationItems } from "./celebrationPresentation.js";
import { createPixiCelebrationRenderer } from "./createPixiCelebrationRenderer.js";
import GameCelebrationDomOverlay from "../../../components/GameCelebrationDomOverlay.jsx";

export default function PixiCelebrationOverlay({ hostRef, phase, isMobileLayout, liteVisualEffects, fallback, onRendererReady }) {
  const snapshot = useCelebrationSnapshot();
  const controllerRef = React.useRef(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    createPixiCelebrationRenderer({ getHostRect: () => hostRef?.current?.getBoundingClientRect(),
      onFailure: () => { if (!cancelled) setFailed(true); } }).then(controller => {
      if (cancelled) { controller.destroy(); return; }
      controllerRef.current = controller;
      setReady(true);
      onRendererReady?.(controller);
    }).catch(error => {
      if (!cancelled) { console.warn("BigScore: CSS fallback", error); setFailed(true); }
    });
    return () => { cancelled = true; controllerRef.current?.destroy(); controllerRef.current = null; };
  }, [onRendererReady, hostRef]);
  React.useLayoutEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (failed) { controller.destroy(); controllerRef.current = null; return; }
    const rect = hostRef?.current?.getBoundingClientRect();
    controller.update(phase === "playing" && rect?.width > 0
      ? celebrationItems(snapshot, { isMobileLayout, liteVisualEffects }) : [], rect);
  }, [snapshot, phase, isMobileLayout, liteVisualEffects, hostRef, ready, failed]);
  // Invalid-word typography stays on its existing CSS path; this experiment targets BigScore images.
  return failed || !ready ? fallback : <GameCelebrationDomOverlay onlyInvalid
    hostRef={hostRef} phase={phase} isMobileLayout={isMobileLayout} liteVisualEffects={liteVisualEffects} />;
}
