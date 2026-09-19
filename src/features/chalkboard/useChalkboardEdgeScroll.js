import React from "react";
import { createChalkboardEdgeScroll } from "./chalkboardEdgeScroll.js";
import { getChalkboardPointer } from "./chalkboardCanvasWindow.js";

export default function useChalkboardEdgeScroll({ scrollRef, editor, scale, enabled }) {
  const latest = React.useRef(null);
  React.useLayoutEffect(() => { latest.current = { editor, scale, enabled }; });
  const controller = React.useMemo(() => createChalkboardEdgeScroll({
    getNode: () => scrollRef.current,
    isDragging: () => latest.current?.enabled && latest.current.editor.getActiveGesture() === "drag",
    onMove: pointer => {
      const node = scrollRef.current;
      const point = getChalkboardPointer(pointer, node.getBoundingClientRect(), node.scrollLeft, latest.current.scale, node.scrollTop);
      if (point) latest.current.editor.pointerMove(point);
    },
  }), [scrollRef]);
  React.useEffect(() => {
    if (!enabled) controller.stop();
  }, [controller, enabled]);
  React.useEffect(() => {
    const stop = () => controller.stop();
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      stop();
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [controller]);
  return controller;
}
