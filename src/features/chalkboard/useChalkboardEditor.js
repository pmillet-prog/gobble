import React from "react";

import {
  CHALKBOARD_PALETTE,
  CHALKBOARD_WORLD,
  cloneElements,
  createElementId,
  createRandomSeed,
  distance,
  getTextHandles,
  hitTestText,
} from "./chalkboardModel.js";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function measureText(text, fontSize) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = `700 ${fontSize}px "GobbleCaveat", "Segoe Print", cursive`;
  return Math.max(24, context.measureText(text).width + fontSize * 0.24);
}

export default function useChalkboardEditor() {
  const [tool, setTool] = React.useState("chalk");
  const [color, setColor] = React.useState(CHALKBOARD_PALETTE[0]);
  const [size, setSize] = React.useState(11);
  const [elements, setElements] = React.useState([]);
  const [history, setHistory] = React.useState([]);
  const [selectedTextId, setSelectedTextId] = React.useState("");
  const [textEntry, setTextEntry] = React.useState(null);
  const [renderTick, setRenderTick] = React.useState(0);
  const elementsRef = React.useRef(elements);
  const renderElementsRef = React.useRef(elements);
  const activeRef = React.useRef(null);
  const renderFrameRef = React.useRef(0);

  const requestRender = React.useCallback(() => {
    if (renderFrameRef.current) return;
    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = 0;
      setRenderTick((value) => value + 1);
    });
  }, []);

  React.useEffect(
    () => () => {
      if (renderFrameRef.current) cancelAnimationFrame(renderFrameRef.current);
    },
    []
  );

  const replaceElements = React.useCallback(
    (nextElements, { remember = true } = {}) => {
      const next = cloneElements(nextElements);
      if (remember) {
        const previous = cloneElements(elementsRef.current);
        setHistory((current) => [...current.slice(-39), previous]);
      }
      elementsRef.current = next;
      renderElementsRef.current = next;
      setElements(next);
      requestRender();
    },
    [requestRender]
  );

  const reset = React.useCallback(() => {
    activeRef.current = null;
    elementsRef.current = [];
    renderElementsRef.current = [];
    setElements([]);
    setHistory([]);
    setSelectedTextId("");
    setTextEntry(null);
    requestRender();
  }, [requestRender]);

  const undo = React.useCallback(() => {
    setHistory((current) => {
      if (!current.length) return current;
      const previous = cloneElements(current[current.length - 1]);
      elementsRef.current = previous;
      renderElementsRef.current = previous;
      setElements(previous);
      if (!previous.some((element) => element.id === selectedTextId)) setSelectedTextId("");
      requestRender();
      return current.slice(0, -1);
    });
  }, [requestRender, selectedTextId]);

  const removeSelected = React.useCallback(() => {
    if (!selectedTextId) return;
    const next = elementsRef.current.filter((element) => element.id !== selectedTextId);
    if (next.length === elementsRef.current.length) return;
    replaceElements(next);
    setSelectedTextId("");
  }, [replaceElements, selectedTextId]);

  const finishTextEntry = React.useCallback(
    (rawText) => {
      const entry = textEntry;
      setTextEntry(null);
      const text = String(rawText || "").replace(/\s+/g, " ").trim().slice(0, 280);
      if (!entry || !text) return;
      const fontSize = 68;
      const element = {
        type: "text",
        id: createElementId("text"),
        seed: createRandomSeed(),
        text,
        cx: clamp(entry.worldX, 0, CHALKBOARD_WORLD.width),
        cy: clamp(entry.worldY, fontSize, CHALKBOARD_WORLD.height - fontSize),
        width: measureText(text, fontSize),
        fontSize,
        scale: 1,
        angle: 0,
      };
      replaceElements([...elementsRef.current, element]);
      setSelectedTextId(element.id);
    },
    [replaceElements, textEntry]
  );

  const cancelTextEntry = React.useCallback(() => setTextEntry(null), []);

  const pointerDown = React.useCallback(
    ({ worldX, worldY, screenX, screenY, scale = 1 }) => {
      setTextEntry(null);
      if (tool === "chalk") {
        const stroke = {
          type: "stroke",
          id: createElementId("stroke"),
          seed: createRandomSeed(),
          color,
          size,
          points: [{ x: worldX, y: worldY, p: 0.5 }],
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
        const handles = getTextHandles(selected);
        if (distance(handles.rotate, { x: worldX, y: worldY }) <= radius) {
          activeRef.current = {
            kind: "rotate",
            id: selected.id,
            baseElements: cloneElements(elementsRef.current),
            original: { ...selected },
            startAngle: Math.atan2(worldY - selected.cy, worldX - selected.cx),
          };
          return true;
        }
        if (distance(handles.scale, { x: worldX, y: worldY }) <= radius) {
          activeRef.current = {
            kind: "scale",
            id: selected.id,
            baseElements: cloneElements(elementsRef.current),
            original: { ...selected },
            startDistance: Math.max(1, distance({ x: selected.cx, y: selected.cy }, { x: worldX, y: worldY })),
          };
          return true;
        }
      }

      const hit = [...elementsRef.current]
        .reverse()
        .find((element) => element.type === "text" && hitTestText(element, worldX, worldY, radius * 0.35));
      if (hit) {
        setSelectedTextId(hit.id);
        activeRef.current = {
          kind: "drag",
          id: hit.id,
          baseElements: cloneElements(elementsRef.current),
          original: { ...hit },
          startX: worldX,
          startY: worldY,
        };
        requestRender();
        return true;
      }

      setSelectedTextId("");
      setTextEntry({ worldX, worldY, screenX, screenY });
      requestRender();
      return false;
    },
    [color, requestRender, selectedTextId, size, tool]
  );

  const pointerMove = React.useCallback(
    ({ worldX, worldY, pressure = 0.5 }) => {
      const active = activeRef.current;
      if (!active) return;
      if (active.kind === "stroke") {
        const points = active.element.points;
        const previous = points[points.length - 1];
        if (Math.hypot(worldX - previous.x, worldY - previous.y) < 1.2) return;
        points.push({ x: worldX, y: worldY, p: clamp(pressure || 0.5, 0, 1) });
        renderElementsRef.current = [...elementsRef.current, active.element];
        requestRender();
        return;
      }
      const next = cloneElements(active.baseElements);
      const index = next.findIndex((element) => element.id === active.id);
      if (index < 0) return;
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
      }
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
    replaceElements(renderElementsRef.current);
  }, [replaceElements, requestRender]);

  React.useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = String(event.target?.tagName || "").toLowerCase();
      if (tagName === "input" || tagName === "textarea") return;
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
  }, [removeSelected, selectedTextId, undo]);

  return {
    cancelTextEntry,
    color,
    elements,
    finishTextEntry,
    getRenderElements: () => renderElementsRef.current,
    hasDraft: elements.length > 0,
    historyCount: history.length,
    pointerDown,
    pointerMove,
    pointerUp,
    removeSelected,
    renderTick,
    reset,
    selectedTextId,
    setColor,
    setSelectedTextId,
    setSize,
    setTool,
    size,
    textEntry,
    tool,
    undo,
  };
}
