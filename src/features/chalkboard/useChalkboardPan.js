import React from "react";

// Touch scrolling remains native. A mouse or pen can also grab the surface in
// browse mode, including while an unpublished draft is present.
export default function useChalkboardPan(scrollRef, enabled) {
  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node || !enabled) return undefined;
    let drag = null;
    const start = event => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      // Leave the native scrollbar to the browser.
      const rect = node.getBoundingClientRect();
      if (event.clientY >= rect.top + node.clientHeight) return;
      event.preventDefault();
      drag = { id: event.pointerId, x: event.clientX, left: node.scrollLeft };
      node.setPointerCapture(event.pointerId);
    };
    const move = event => {
      if (drag?.id === event.pointerId) node.scrollLeft = drag.left + drag.x - event.clientX;
    };
    const stop = () => {
      const id = drag?.id;
      drag = null;
      if (id !== undefined && node.hasPointerCapture(id)) node.releasePointerCapture(id);
    };
    node.addEventListener("pointerdown", start);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", stop);
    node.addEventListener("pointercancel", stop);
    node.addEventListener("lostpointercapture", stop);
    return () => {
      node.removeEventListener("pointerdown", start);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", stop);
      node.removeEventListener("pointercancel", stop);
      node.removeEventListener("lostpointercapture", stop);
      stop();
    };
  }, [enabled, scrollRef]);
}
