import React from "react";

// Remember the real target row before it makes room for the quiz. No animation
// loop or React updates: the destination uses one Web Animations transform.
export default function useTargetQuizTargetSource(active) {
  const cleanupRef = React.useRef(null);
  const nodeRef = React.useRef(null);
  const observe = React.useCallback(node => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node || active) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width && rect.height) node.dataset.targetQuizOrigin = JSON.stringify({
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    cleanupRef.current = () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [active]);
  const ref = React.useCallback(node => { nodeRef.current = node; observe(node); }, [observe]);
  React.useLayoutEffect(() => {
    observe(nodeRef.current);
    return () => cleanupRef.current?.();
  }, [observe]);
  return ref;
}
