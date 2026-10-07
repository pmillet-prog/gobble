import React from "react";
import { createPortal } from "react-dom";
import { drawTargetQuizLighting } from "./targetQuizLighting.js";
import "./targetQuizLighting.css";

const INTRO_DURATION_MS = 2000;

// One short canvas animation on entry. Geometry is measured only when the
// layout changes; animation frames never update React or the quiz controller.
function TargetQuizLightingIntro({ active, sessionKey, questionToken, stageRef, cardsRef, feedbackRef, onIntroStart }) {
  const canvasRef = React.useRef(null);
  const playedSessionRef = React.useRef(null);
  const refreshGeometryRef = React.useRef(null);
  const onIntroStartRef = React.useRef(onIntroStart);
  onIntroStartRef.current = onIntroStart;

  React.useLayoutEffect(() => {
    if (!active || playedSessionRef.current === sessionKey || document.hidden) return undefined;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!context) return undefined;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) {
      const frame = requestAnimationFrame(() => {
        playedSessionRef.current = sessionKey;
        canvas.dataset.state = "finished";
        onIntroStartRef.current?.();
      });
      return () => cancelAnimationFrame(frame);
    }

    let frame = null;
    let startedAt = null;
    let stopped = false;
    let geometryDirty = true;
    let geometry = null;
    let lastProgressStep = -1;
    const observer = new ResizeObserver(() => { geometryDirty = true; });
    const refreshGeometry = () => {
      geometryDirty = true;
      observer.disconnect();
      for (const node of [stageRef.current, cardsRef.current, feedbackRef.current]) {
        if (node) observer.observe(node);
      }
    };
    refreshGeometryRef.current = refreshGeometry;
    refreshGeometry();
    const markGeometryDirty = () => { geometryDirty = true; };

    const measure = () => {
      const presenterRect = stageRef.current?.getBoundingClientRect();
      if (!presenterRect?.width || !presenterRect?.height) return null;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      const pixelWidth = Math.round(width * scale);
      const pixelHeight = Math.round(height * scale);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(scale, 0, 0, scale, 0, 0);
      const protectedRects = [cardsRef.current, feedbackRef.current].filter(Boolean).map(node => {
        const rect = node.getBoundingClientRect();
        // Include the blue outlines and their glow, not only the text.
        return { x: rect.left - 6, y: rect.top - 4, width: rect.width + 12, height: rect.height + 8 };
      });
      return { width, height, presenterRect, protectedRects };
    };

    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      observer.disconnect();
      window.removeEventListener("resize", markGeometryDirty);
      window.removeEventListener("scroll", markGeometryDirty, true);
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
      refreshGeometryRef.current = null;
      canvas.hidden = true;
      canvas.dataset.state = "finished";
      canvas.dataset.progress = "1";
      // Release the viewport-sized backing buffer after the two-second intro.
      canvas.width = 1;
      canvas.height = 1;
    };
    const onVisibility = () => { if (document.hidden) stop(); };
    const onMotion = () => { if (motion.matches) stop(); };
    const tick = (time) => {
      if (stopped) return;
      frame = null;
      if (geometryDirty) {
        geometry = measure();
        geometryDirty = false;
      }
      if (!geometry) { stop(); return; }
      if (startedAt === null) {
        startedAt = time;
        onIntroStartRef.current?.();
      }
      const progress = Math.min(1, (time - startedAt) / INTRO_DURATION_MS);
      if (progress >= 1) { stop(); return; }
      drawTargetQuizLighting(context, { ...geometry, progress });
      playedSessionRef.current = sessionKey;
      canvas.hidden = false;
      canvas.dataset.state = "running";
      const step = Math.floor(progress * 20);
      if (step !== lastProgressStep) {
        lastProgressStep = step;
        canvas.dataset.progress = String(step / 20);
      }
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("resize", markGeometryDirty);
    window.addEventListener("scroll", markGeometryDirty, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onMotion);
    frame = requestAnimationFrame(tick);
    return stop;
  }, [active, sessionKey, stageRef, cardsRef, feedbackRef]);

  React.useLayoutEffect(() => {
    refreshGeometryRef.current?.();
  }, [questionToken]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <canvas ref={canvasRef} className="target-quiz-lighting" width="1" height="1" hidden aria-hidden="true"
      data-state="waiting" data-progress="0" data-projector-count="4" />,
    document.body
  );
}

export default React.memo(TargetQuizLightingIntro);
