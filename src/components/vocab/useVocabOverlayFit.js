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
    const fit = () => {
      frame = null;
      const width = visualViewport?.width || window.innerWidth;
      const height = visualViewport?.height || window.innerHeight;
      Object.assign(viewport.style, {
        left: `${visualViewport?.offsetLeft || 0}px`,
        top: `${visualViewport?.offsetTop || 0}px`,
        width: `${width}px`,
        height: `${height}px`,
      });
      const scale = Math.min(1, Math.max(1, width - 32) / panel.offsetWidth,
        Math.max(1, height - 32) / panel.offsetHeight);
      scaleRef.current = scale;
      panel.style.transform = `scale(${scale})`;
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
