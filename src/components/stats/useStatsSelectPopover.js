import React from "react";

// Attach beside the binder, inside its dialog but outside the scrolling sheet.
// Only an open menu owns document listeners; none survive closing/unmounting.
export default function useStatsSelectPopover({ open, count, triggerRef, menuRef, close }) {
  const [position, setPosition] = React.useState(null);
  React.useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    const trigger = triggerRef.current;
    if (!trigger) return;
    const host = trigger.closest(".stats-overlay") || document.body;
    const place = () => {
      const anchor = trigger.getBoundingClientRect();
      const bounds = host === document.body ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : host.getBoundingClientRect();
      const width = Math.min(Math.max(anchor.width, 240), bounds.width - 24);
      const left = Math.max(12, Math.min(anchor.left - bounds.left, bounds.width - width - 12));
      const below = bounds.height - (anchor.bottom - bounds.top) - 16;
      const above = anchor.top - bounds.top - 16;
      const upwards = below < Math.min(260, count * 42 + 12) && above > below;
      const maxHeight = Math.max(40, Math.min(360, upwards ? above : below));
      setPosition({ host, style: { position: host === document.body ? "fixed" : "absolute", left, width, maxHeight,
        ...(upwards ? { bottom: bounds.height - (anchor.top - bounds.top) + 5 } : { top: anchor.bottom - bounds.top + 5 }) } });
    };
    const inside = target => trigger.contains(target) || menuRef.current?.contains(target);
    const dismissOutside = event => { if (!inside(event.target)) close(); };
    const dismissScroll = event => { if (!menuRef.current?.contains(event.target)) close(); };
    place();
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("scroll", dismissScroll, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("scroll", dismissScroll, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [open, count, triggerRef, menuRef, close]);
  return open ? position : null;
}
