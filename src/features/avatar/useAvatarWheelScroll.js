import React from "react";

// Bind directly to the category strip so preventDefault is supported without a
// document-wide listener. The callback ref also handles conditional mounting.
export default function useAvatarWheelScroll() {
  const detach = React.useRef(null);
  return React.useCallback(node => {
    detach.current?.();
    detach.current = null;
    if (!node) return;
    const onWheel = event => {
      if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey || event.shiftKey
        || !event.deltaY || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const maximum = node.scrollWidth - node.clientWidth;
      if (maximum <= 0) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientWidth : 1;
      const next = Math.max(0, Math.min(maximum, node.scrollLeft + event.deltaY * unit));
      if (next === node.scrollLeft) return;
      node.scrollLeft = next;
      event.preventDefault();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    detach.current = () => node.removeEventListener("wheel", onWheel);
  }, []);
}
