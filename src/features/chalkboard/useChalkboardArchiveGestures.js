import React from "react";
import { constrainArchiveView, fitArchiveView, moveArchiveGesture, zoomArchiveAt } from "./chalkboardArchiveView.js";

// The decoded PNG is transformed by the compositor. Gesture frames never
// rebuild React, paint chalk, allocate canvases or fetch board contributions.
export default function useChalkboardArchiveGestures({ viewportRef, imageRef, zoomRef, ready }) {
  const actions = React.useRef({});
  React.useLayoutEffect(() => {
    const node = viewportRef.current, image = imageRef.current;
    if (!ready || !node || !image) return;
    const pointers = new Map();
    let size, view, paintFrame = 0, inertiaFrame = 0, lastMove = 0, lastTap = null, tap = null;
    let velocity = { x: 0, y: 0 };
    const paint = () => {
      paintFrame = 0;
      image.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
      if (zoomRef.current) zoomRef.current.textContent = `${Math.round(view.scale * 100)} %`;
    };
    const update = next => {
      view = next;
      if (!paintFrame) paintFrame = requestAnimationFrame(paint);
    };
    const stopInertia = () => { cancelAnimationFrame(inertiaFrame); inertiaFrame = 0; };
    const cancel = () => {
      stopInertia();
      const ids = [...pointers.keys()];
      pointers.clear();
      for (const id of ids) if (node.hasPointerCapture(id)) node.releasePointerCapture(id);
      tap = null;
      node.classList.remove("is-dragging");
    };
    const resize = () => {
      cancel();
      const previous = size;
      size = { width: Math.max(1, node.clientWidth), height: Math.max(1, node.clientHeight), imageWidth: image.naturalWidth, imageHeight: image.naturalHeight };
      update(view && previous ? constrainArchiveView({ ...view, x: view.x + (size.width - previous.width) / 2, y: view.y + (size.height - previous.height) / 2 }, size) : fitArchiveView(size));
    };
    const point = event => {
      const rect = node.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const zoom = (factor, at = { x: size.width / 2, y: size.height / 2 }) => {
      stopInertia();
      update(zoomArchiveAt(view, view.scale * factor, at, size));
    };
    const doubleZoom = at => {
      const readingScale = size.height / size.imageHeight;
      zoom((view.scale > readingScale * 1.5 ? readingScale : Math.max(readingScale, view.scale * 2)) / view.scale, at);
    };
    const down = event => {
      if (event.button !== 0 || pointers.size >= 2) return;
      event.preventDefault();
      stopInertia();
      node.focus({ preventScroll: true });
      pointers.set(event.pointerId, point(event));
      node.setPointerCapture(event.pointerId);
      tap = pointers.size === 1 ? { ...point(event), time: event.timeStamp, touch: event.pointerType === "touch" } : null;
      velocity = { x: 0, y: 0 };
      lastMove = event.timeStamp;
      node.classList.add("is-dragging");
    };
    const move = event => {
      if (!pointers.has(event.pointerId)) return;
      event.preventDefault();
      const before = [...pointers.values()], p = point(event);
      pointers.set(event.pointerId, p);
      const next = moveArchiveGesture(view, before, [...pointers.values()], size);
      const dt = Math.max(8, event.timeStamp - lastMove);
      velocity = pointers.size === 1 ? { x: (next.x - view.x) / dt, y: (next.y - view.y) / dt } : { x: 0, y: 0 };
      lastMove = event.timeStamp;
      if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > 8) tap = null;
      update(next);
    };
    const coast = () => {
      let previous = performance.now();
      const tick = now => {
        const dt = Math.min(32, now - previous);
        previous = now;
        const next = constrainArchiveView({ ...view, x: view.x + velocity.x * dt, y: view.y + velocity.y * dt }, size);
        const decay = Math.exp(-dt / 180);
        velocity = { x: next.x === view.x ? 0 : velocity.x * decay, y: next.y === view.y ? 0 : velocity.y * decay };
        update(next);
        inertiaFrame = Math.hypot(velocity.x, velocity.y) > 0.015 ? requestAnimationFrame(tick) : 0;
      };
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) inertiaFrame = requestAnimationFrame(tick);
    };
    const up = event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
      if (pointers.size) { tap = null; velocity = { x: 0, y: 0 }; return; }
      node.classList.remove("is-dragging");
      if (tap?.touch && event.timeStamp - tap.time < 260) {
        if (lastTap && event.timeStamp - lastTap.time < 350 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 30) {
          doubleZoom(point(event));
          lastTap = null;
        } else lastTap = { ...tap, time: event.timeStamp };
      } else if (event.timeStamp - lastMove < 80) coast();
      tap = null;
    };
    const lost = event => { if (pointers.has(event.pointerId)) cancel(); };
    const wheel = event => {
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
      zoom(Math.exp(-Math.max(-160, Math.min(160, delta)) * 0.004), point(event));
    };
    const doubleClick = event => { event.preventDefault(); doubleZoom(point(event)); };
    const key = event => {
      if (event.key === "+" || event.key === "=") zoom(1.4);
      else if (event.key === "-") zoom(1 / 1.4);
      else if (event.key === "Home" || event.key === "0") { stopInertia(); update(fitArchiveView(size, true)); }
      else if (event.key.startsWith("Arrow")) {
        stopInertia();
        update(constrainArchiveView({ ...view, x: view.x + (event.key === "ArrowLeft" ? 100 : event.key === "ArrowRight" ? -100 : 0), y: view.y + (event.key === "ArrowUp" ? 100 : event.key === "ArrowDown" ? -100 : 0) }, size));
      } else return;
      event.preventDefault();
    };
    actions.current = { zoom, fit: overview => { stopInertia(); update(fitArchiveView(size, overview)); } };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    const listeners = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancel, lostpointercapture: lost, wheel, dblclick: doubleClick, keydown: key };
    for (const [name, handler] of Object.entries(listeners)) node.addEventListener(name, handler, { passive: false });
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", cancel);
    return () => {
      for (const [name, handler] of Object.entries(listeners)) node.removeEventListener(name, handler);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", cancel);
      observer.disconnect();
      cancel();
      cancelAnimationFrame(paintFrame);
      actions.current = {};
    };
  }, [ready, viewportRef, imageRef, zoomRef]);
  return actions;
}
