import React from "react";
import { createPortal } from "react-dom";
import "./targetQuizBackdrop.css";

// A static veil keeps the surrounding game dim while preserving the actual
// interactive surfaces. Only layout/scroll changes require new measurements.
export default function TargetQuizBackdrop({ gridHost, sideHost }) {
  const maskId = React.useId();
  const [geometry, setGeometry] = React.useState(null);
  React.useLayoutEffect(() => {
    let frame = null;
    const nodes = [...new Set([gridHost, sideHost, ...document.querySelectorAll("[data-target-quiz-surface]")].filter(Boolean))];
    const measure = () => {
      frame = null;
      const rects = nodes.filter(node => node.getClientRects().length).map(node => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left - 1, y: rect.top - 1, width: rect.width + 2, height: rect.height + 2 };
      }).filter(rect => rect.width > 2 && rect.height > 2);
      setGeometry({ width: innerWidth, height: innerHeight, rects });
    };
    const refresh = () => { if (frame === null) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(refresh);
    nodes.forEach(node => observer.observe(node));
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, { capture: true, passive: true });
    measure();
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [gridHost, sideHost]);
  if (!geometry) return null;
  return createPortal(<svg className="target-quiz-backdrop" width={geometry.width} height={geometry.height} aria-hidden="true">
    <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={geometry.width} height={geometry.height} style={{ maskType: "luminance" }}>
      <rect width="100%" height="100%" fill="white" />
      {geometry.rects.map((rect, index) => <rect key={index} {...rect} rx="12" fill="black" />)}
    </mask></defs>
    <rect width="100%" height="100%" fill="#020511" fillOpacity=".6" mask={`url(#${maskId})`} />
  </svg>, document.body);
}
