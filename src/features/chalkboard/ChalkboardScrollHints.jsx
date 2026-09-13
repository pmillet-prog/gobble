import React from "react";

export default function ChalkboardScrollHints({ scrollRef, enabled, viewport, worldWidth }) {
  const [discovered, setDiscovered] = React.useState(false);
  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node || discovered || !enabled) return undefined;
    let intentUntil = 0;
    let origin = node.scrollLeft;
    const intent = () => {
      if (performance.now() >= intentUntil) origin = node.scrollLeft;
      intentUntil = performance.now() + 1500;
    };
    const startDrag = () => { origin = node.scrollLeft; intentUntil = Infinity; };
    const endDrag = () => { intentUntil = performance.now() + 1500; };
    const scrolled = () => {
      if (performance.now() < intentUntil && Math.abs(node.scrollLeft - origin) > 12) setDiscovered(true);
    };
    node.addEventListener("wheel", intent, { passive: true, capture: true });
    node.addEventListener("pointerdown", startDrag, true);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    node.addEventListener("keydown", intent);
    node.addEventListener("scroll", scrolled, { passive: true });
    return () => {
      node.removeEventListener("wheel", intent, true);
      node.removeEventListener("pointerdown", startDrag, true);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      node.removeEventListener("keydown", intent);
      node.removeEventListener("scroll", scrolled);
    };
  }, [scrollRef, discovered, enabled]);
  if (discovered || !enabled || worldWidth <= viewport.width + 2) return null;
  return <div className="chalkboard-scroll-hints" aria-hidden="true">
    {viewport.scrollLeft > 2 && <span className="chalkboard-scroll-hint is-left">‹</span>}
    {viewport.scrollLeft < worldWidth - viewport.width - 2 && <span className="chalkboard-scroll-hint is-right">›</span>}
  </div>;
}
