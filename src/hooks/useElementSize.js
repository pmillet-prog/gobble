import React from "react";

function readElementSize(node) {
  if (!(node instanceof HTMLElement)) return { width: 0, height: 0 };
  const rect = node.getBoundingClientRect();
  return {
    width: Math.max(0, rect.width || node.clientWidth || 0),
    height: Math.max(0, rect.height || node.clientHeight || 0),
  };
}

export default function useElementSize(enabled = true) {
  const [node, setNode] = React.useState(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useLayoutEffect(() => {
    if (!enabled || !(node instanceof HTMLElement)) {
      setSize((previous) =>
        previous.width === 0 && previous.height === 0
          ? previous
          : { width: 0, height: 0 }
      );
      return undefined;
    }

    let frameId = null;
    const commit = () => {
      frameId = null;
      const next = readElementSize(node);
      setSize((previous) =>
        Math.abs(previous.width - next.width) <= 0.5 &&
        Math.abs(previous.height - next.height) <= 0.5
          ? previous
          : next
      );
    };
    const schedule = () => {
      if (frameId != null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(commit);
    };

    schedule();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(node);
    window.addEventListener("resize", schedule);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      if (frameId != null) window.cancelAnimationFrame(frameId);
    };
  }, [enabled, node]);

  return [setNode, size];
}
