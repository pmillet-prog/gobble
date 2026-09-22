import React from "react";
import { CHALKBOARD_LIMITS, getChalkboardDraftUsage } from "../../../shared/chalkboardLimits.js";

import {
  CHALKBOARD_PALETTE,
  CHALKBOARD_WORLD,
  createElementId,
  createRandomSeed,
  distance,
  hitTestTextHandle,
  hitTestText,
} from "./chalkboardModel.js";
import useChalkboardFonts from "./useChalkboardFonts.js";
import useChalkboardTextEntry from "./useChalkboardTextEntry.js";
import { resizeChalkboardTextWidth } from "./chalkboardTextDraft.js";
import { CHALKBOARD_ERASER } from "../../../shared/chalkboardErasure.js";
import { appendEraserGesture, createEraserGesture } from "./chalkboardEraserGesture.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Match the server's stored geometry from the first preview. Confirming an
// intervention can then reuse its chalk texture without rounding it again.
function roundCoordinate(value, max) {
  return Math.round(clamp(value, 0, max) * 10) / 10;
}

function normalizeTextGeometry(element) {
  let angle = element.angle % (Math.PI * 2);
  if (angle > Math.PI) angle -= Math.PI * 2;
  if (angle < -Math.PI) angle += Math.PI * 2;
  return {
    ...element,
    cx: roundCoordinate(element.cx, CHALKBOARD_WORLD.width),
    cy: roundCoordinate(element.cy, CHALKBOARD_WORLD.height),
    width: Math.round(clamp(element.width, 18, 1600) * 10) / 10,
    scale: Math.round(clamp(element.scale, 0.3, 4) * 1000) / 1000,
    angle: Math.round(angle * 10000) / 10000,
  };
}

export default function useChalkboardEditor() {
  const [tool, setTool] = React.useState("chalk");
  const [color, setColor] = React.useState(CHALKBOARD_PALETTE[0]);
  const [size, setSize] = React.useState(11);
  const [eraserSize, setEraserSize] = React.useState(CHALKBOARD_ERASER.defaultSize);
  const [elements, setElements] = React.useState([]);
  const [historyCount, setHistoryCount] = React.useState(0);
  const [limitReached, setLimitReached] = React.useState(false);
  const [selectedTextId, setSelectedTextId] = React.useState("");
  const fontCatalog = useChalkboardFonts();
  const historyRef = React.useRef([]);
  const renderListenersRef = React.useRef(new Set());
  const elementsRef = React.useRef(elements);
  const renderElementsRef = React.useRef(elements);
  const activeRef = React.useRef(null);
  const renderFrameRef = React.useRef(0);

  const requestRender = React.useCallback(() => {
    if (renderFrameRef.current) return;
    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = 0;
      for (const listener of renderListenersRef.current) listener();
    });
  }, []);

  React.useEffect(
    () => () => {
      if (renderFrameRef.current) cancelAnimationFrame(renderFrameRef.current);
      renderFrameRef.current = 0;
    },
    []
  );

  const subscribeRender = React.useCallback((listener) => {
    renderListenersRef.current.add(listener);
    return () => renderListenersRef.current.delete(listener);
  }, []);
  const getRenderElements = React.useCallback(() => renderElementsRef.current, []);
  const getActiveGesture = React.useCallback(() => activeRef.current?.kind || null, []);

  const replaceElements = React.useCallback(
    (nextElements, { remember = true } = {}) => {
      // Only an in-progress stroke is mutated. Once committed, elements and
      // points are shared by immutable snapshots instead of copied on each edit.
      const next = nextElements;
      if (remember) {
        historyRef.current = [...historyRef.current.slice(-39), elementsRef.current];
        setHistoryCount(historyRef.current.length);
      }
      elementsRef.current = next;
      renderElementsRef.current = next;
      setElements(next);
      requestRender();
    },
    [requestRender]
  );

  const composition = useChalkboardTextEntry({ fontCatalog, elementsRef, replaceElements, setSelectedTextId, setLimitReached });
  const { entry: textEntry, entryRef: textEntryRef, begin: beginTextEntry, cancel: cancelTextEntry, clear: clearTextEntry } = composition;

  const reset = React.useCallback(() => {
    setLimitReached(false);
    activeRef.current = null;
    elementsRef.current = [];
    renderElementsRef.current = [];
    setElements([]);
    historyRef.current = [];
    setHistoryCount(0);
    setSelectedTextId("");
    clearTextEntry();
    requestRender();
  }, [requestRender, clearTextEntry]);

  const undo = React.useCallback(() => {
    setLimitReached(false);
    if (activeRef.current) {
      activeRef.current = null;
      renderElementsRef.current = elementsRef.current;
      requestRender();
      return;
    }
    if (!historyRef.current.length) return;
    const previous = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);
    setHistoryCount(historyRef.current.length);
    elementsRef.current = previous;
    renderElementsRef.current = previous;
    setElements(previous);
    if (!previous.some((element) => element.id === selectedTextId)) setSelectedTextId("");
    requestRender();
  }, [requestRender, selectedTextId]);

  const removeSelected = React.useCallback(() => {
    if (!selectedTextId) return;
    const next = elementsRef.current.filter((element) => element.id !== selectedTextId);
    if (next.length === elementsRef.current.length) return;
    replaceElements(next);
    setSelectedTextId("");
  }, [replaceElements, selectedTextId]);

  const pointerDown = React.useCallback(
    ({ worldX, worldY, screenX, screenY, scale = 1, viewport, interventions = [] }) => {
      if (activeRef.current) return false;
      const usage = getChalkboardDraftUsage(elementsRef.current);
      if ((tool === "chalk" || tool === "erase") &&
        (usage.elements >= CHALKBOARD_LIMITS.maxElements || usage.points + 2 > CHALKBOARD_LIMITS.maxPoints)) {
        setLimitReached(true);
        return false;
      }
      if (tool === "erase") {
        activeRef.current = createEraserGesture(roundCoordinate(worldX, CHALKBOARD_WORLD.width), roundCoordinate(worldY, CHALKBOARD_WORLD.height), eraserSize, interventions);
        renderElementsRef.current = [...elementsRef.current, ...activeRef.current.masks];
        setSelectedTextId("");
        requestRender();
        return true;
      }
      if (tool === "chalk") {
        const stroke = {
          type: "stroke",
          id: createElementId("stroke"),
          seed: createRandomSeed(),
          color,
          size,
          points: [{ x: roundCoordinate(worldX, CHALKBOARD_WORLD.width), y: roundCoordinate(worldY, CHALKBOARD_WORLD.height), p: 0.5 }],
        };
        activeRef.current = { kind: "stroke", element: stroke };
        renderElementsRef.current = [...elementsRef.current, stroke];
        setSelectedTextId("");
        requestRender();
        return true;
      }

      const selected = elementsRef.current.find((element) => element.id === selectedTextId);
      const radius = 24 / Math.max(0.25, scale);
      if (selected?.type === "text") {
        const kind = hitTestTextHandle(selected, { x: worldX, y: worldY }, radius);
        if (kind) {
          activeRef.current = {
            kind,
            id: selected.id,
            baseElements: elementsRef.current,
            original: { ...selected },
            startAngle: Math.atan2(worldY - selected.cy, worldX - selected.cx),
            startDistance: Math.max(1, distance({ x: selected.cx, y: selected.cy }, { x: worldX, y: worldY })),
          };
          return true;
        }
      }

      const hit = [...elementsRef.current]
        .reverse()
        .find((element) => element.type === "text" && (!textEntryRef.current || element.id === textEntryRef.current.id) && hitTestText(element, worldX, worldY, radius * 0.35));
      if (hit) {
        setSelectedTextId(hit.id);
        activeRef.current = {
          kind: "drag",
          id: hit.id,
          baseElements: elementsRef.current,
          original: { ...hit },
          startX: worldX,
          startY: worldY,
        };
        requestRender();
        return true;
      }

      if (textEntryRef.current) return false;
      if (selected?.type === "text") {
        setSelectedTextId("");
        requestRender();
        return false;
      }

      beginTextEntry({ worldX, worldY, screenX, screenY, viewport });
      requestRender();
      return false;
    },
    [beginTextEntry, color, requestRender, selectedTextId, size, tool, eraserSize, textEntryRef]
  );

  const pointerMove = React.useCallback(
    ({ worldX, worldY, pressure = 0.5 }) => {
      const active = activeRef.current;
      if (!active) return;
      if (active.kind === "erase") {
        const usage = getChalkboardDraftUsage(renderElementsRef.current);
        const split = active.masks.at(-1).points.length >= CHALKBOARD_ERASER.maxPoints;
        if (usage.points + (split ? 2 : 1) > CHALKBOARD_LIMITS.maxPoints ||
          (split && usage.elements >= CHALKBOARD_LIMITS.maxElements)) {
          setLimitReached(true);
          return;
        }
        appendEraserGesture(active, roundCoordinate(worldX, CHALKBOARD_WORLD.width), roundCoordinate(worldY, CHALKBOARD_WORLD.height));
        renderElementsRef.current = [...elementsRef.current, ...active.masks];
        requestRender();
        return;
      }
      if (active.kind === "stroke") {
        worldX = roundCoordinate(worldX, CHALKBOARD_WORLD.width);
        worldY = roundCoordinate(worldY, CHALKBOARD_WORLD.height);
        const points = active.element.points;
        if (points.length >= CHALKBOARD_LIMITS.maxStrokePoints ||
          getChalkboardDraftUsage(renderElementsRef.current).points >= CHALKBOARD_LIMITS.maxPoints) {
          setLimitReached(true);
          return;
        }
        const previous = points[points.length - 1];
        if (Math.hypot(worldX - previous.x, worldY - previous.y) < 1.2) return;
        points.push({ x: worldX, y: worldY, p: Math.round(clamp(pressure || 0.5, 0, 1) * 100) / 100 });
        requestRender();
        return;
      }
      const next = [...active.baseElements];
      const index = next.findIndex((element) => element.id === active.id);
      if (index < 0) return;
      next[index] = { ...active.original };
      if (active.kind === "drag") {
        next[index].cx = clamp(active.original.cx + worldX - active.startX, 0, CHALKBOARD_WORLD.width);
        next[index].cy = clamp(active.original.cy + worldY - active.startY, 0, CHALKBOARD_WORLD.height);
      } else if (active.kind === "rotate") {
        const currentAngle = Math.atan2(worldY - active.original.cy, worldX - active.original.cx);
        next[index].angle = active.original.angle + currentAngle - active.startAngle;
      } else if (active.kind === "scale") {
        const currentDistance = distance(
          { x: active.original.cx, y: active.original.cy },
          { x: worldX, y: worldY }
        );
        next[index].scale = clamp(
          active.original.scale * (currentDistance / active.startDistance),
          0.3,
          4
        );
      } else if (active.kind === "width") {
        next[index] = resizeChalkboardTextWidth(active.original, { x: worldX, y: worldY });
      }
      next[index] = normalizeTextGeometry(next[index]);
      renderElementsRef.current = next;
      requestRender();
    },
    [requestRender]
  );

  const pointerUp = React.useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    activeRef.current = null;
    if (active.kind === "stroke") {
      if (active.element.points.length >= 2) {
        replaceElements([...elementsRef.current, active.element]);
      } else {
        renderElementsRef.current = elementsRef.current;
        requestRender();
      }
      return;
    }
    if (textEntryRef.current) textEntryRef.current.adjusted = true;
    replaceElements(renderElementsRef.current, { remember: !textEntryRef.current });
  }, [replaceElements, requestRender, textEntryRef]);

  const pointerCancel = React.useCallback(() => {
    activeRef.current = null;
    renderElementsRef.current = elementsRef.current;
    requestRender();
  }, [requestRender]);

  React.useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = String(event.target?.tagName || "").toLowerCase();
      if (tagName === "input" || tagName === "textarea") return;
      if (textEntryRef.current) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selectedTextId) {
        event.preventDefault();
        removeSelected();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [removeSelected, selectedTextId, undo, textEntryRef]);

  return {
    beginTextEntry,
    cancelTextEntry,
    color,
    elements,
    eraserSize,
    setEraserSize,
    finishTextEntry: composition.finish,
    updateTextEntry: composition.update,
    updateTextStyle: composition.updateStyle,
    fontsReady: fontCatalog.ready,
    loadedFonts: fontCatalog.fonts,
    fontsError: fontCatalog.error,
    reloadFonts: fontCatalog.retry,
    getRenderElements,
    getActiveGesture,
    hasDraft: elements.length > 0,
    historyCount,
    limitReached,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    removeSelected,
    reset,
    selectedTextId,
    setColor,
    setSelectedTextId,
    setSize,
    setTool,
    size,
    subscribeRender,
    textEntry,
    tool,
    undo,
  };
}
