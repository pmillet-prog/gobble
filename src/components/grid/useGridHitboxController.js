import React from "react";

function normalizeRotationTurns(turns) {
  if (!Number.isFinite(turns)) return 0;
  const mod = turns % 4;
  return mod < 0 ? mod + 4 : mod;
}

export function rotateIndexByTurns(index, size, turns) {
  if (!Number.isInteger(index) || !Number.isInteger(size) || size <= 0) return index;
  const rotation = normalizeRotationTurns(turns);
  if (rotation === 0) return index;
  const row = Math.floor(index / size);
  const col = index % size;
  if (rotation === 1) return col * size + (size - 1 - row);
  if (rotation === 2) return (size - 1 - row) * size + (size - 1 - col);
  return (size - 1 - col) * size + row;
}

export function mapDisplayToBoardIndex(displayIndex, size, turns) {
  return rotateIndexByTurns(displayIndex, size, (4 - normalizeRotationTurns(turns)) % 4);
}

export function resolveGridAxisIndex(pos, start, cellSize, gapSize, count, useTolerance = true) {
  if (
    !Number.isFinite(pos) ||
    !Number.isFinite(start) ||
    !Number.isFinite(cellSize) ||
    !Number.isFinite(gapSize) ||
    !Number.isFinite(count) ||
    count <= 0 ||
    cellSize <= 0
  ) {
    return null;
  }

  const gap = Math.max(0, gapSize);
  const stride = cellSize + gap;
  const fullSize = cellSize * count + gap * (count - 1);
  let relative = pos - start;
  const edgeTolerance = Math.max(4, cellSize * 0.35);

  if (relative < 0) {
    if (!useTolerance || Math.abs(relative) > edgeTolerance) return null;
    relative = 0;
  } else if (relative > fullSize) {
    if (!useTolerance || Math.abs(relative - fullSize) > edgeTolerance) return null;
    relative = Math.max(0, fullSize - 0.0001);
  }

  let axis = Math.floor(relative / stride);
  axis = Math.max(0, Math.min(count - 1, axis));
  const inStride = relative - axis * stride;
  if (inStride <= cellSize) return axis;
  if (!useTolerance || gap <= 0) return null;

  const inGap = inStride - cellSize;
  const gapTolerance = Math.max(2, Math.min(cellSize * 0.4, Math.max(gap * 0.5, 6)));
  if (inGap <= gapTolerance) return axis;
  if (inGap >= gap - gapTolerance) return Math.min(count - 1, axis + 1);
  return null;
}

export default function useGridHitboxController({
  activeMetricsRef,
  board,
  gridRef,
  gridRotationTurns,
  gridSize,
  isDraggingRef,
  isMobileLayout,
  isUltraCompact,
  phase,
}) {
  const metricsRef = React.useRef(null);

  const clear = React.useCallback(() => {
    metricsRef.current = null;
    if (activeMetricsRef) activeMetricsRef.current = null;
  }, [activeMetricsRef]);

  const build = React.useCallback(() => {
    const gridElement = gridRef?.current;
    if (!(gridElement instanceof HTMLElement)) return null;
    const rect = gridElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const style = window.getComputedStyle(gridElement);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderRight = parseFloat(style.borderRightWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderBottom = parseFloat(style.borderBottomWidth) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const contentWidth = Math.max(
      0,
      rect.width - borderLeft - borderRight - paddingLeft - paddingRight
    );
    const contentHeight = Math.max(
      0,
      rect.height - borderTop - borderBottom - paddingTop - paddingBottom
    );
    const colGap = Number.isFinite(parseFloat(style.columnGap))
      ? parseFloat(style.columnGap)
      : isMobileLayout
      ? 4
      : 0;
    const rowGap = Number.isFinite(parseFloat(style.rowGap))
      ? parseFloat(style.rowGap)
      : isMobileLayout
      ? 4
      : 0;
    const size = Math.max(1, Number(gridSize) || 1);
    const cellWidth = (contentWidth - colGap * (size - 1)) / size;
    const cellHeight = (contentHeight - rowGap * (size - 1)) / size;
    if (cellWidth <= 0 || cellHeight <= 0) return null;

    const metrics = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      size,
      contentLeft: rect.left + borderLeft + paddingLeft,
      contentTop: rect.top + borderTop + paddingTop,
      colGap,
      rowGap,
      cellWidth,
      cellHeight,
    };
    metricsRef.current = metrics;
    return metrics;
  }, [gridRef, gridSize, isMobileLayout]);

  const getMetrics = React.useCallback(() => {
    const cached = metricsRef.current;
    const gridElement = gridRef?.current;
    if (!cached || !(gridElement instanceof HTMLElement)) return build();
    const rect = gridElement.getBoundingClientRect();
    const size = Math.max(1, Number(gridSize) || 1);
    const stale =
      cached.size !== size ||
      Math.abs(rect.left - cached.left) > 0.5 ||
      Math.abs(rect.top - cached.top) > 0.5 ||
      Math.abs(rect.width - cached.width) > 0.5 ||
      Math.abs(rect.height - cached.height) > 0.5;
    return stale ? build() : cached;
  }, [build, gridRef, gridSize]);

  const readActiveMetrics = React.useCallback(
    () => (isDraggingRef?.current && activeMetricsRef?.current ? activeMetricsRef.current : getMetrics()),
    [activeMetricsRef, getMetrics, isDraggingRef]
  );

  const getTileIndexFromPoint = React.useCallback(
    (x, y, useTolerance = true) => {
      const metrics = readActiveMetrics();
      if (!metrics) return null;
      const col = resolveGridAxisIndex(
        x,
        metrics.contentLeft,
        metrics.cellWidth,
        metrics.colGap,
        metrics.size,
        useTolerance
      );
      const row = resolveGridAxisIndex(
        y,
        metrics.contentTop,
        metrics.cellHeight,
        metrics.rowGap,
        metrics.size,
        useTolerance
      );
      if (row == null || col == null) return null;
      const displayIndex = row * metrics.size + col;
      if (displayIndex < 0 || displayIndex >= metrics.size * metrics.size) return null;
      return mapDisplayToBoardIndex(displayIndex, metrics.size, gridRotationTurns);
    },
    [gridRotationTurns, readActiveMetrics]
  );

  const getTileGeometryByBoardIndex = React.useCallback(
    (index) => {
      const metrics = readActiveMetrics();
      if (!metrics) return null;
      if (!Number.isInteger(index) || index < 0 || index >= metrics.size * metrics.size) {
        return null;
      }
      const displayIndex = rotateIndexByTurns(index, metrics.size, gridRotationTurns);
      const row = Math.floor(displayIndex / metrics.size);
      const col = displayIndex % metrics.size;
      const left = metrics.contentLeft + col * (metrics.cellWidth + metrics.colGap);
      const top = metrics.contentTop + row * (metrics.cellHeight + metrics.rowGap);
      return {
        left,
        top,
        width: metrics.cellWidth,
        height: metrics.cellHeight,
        cx: left + metrics.cellWidth / 2,
        cy: top + metrics.cellHeight / 2,
      };
    },
    [gridRotationTurns, readActiveMetrics]
  );

  React.useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;
    const gridElement = gridRef?.current;
    if (!(gridElement instanceof HTMLElement)) {
      clear();
      return undefined;
    }

    let frameId = null;
    const refresh = () => {
      if (frameId != null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (isDraggingRef?.current || gridRef.current !== gridElement) return;
        build();
      });
    };

    clear();
    refresh();
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(refresh) : null;
    resizeObserver?.observe(gridElement);
    window.addEventListener("resize", refresh, { passive: true });
    window.addEventListener("scroll", refresh, true);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
      if (frameId != null) window.cancelAnimationFrame(frameId);
      clear();
    };
  }, [board, build, clear, gridRef, isDraggingRef, isUltraCompact, phase]);

  return {
    buildGridHitboxMetrics: build,
    clearGridHitboxCache: clear,
    getGridHitboxMetrics: getMetrics,
    getTileGeometryByBoardIndex,
    getTileIndexFromPoint,
    gridHitboxRef: metricsRef,
  };
}
