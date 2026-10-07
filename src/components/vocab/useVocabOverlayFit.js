import { useLayoutEffect, useRef } from "react";

export default function useVocabOverlayFit(open) {
  const viewportRef = useRef(null);
  const panelRef = useRef(null);
  const scaleRef = useRef(1);

  useLayoutEffect(() => {
    if (!open) return;
    const viewport = viewportRef.current;
    const panel = panelRef.current;
    if (!viewport || !panel) return;
    const visualViewport = window.visualViewport;
    let frame = null;
    const writeStyle = (element, property, value) => {
      if (element.style[property] !== value) element.style[property] = value;
    };
    const fit = () => {
      frame = null;
      const width = visualViewport?.width || window.innerWidth;
      const height = visualViewport?.height || window.innerHeight;
      // Read the natural panel size before any viewport write. ResizeObserver
      // schedules another fit if a viewport resize changes the text wrapping.
      const panelWidth = panel.offsetWidth;
      const panelHeight = panel.offsetHeight;
      const viewportStyles = {
        left: `${visualViewport?.offsetLeft || 0}px`,
        top: `${visualViewport?.offsetTop || 0}px`,
        width: `${width}px`,
        height: `${height}px`,
      };
      const scale = Math.min(1, Math.max(1, width - 32) / Math.max(1, panelWidth),
        Math.max(1, height - 32) / Math.max(1, panelHeight));
      scaleRef.current = scale;
      for (const [property, value] of Object.entries(viewportStyles)) {
        writeStyle(viewport, property, value);
      }
      writeStyle(panel, "transform", `scale(${scale})`);
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(fit);
    };
    fit();
    const observer = new ResizeObserver(schedule);
    observer.observe(panel);
    window.addEventListener("resize", schedule);
    visualViewport?.addEventListener("resize", schedule);
    visualViewport?.addEventListener("scroll", schedule);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      visualViewport?.removeEventListener("resize", schedule);
      visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [open]);

  return { viewportRef, panelRef, scaleRef };
}
