import React from "react";
import { CHALKBOARD_WORLD } from "./chalkboardModel.js";
import { chalkboardScale, resizeChalkboardViewport } from "./chalkboardViewport.js";

export default function useChalkboardViewport(scrollRef) {
  const [viewport, setViewport] = React.useState({ width: 1, height: 1, scrollLeft: 0, scrollTop: 0 });
  const frameRef = React.useRef(0);
  const scale = chalkboardScale(viewport);

  React.useLayoutEffect(() => {
    const node = scrollRef.current;
    const updateSize = () => {
      const width = Math.max(1, node.clientWidth), height = Math.max(1, node.clientHeight);
      setViewport(current => current.width === width && current.height === height ? current : resizeChalkboardViewport(
        { ...current, scrollLeft: node.scrollLeft, scrollTop: node.scrollTop }, { width, height }));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [scrollRef]);

  React.useLayoutEffect(() => {
    // React has now resized the world, so native scroll limits are up to date.
    scrollRef.current.scrollLeft = viewport.scrollLeft;
    scrollRef.current.scrollTop = viewport.scrollTop;
  }, [scrollRef, viewport.width, viewport.height]);

  React.useEffect(() => () => cancelAnimationFrame(frameRef.current), []);
  const onScroll = React.useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const node = scrollRef.current;
      if (!node) return;
      setViewport(current => current.scrollLeft === node.scrollLeft && current.scrollTop === node.scrollTop
        ? current : { ...current, scrollLeft: node.scrollLeft, scrollTop: node.scrollTop });
    });
  }, [scrollRef]);

  return { viewport: { ...viewport, scale }, scale, onScroll,
    worldWidth: CHALKBOARD_WORLD.width * scale, worldHeight: CHALKBOARD_WORLD.height * scale };
}
