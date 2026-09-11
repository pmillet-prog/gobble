import React from "react";

export default function useStatsViewport() {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const viewport = window.visualViewport;
    let frame = null;
    const update = () => {
      frame = null;
      if (!ref.current) return;
      Object.assign(ref.current.style, {
        left: `${viewport?.offsetLeft || 0}px`,
        top: `${viewport?.offsetTop || 0}px`,
        width: `${viewport?.width || window.innerWidth}px`,
        height: `${viewport?.height || window.innerHeight}px`,
      });
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
    };
  }, []);
  return ref;
}
