import React from "react";
import useDesktopLayoutController from "../../hooks/useDesktopLayoutController.js";
import { VIEWPORT_EVENTS } from "../../features/layout/createViewportEventHub.js";
import {
  areDesktopFractionsEqual,
  normalizeDesktopColumnFractions,
  normalizeDesktopColumnOrder,
  readDesktopColumnFractionsForInstall,
  readDesktopColumnOrderForInstall,
  writeDesktopColumnFractionsForInstall,
  writeDesktopColumnOrderForInstall,
} from "../../app/adapters/desktopLayoutStorage.js";

const DESKTOP_COLUMN_HANDLE_LABELS = new Map([
  ["players", "joueurs"],
  ["grid", "grille"],
  ["side", "score et résultats"],
  ["chat", "chat"],
]);

function normalizeMeasuredPx(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number);
}

function isSameMeasuredPx(previous, next, epsilon = 1) {
  return (
    Math.abs(normalizeMeasuredPx(previous) - normalizeMeasuredPx(next)) <= epsilon
  );
}

function areDesktopHandleLayoutsEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      !a ||
      !b ||
      a.id !== b.id ||
      a.label !== b.label ||
      Math.abs((a.left || 0) - (b.left || 0)) > 0.5 ||
      Math.abs((a.top || 0) - (b.top || 0)) > 0.5
    ) {
      return false;
    }
  }
  return true;
}

function areDesktopColumnOrdersEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

export default function useDesktopSceneLayout({
  appView,
  connectionError,
  desktopColumnBaseDefs,
  desktopColumnDefaultFractions,
  desktopColumnFractions,
  desktopColumnMinWidthsPx,
  desktopColumnOrder,
  desktopColumnOrderSafe,
  desktopColumnStorageScope,
  desktopGridResizeMaxTrackWidth,
  hasDesktopResultsSummary,
  installId,
  isLoggedIn,
  isMobileLayout,
  layoutFeature,
  maxGridWidth,
  minGridWidth,
  phase,
  setDesktopColumnDragId,
  setDesktopColumnFractions,
  setDesktopColumnHandleLayout,
  setDesktopColumnOrder,
  setDesktopColumnResizeActiveIndex,
  setDesktopGridMetrics,
  setDesktopMainGridHeight,
  setDesktopResultsDrawerLayout,
  setDesktopViewportResizeInProgress,
  setGridWidth,
  setPlayColumnHeight,
  showHelp,
}) {
  const mainGridDesktopRef = React.useRef(null);
  const playColumnRef = React.useRef(null);
  const isMobileLayoutRef = React.useRef(isMobileLayout);
  isMobileLayoutRef.current = isMobileLayout;
  const desktopColumnOrderRef = React.useRef(desktopColumnOrder);
  const desktopColumnNodeMapRef = React.useRef(new Map());
  const desktopColumnGhostNodeRef = React.useRef(null);
  const desktopColumnGhostOffsetRef = React.useRef({ x: 0, y: 0 });
  const desktopColumnPointerDragRef = React.useRef({
    active: false,
    pointerId: null,
    pointerTarget: null,
    lastClientX: null,
    lastSwapDirection: null,
    lastSwapClientX: null,
    moveHandler: null,
    upHandler: null,
  });
  const desktopColumnFractionsRef = React.useRef(desktopColumnFractions);
  const desktopColumnOrderHydratedInstallIdRef = React.useRef("");
  const desktopColumnOrderPersistSignatureRef = React.useRef("");
  const desktopColumnFractionsHydratedInstallIdRef = React.useRef("");
  const desktopColumnFractionsPersistSignatureRef = React.useRef("");
  const desktopGridResizeMaxTrackWidthRef = React.useRef(
    Number.POSITIVE_INFINITY,
  );
  desktopGridResizeMaxTrackWidthRef.current =
    Number(desktopGridResizeMaxTrackWidth) || Number.POSITIVE_INFINITY;
  const desktopColumnResizeRef = React.useRef({
    active: false,
    moveHandler: null,
    upHandler: null,
    bodyCursor: "",
    bodyUserSelect: "",
  });
  const desktopViewportResizeTimerRef = React.useRef(null);

  const setDesktopColumnNode = React.useCallback((columnId, node) => {
    const id = String(columnId || "").trim();
    if (!id) return;
    if (node) desktopColumnNodeMapRef.current.set(id, node);
    else desktopColumnNodeMapRef.current.delete(id);
  }, []);

  const clearDesktopColumnDragState = React.useCallback(() => {
    const dragState = desktopColumnPointerDragRef.current;
    if (dragState.moveHandler) {
      window.removeEventListener("pointermove", dragState.moveHandler);
      dragState.moveHandler = null;
    }
    if (dragState.upHandler) {
      window.removeEventListener("pointerup", dragState.upHandler);
      window.removeEventListener("pointercancel", dragState.upHandler);
      dragState.upHandler = null;
    }
    if (typeof document !== "undefined" && document.body) {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    dragState.active = false;
    if (
      dragState.pointerTarget &&
      dragState.pointerId != null &&
      typeof dragState.pointerTarget.releasePointerCapture === "function"
    ) {
      try {
        dragState.pointerTarget.releasePointerCapture(dragState.pointerId);
      } catch (_) {}
    }
    dragState.pointerId = null;
    dragState.pointerTarget = null;
    dragState.lastClientX = null;
    dragState.lastSwapDirection = null;
    dragState.lastSwapClientX = null;
    if (desktopColumnGhostNodeRef.current?.parentNode) {
      desktopColumnGhostNodeRef.current.parentNode.removeChild(
        desktopColumnGhostNodeRef.current,
      );
    }
    desktopColumnGhostNodeRef.current = null;
    setDesktopColumnDragId(null);
  }, [setDesktopColumnDragId]);

  const computeDesktopColumnOrderForPointer = React.useCallback(
    (dragId, clientX, movingLeft) => {
      const sourceId = String(dragId || "").trim();
      const current = normalizeDesktopColumnOrder(
        desktopColumnOrderRef.current,
        desktopColumnBaseDefs,
      );
      if (!sourceId) return current;
      const sourceIndex = current.indexOf(sourceId);
      if (sourceIndex < 0) return current;
      const sourceRect =
        desktopColumnNodeMapRef.current
          .get(sourceId)
          ?.getBoundingClientRect?.();
      if (
        !sourceRect ||
        !Number.isFinite(sourceRect.left) ||
        !Number.isFinite(sourceRect.right)
      ) {
        return current;
      }
      if (movingLeft) {
        if (sourceIndex <= 0) return current;
        const previousId = current[sourceIndex - 1];
        const previousRect =
          desktopColumnNodeMapRef.current
            .get(previousId)
            ?.getBoundingClientRect?.();
        if (
          !previousRect ||
          !Number.isFinite(previousRect.right) ||
          !Number.isFinite(previousRect.left)
        ) {
          return current;
        }
        const separatorX = (previousRect.right + sourceRect.left) / 2;
        if (clientX >= separatorX) return current;
        const next = [...current];
        next[sourceIndex - 1] = sourceId;
        next[sourceIndex] = previousId;
        return normalizeDesktopColumnOrder(next, desktopColumnBaseDefs);
      }
      if (sourceIndex >= current.length - 1) return current;
      const nextId = current[sourceIndex + 1];
      const nextRect =
        desktopColumnNodeMapRef.current.get(nextId)?.getBoundingClientRect?.();
      if (
        !nextRect ||
        !Number.isFinite(nextRect.left) ||
        !Number.isFinite(nextRect.right)
      ) {
        return current;
      }
      const separatorX = (sourceRect.right + nextRect.left) / 2;
      if (clientX <= separatorX) return current;
      const next = [...current];
      next[sourceIndex] = nextId;
      next[sourceIndex + 1] = sourceId;
      return normalizeDesktopColumnOrder(next, desktopColumnBaseDefs);
    },
    [desktopColumnBaseDefs],
  );

  const handleDesktopColumnPointerDown = React.useCallback(
    (event, columnId) => {
      if (isMobileLayoutRef.current || event.button !== 0) return;
      const id = String(columnId || "").trim();
      if (!id) return;
      const node = desktopColumnNodeMapRef.current.get(id);
      const rect = node?.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      clearDesktopColumnDragState();
      if (typeof document !== "undefined" && document.body) {
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      }
      const ghostNode =
        typeof document !== "undefined" ? node.cloneNode(true) : null;
      if (ghostNode instanceof HTMLElement && typeof document !== "undefined") {
        ghostNode.setAttribute("aria-hidden", "true");
        ghostNode.style.position = "fixed";
        ghostNode.style.left = "0";
        ghostNode.style.top = "0";
        ghostNode.style.width = `${rect.width}px`;
        ghostNode.style.height = `${rect.height}px`;
        ghostNode.style.margin = "0";
        ghostNode.style.pointerEvents = "none";
        ghostNode.style.zIndex = "120";
        ghostNode.style.overflow = "hidden";
        ghostNode.style.opacity = "0.92";
        ghostNode.style.boxShadow = "0 24px 54px rgba(15, 23, 42, 0.28)";
        ghostNode.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) rotate(1deg)`;
        ghostNode.style.willChange = "transform";
        ghostNode.style.borderColor = "rgba(59,130,246,0.72)";
        ghostNode.style.transition = "none";
        document.body.appendChild(ghostNode);
        desktopColumnGhostNodeRef.current = ghostNode;
      }
      desktopColumnGhostOffsetRef.current = {
        x: Math.max(0, event.clientX - rect.left),
        y: Math.max(0, event.clientY - rect.top),
      };
      setDesktopColumnDragId(id);
      const dragState = desktopColumnPointerDragRef.current;
      dragState.active = true;
      dragState.pointerId = event.pointerId;
      dragState.pointerTarget = event.currentTarget || null;
      if (
        dragState.pointerTarget &&
        dragState.pointerId != null &&
        typeof dragState.pointerTarget.setPointerCapture === "function"
      ) {
        try {
          dragState.pointerTarget.setPointerCapture(dragState.pointerId);
        } catch (_) {}
      }
      dragState.lastClientX = Number.isFinite(event.clientX)
        ? event.clientX
        : null;
      dragState.lastSwapDirection = null;
      dragState.lastSwapClientX = null;
      dragState.moveHandler = (moveEvent) => {
        const currentDrag = desktopColumnPointerDragRef.current;
        if (!currentDrag.active) return;
        const clientX = Number(moveEvent.clientX);
        const clientY = Number(moveEvent.clientY);
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
        const previousClientX = currentDrag.lastClientX;
        const deltaX = Number.isFinite(previousClientX)
          ? clientX - previousClientX
          : 0;
        const movingLeft = Number.isFinite(previousClientX) && deltaX < -0.5;
        const movingRight = Number.isFinite(previousClientX) && deltaX > 0.5;
        currentDrag.lastClientX = clientX;
        const ghost = desktopColumnGhostNodeRef.current;
        if (ghost) {
          ghost.style.transform = `translate3d(${
            clientX - desktopColumnGhostOffsetRef.current.x
          }px, ${
            clientY - desktopColumnGhostOffsetRef.current.y
          }px, 0) rotate(1deg)`;
        }
        if (!movingLeft && !movingRight) return;
        const direction = movingLeft ? "left" : "right";
        if (
          currentDrag.lastSwapDirection &&
          currentDrag.lastSwapDirection !== direction &&
          Number.isFinite(currentDrag.lastSwapClientX) &&
          Math.abs(clientX - currentDrag.lastSwapClientX) < 14
        ) {
          return;
        }
        const currentOrder = normalizeDesktopColumnOrder(
          desktopColumnOrderRef.current,
          desktopColumnBaseDefs,
        );
        const nextOrder = computeDesktopColumnOrderForPointer(
          id,
          clientX,
          movingLeft,
        );
        if (!areDesktopColumnOrdersEqual(currentOrder, nextOrder)) {
          desktopColumnOrderRef.current = nextOrder;
          currentDrag.lastSwapDirection = direction;
          currentDrag.lastSwapClientX = clientX;
        }
        setDesktopColumnOrder((previous) => {
          const normalizedPrevious = normalizeDesktopColumnOrder(
            previous,
            desktopColumnBaseDefs,
          );
          return areDesktopColumnOrdersEqual(normalizedPrevious, nextOrder)
            ? previous
            : nextOrder;
        });
      };
      dragState.upHandler = clearDesktopColumnDragState;
      window.addEventListener("pointermove", dragState.moveHandler);
      window.addEventListener("pointerup", dragState.upHandler);
      window.addEventListener("pointercancel", dragState.upHandler);
    },
    [
      clearDesktopColumnDragState,
      computeDesktopColumnOrderForPointer,
      desktopColumnBaseDefs,
      setDesktopColumnDragId,
      setDesktopColumnOrder,
    ],
  );

  React.useEffect(() => {
    desktopColumnOrderRef.current = desktopColumnOrderSafe;
  }, [desktopColumnOrderSafe]);

  React.useEffect(() => {
    if (isMobileLayout) clearDesktopColumnDragState();
  }, [clearDesktopColumnDragState, isMobileLayout]);

  React.useEffect(
    () => () => clearDesktopColumnDragState(),
    [clearDesktopColumnDragState],
  );

  React.useEffect(() => {
    const key = String(installId || "").trim();
    if (!key) return;
    const persisted = readDesktopColumnOrderForInstall(
      key,
      desktopColumnStorageScope,
      desktopColumnBaseDefs,
    );
    const normalized = normalizeDesktopColumnOrder(
      persisted,
      desktopColumnBaseDefs,
    );
    desktopColumnOrderPersistSignatureRef.current = JSON.stringify(normalized);
    desktopColumnOrderHydratedInstallIdRef.current = `${desktopColumnStorageScope}:${key}`;
    setDesktopColumnOrder((previous) => {
      const normalizedPrevious = normalizeDesktopColumnOrder(
        previous,
        desktopColumnBaseDefs,
      );
      return areDesktopColumnOrdersEqual(normalizedPrevious, normalized)
        ? previous
        : normalized;
    });
  }, [
    desktopColumnBaseDefs,
    desktopColumnStorageScope,
    installId,
    setDesktopColumnOrder,
  ]);

  React.useEffect(() => {
    const key = String(installId || "").trim();
    if (
      !key ||
      desktopColumnOrderHydratedInstallIdRef.current !==
        `${desktopColumnStorageScope}:${key}`
    ) {
      return;
    }
    const normalized = normalizeDesktopColumnOrder(
      desktopColumnOrder,
      desktopColumnBaseDefs,
    );
    const signature = JSON.stringify(normalized);
    if (desktopColumnOrderPersistSignatureRef.current === signature) return;
    writeDesktopColumnOrderForInstall(
      key,
      desktopColumnStorageScope,
      normalized,
      desktopColumnBaseDefs,
    );
    desktopColumnOrderPersistSignatureRef.current = signature;
  }, [
    desktopColumnBaseDefs,
    desktopColumnOrder,
    desktopColumnStorageScope,
    installId,
  ]);

  React.useEffect(() => {
    desktopColumnFractionsRef.current = desktopColumnFractions;
  }, [desktopColumnFractions]);

  React.useEffect(() => {
    const key = String(installId || "").trim();
    if (!key) return;
    const persisted = readDesktopColumnFractionsForInstall(
      key,
      desktopColumnStorageScope,
      desktopColumnDefaultFractions,
    );
    const normalized = normalizeDesktopColumnFractions(
      persisted,
      desktopColumnDefaultFractions,
    );
    desktopColumnFractionsRef.current = normalized;
    desktopColumnFractionsPersistSignatureRef.current = JSON.stringify(normalized);
    desktopColumnFractionsHydratedInstallIdRef.current = `${desktopColumnStorageScope}:${key}`;
    setDesktopColumnFractions((previous) =>
      areDesktopFractionsEqual(previous, normalized) ? previous : normalized,
    );
  }, [
    desktopColumnDefaultFractions,
    desktopColumnStorageScope,
    installId,
    setDesktopColumnFractions,
  ]);

  React.useEffect(() => {
    const key = String(installId || "").trim();
    if (
      !key ||
      desktopColumnFractionsHydratedInstallIdRef.current !==
        `${desktopColumnStorageScope}:${key}`
    ) {
      return;
    }
    const normalized = normalizeDesktopColumnFractions(
      desktopColumnFractionsRef.current,
      desktopColumnDefaultFractions,
    );
    const signature = JSON.stringify(normalized);
    if (desktopColumnFractionsPersistSignatureRef.current === signature) return;
    writeDesktopColumnFractionsForInstall(
      key,
      desktopColumnStorageScope,
      normalized,
      desktopColumnDefaultFractions,
    );
    desktopColumnFractionsPersistSignatureRef.current = signature;
  }, [
    desktopColumnDefaultFractions,
    desktopColumnFractions,
    desktopColumnStorageScope,
    installId,
  ]);

  const { startDesktopColumnResize } = useDesktopLayoutController(
    appView,
    connectionError,
    desktopColumnBaseDefs,
    desktopColumnDefaultFractions,
    desktopColumnFractionsRef,
    desktopColumnMinWidthsPx,
    desktopColumnOrderRef,
    desktopColumnResizeRef,
    desktopGridResizeMaxTrackWidthRef,
    desktopViewportResizeTimerRef,
    hasDesktopResultsSummary,
    isLoggedIn,
    isMobileLayout,
    mainGridDesktopRef,
    phase,
    setDesktopColumnFractions,
    setDesktopColumnResizeActiveIndex,
    setDesktopGridMetrics,
    setDesktopMainGridHeight,
    setDesktopResultsDrawerLayout,
    setDesktopViewportResizeInProgress,
    showHelp
  );

  React.useLayoutEffect(() => {
    if (isMobileLayout || typeof window === "undefined") {
      setDesktopColumnHandleLayout((previous) =>
        previous.length ? [] : previous
      );
      return undefined;
    }

    let frameId = 0;
    const measure = () => {
      const next = desktopColumnOrderSafe
        .map((id) => {
          const node = desktopColumnNodeMapRef.current.get(id);
          const rect = node?.getBoundingClientRect?.();
          if (!rect || rect.width <= 0 || rect.height <= 0) return null;
          return {
            id,
            label: DESKTOP_COLUMN_HANDLE_LABELS.get(id) || id,
            left: rect.left + rect.width / 2,
            top: rect.top,
          };
        })
        .filter(Boolean);
      setDesktopColumnHandleLayout((previous) =>
        areDesktopHandleLayoutsEqual(previous, next) ? previous : next
      );
    };
    const scheduleMeasure = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(measure);
    };
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(scheduleMeasure)
        : null;
    if (mainGridDesktopRef.current) observer?.observe(mainGridDesktopRef.current);
    desktopColumnOrderSafe.forEach((id) => {
      const node = desktopColumnNodeMapRef.current.get(id);
      if (node) observer?.observe(node);
    });
    scheduleMeasure();
    const unsubscribeViewport = layoutFeature.subscribeViewport(scheduleMeasure, [
      VIEWPORT_EVENTS.WINDOW_RESIZE,
    ]);
    window.addEventListener("scroll", scheduleMeasure, true);
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer?.disconnect();
      unsubscribeViewport();
      window.removeEventListener("scroll", scheduleMeasure, true);
    };
  }, [
    desktopColumnOrderSafe,
    isMobileLayout,
    layoutFeature,
    setDesktopColumnHandleLayout,
  ]);

  React.useEffect(() => {
    const element = playColumnRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;

    const clampGridWidth = (rawValue) => {
      const value = Number(rawValue);
      if (!Number.isFinite(value) || value <= 0) return null;
      return Math.min(
        Math.max(1, Number(maxGridWidth) || 980),
        Math.max(Math.max(1, Number(minGridWidth) || 260), value - 24)
      );
    };
    const commitGridWidth = (value) => {
      const clamped = clampGridWidth(value);
      if (!clamped) return;
      setGridWidth((previous) =>
        isSameMeasuredPx(previous, clamped) ? previous : clamped
      );
    };
    const commitPlayColumnHeight = (value) => {
      const nextHeight = normalizeMeasuredPx(value);
      if (!nextHeight) return;
      setPlayColumnHeight((previous) =>
        isSameMeasuredPx(previous, nextHeight) ? previous : nextHeight
      );
    };
    const commitElementSize = (target) => {
      const rect = target?.getBoundingClientRect?.();
      if (!rect) return;
      if (rect.width) commitGridWidth(rect.width);
      if (rect.height) commitPlayColumnHeight(rect.height);
    };

    commitElementSize(element);
    const observer = new ResizeObserver((entries) => {
      commitElementSize(entries[0]?.target);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [
    appView,
    isLoggedIn,
    isMobileLayout,
    maxGridWidth,
    minGridWidth,
    phase,
    setGridWidth,
    setPlayColumnHeight,
  ]);

  return {
    handleDesktopColumnPointerDown,
    mainGridDesktopRef,
    playColumnRef,
    setDesktopColumnNode,
    startDesktopColumnResize,
  };
}
