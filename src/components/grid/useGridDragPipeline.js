import React from "react";

export default function useGridDragPipeline({
  draggingRef,
  getNow,
  getTileIndexFromPoint,
  onCounter,
  onEvent,
  onTileEnter,
}) {
  const frameRef = React.useRef(null);
  const pendingPointRef = React.useRef(null);
  const lastTouchMoveSampleRef = React.useRef({ x: null, y: null, at: 0 });

  const reset = React.useCallback(() => {
    if (frameRef.current != null) onEvent?.("drag-raf-cancelled");
    if (frameRef.current != null && typeof window !== "undefined") {
      window.cancelAnimationFrame(frameRef.current);
    }
    if (pendingPointRef.current) onEvent?.("drag-pending-cleared");
    frameRef.current = null;
    pendingPointRef.current = null;
    lastTouchMoveSampleRef.current = { x: null, y: null, at: 0 };
  }, [onEvent]);

  const processPoint = React.useCallback(
    (pending) => {
      const index = getTileIndexFromPoint(
        pending.clientX,
        pending.clientY,
        pending.useTolerance
      );
      if (index == null) {
        onCounter?.("tileHitMiss");
        return false;
      }
      onTileEnter?.(index, pending);
      return true;
    },
    [getTileIndexFromPoint, onCounter, onTileEnter]
  );

  const queue = React.useCallback(
    (clientX, clientY, useTolerance) => {
      if (!draggingRef?.current) return;
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
      onCounter?.("queueDragMove");
      pendingPointRef.current = {
        clientX,
        clientY,
        useTolerance,
        queuedAt: getNow(),
      };
      if (frameRef.current != null) {
        onCounter?.("queueDragCoalesced");
        return;
      }
      frameRef.current = window.requestAnimationFrame(() => {
        onCounter?.("rafFired");
        frameRef.current = null;
        if (!draggingRef.current) {
          onCounter?.("rafNotDragging");
          return;
        }
        const pending = pendingPointRef.current;
        pendingPointRef.current = null;
        if (!pending) {
          onCounter?.("rafNoPending");
          return;
        }
        const lagMs = Math.round(getNow() - (pending.queuedAt || 0));
        if (lagMs >= 100) {
          onCounter?.("rafLagged");
          onEvent?.("drag-raf-lag", { lagMs, drag: true });
        }
        processPoint(pending);
      });
    },
    [draggingRef, getNow, onCounter, onEvent, processPoint]
  );

  const flush = React.useCallback(() => {
    if (frameRef.current != null && typeof window !== "undefined") {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const pending = pendingPointRef.current;
    pendingPointRef.current = null;
    return pending ? processPoint(pending) : false;
  }, [processPoint]);

  return {
    dragMoveRafRef: frameRef,
    dragPendingPointRef: pendingPointRef,
    flushPendingDragMove: flush,
    lastTouchMoveSampleRef,
    queueDragMove: queue,
    resetDragMovePipeline: reset,
  };
}
