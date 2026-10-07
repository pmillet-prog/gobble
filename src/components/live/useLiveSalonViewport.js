import React from "react";
import useMobileViewportSurface from "../../features/layout/useMobileViewportSurface.js";
import { readMobileVisualViewportTop } from "../../features/layout/mobileGameViewport.js";
import { computeLiveSalonKeyboardViewport } from "./liveSalonViewport.js";

export default function useLiveSalonViewport(fullscreen) {
  const sceneRef = useMobileViewportSurface({ enabled: fullscreen, lockDocument: true });

  React.useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !fullscreen || !window.matchMedia("(pointer: coarse)").matches) return;
    const viewport = window.visualViewport;
    let frame = null;
    const update = () => {
      frame = null;
      const next = computeLiveSalonKeyboardViewport({
        surfaceHeight: scene.clientHeight,
        viewportHeight: viewport?.height || window.innerHeight,
        viewportWidth: viewport?.width || window.innerWidth,
        offsetTop: readMobileVisualViewportTop(window),
        offsetLeft: viewport?.offsetLeft,
      });
      scene.classList.toggle("live-salon-keyboard-open", next.keyboardVisible);
      scene.style.setProperty("--salon-composer-bottom", `${next.composerBottom}px`);
      scene.style.setProperty("--salon-composer-left", `${next.composerLeft}px`);
      scene.style.setProperty("--salon-composer-width", `${next.composerWidth}px`);
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(scene);
    update();
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
      scene.classList.remove("live-salon-keyboard-open");
      for (const name of ["bottom", "left", "width"]) {
        scene.style.removeProperty(`--salon-composer-${name}`);
      }
    };
  }, [fullscreen, sceneRef]);
  return sceneRef;
}
