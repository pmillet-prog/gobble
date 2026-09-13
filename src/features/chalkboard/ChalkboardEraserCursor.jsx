import React from "react";

// Pointer movement only updates this tiny overlay, without rerendering React
// or the textured board. Its diameter uses the same scale as the actual mask.
export default function ChalkboardEraserCursor({ canvasRef, viewportRef, enabled, size, scale }) {
  const cursorRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (enabled && cursorRef.current) cursorRef.current.style.visibility = "visible";
  }, [enabled, size]);
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const cursor = cursorRef.current;
    if (!canvas || !cursor || !enabled) return undefined;
    const move = event => {
      if (!event.isPrimary) return;
      const rect = (viewportRef?.current || canvas).getBoundingClientRect();
      cursor.style.left = `${event.clientX - rect.left}px`;
      cursor.style.top = `${event.clientY - rect.top}px`;
      cursor.style.visibility = "visible";
    };
    const hide = () => { cursor.style.visibility = "hidden"; };
    const up = event => { if (event.pointerType === "touch") hide(); };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", move);
    canvas.addEventListener("pointerleave", hide);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", hide);
    return () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", move);
      canvas.removeEventListener("pointerleave", hide);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", hide);
    };
  }, [canvasRef, viewportRef, enabled]);
  return enabled ? <div ref={cursorRef} className="chalkboard-eraser-cursor" aria-hidden="true" style={{ width: size * scale, height: size * scale }} /> : null;
}
