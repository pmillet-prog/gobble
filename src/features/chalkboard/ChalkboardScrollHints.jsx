import React from "react";

export default function ChalkboardScrollHints({ scrollRef, enabled, viewport, worldWidth, unreadLeft = false, unreadRight = false }) {
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
  if (!enabled || worldWidth <= viewport.width + 2) return null;
  const showLeft = viewport.scrollLeft > 2 && (!discovered || unreadLeft);
  const showRight = viewport.scrollLeft < worldWidth - viewport.width - 2 && (!discovered || unreadRight);
  if (!showLeft && !showRight) return null;
  return <div className="chalkboard-scroll-hints">
    {(unreadLeft || unreadRight) && <span className="chalkboard-unread-status" role="status">
      {unreadLeft && unreadRight ? "Nouvelles contributions à gauche et à droite" : unreadLeft ? "Nouvelles contributions à gauche" : "Nouvelles contributions à droite"}
    </span>}
    {showLeft && <span className={`chalkboard-scroll-hint is-left${unreadLeft ? " has-unread" : ""}`} aria-hidden="true">‹
      {unreadLeft && <span className="chalkboard-scroll-unread">!</span>}
    </span>}
    {showRight && <span className={`chalkboard-scroll-hint is-right${unreadRight ? " has-unread" : ""}`} aria-hidden="true">›
      {unreadRight && <span className="chalkboard-scroll-unread">!</span>}
    </span>}
  </div>;
}
