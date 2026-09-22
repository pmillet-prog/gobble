import React from "react";

// Mouse-only panning: touch scrolling and native form controls keep their behavior.
export default function useAvatarDragScroll(axis) {
  const gesture = React.useRef(null);
  const suppressClick = React.useRef(false);
  const horizontal = axis === "x";
  const finish = event => {
    if (gesture.current?.id !== event.pointerId) return;
    gesture.current = null;
    delete event.currentTarget.dataset.dragScrolling;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    onPointerDown(event) {
      suppressClick.current = false;
      if (event.pointerType !== "mouse" || event.button !== 0 || event.target.closest("input, select, textarea, label, [contenteditable]")) return;
      const node = event.currentTarget;
      if (horizontal ? node.scrollWidth <= node.clientWidth : node.scrollHeight <= node.clientHeight) return;
      // Leave the native scrollbar available for dragging its thumb.
      const rect = node.getBoundingClientRect();
      if (event.clientX - rect.left >= node.clientWidth || event.clientY - rect.top >= node.clientHeight) return;
      gesture.current = { id: event.pointerId, start: horizontal ? event.clientX : event.clientY,
        scroll: horizontal ? node.scrollLeft : node.scrollTop, dragging: false };
    },
    onPointerMove(event) {
      const drag = gesture.current;
      if (drag?.id !== event.pointerId) return;
      if (!(event.buttons & 1)) { finish(event); return; }
      const distance = (horizontal ? event.clientX : event.clientY) - drag.start;
      if (!drag.dragging && Math.abs(distance) < 6) return;
      if (!drag.dragging) {
        drag.dragging = true;
        suppressClick.current = true;
        event.currentTarget.dataset.dragScrolling = "true";
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      event.currentTarget[horizontal ? "scrollLeft" : "scrollTop"] = drag.scroll - distance;
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onPointerLeave(event) { if (!gesture.current?.dragging) finish(event); },
    onClickCapture(event) {
      if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
    },
    onDragStart(event) { if (gesture.current) event.preventDefault(); },
  };
}
