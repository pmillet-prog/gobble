import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

export function buildSwipeTrackTransform(index, offsetPx = 0) {
  const safeIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
  const safeOffset = Number.isFinite(Number(offsetPx)) ? Number(offsetPx) : 0;
  return `translate3d(calc(${safeIndex * -100}% + ${safeOffset}px), 0, 0)`;
}

export default function useSwipeTrackController(activeIndex = 0) {
  const trackRef = useRef(null);
  const frameRef = useRef(null);
  const pendingRef = useRef({ index: activeIndex, offsetPx: 0 });

  const cancelPendingFrame = useCallback(() => {
    if (frameRef.current == null || typeof cancelAnimationFrame !== "function") return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const applyPendingTransform = useCallback(() => {
    frameRef.current = null;
    const track = trackRef.current;
    if (!track) return;
    const { index, offsetPx } = pendingRef.current;
      track.style.transform = buildSwipeTrackTransform(index, offsetPx);
  }, []);

  const begin = useCallback(
    (index = activeIndex) => {
      cancelPendingFrame();
      pendingRef.current = { index, offsetPx: 0 };
      const track = trackRef.current;
      if (!track) return;
      track.style.transition = "none";
      track.style.willChange = "transform";
      track.style.transform = buildSwipeTrackTransform(index, 0);
    },
    [activeIndex, cancelPendingFrame]
  );

  const move = useCallback(
    (offsetPx, index = activeIndex) => {
      pendingRef.current = { index, offsetPx };
      if (frameRef.current != null) return;
      if (typeof requestAnimationFrame !== "function") {
        applyPendingTransform();
        return;
      }
      frameRef.current = requestAnimationFrame(applyPendingTransform);
    },
    [activeIndex, applyPendingTransform]
  );

  const settle = useCallback(
    (index = activeIndex) => {
      cancelPendingFrame();
      pendingRef.current = { index, offsetPx: 0 };
      const track = trackRef.current;
      if (!track) return;
      track.style.transition = "transform 0.25s ease-out";
      track.style.transform = buildSwipeTrackTransform(index, 0);
      track.style.willChange = "auto";
    },
    [activeIndex, cancelPendingFrame]
  );

  useLayoutEffect(() => {
    settle(activeIndex);
  }, [activeIndex, settle]);

  useEffect(
    () => () => {
      cancelPendingFrame();
    },
    [cancelPendingFrame]
  );

  return { begin, move, settle, trackRef };
}
