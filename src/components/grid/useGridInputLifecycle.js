import React from "react";

const EDITABLE_TARGET_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [data-chat-panel='true']";
const AUTH_DIALOG_SELECTOR = "[data-auth-dialog='true']";

function isHtmlElement(value, HTMLElementCtor) {
  return typeof HTMLElementCtor === "function" && value instanceof HTMLElementCtor;
}

export function handleGridKeyboardEvent(event, config, environment = {}) {
  const documentTarget =
    environment.documentTarget ??
    (typeof document !== "undefined" ? document : null);
  const HTMLElementCtor =
    environment.HTMLElementCtor ??
    (typeof HTMLElement !== "undefined" ? HTMLElement : null);
  const schedule =
    environment.schedule ??
    ((callback) => {
      if (typeof window !== "undefined") return window.setTimeout(callback, 0);
      return setTimeout(callback, 0);
    });
  const targetElement = isHtmlElement(event?.target, HTMLElementCtor)
    ? event.target
    : null;
  const activeElement = isHtmlElement(documentTarget?.activeElement, HTMLElementCtor)
    ? documentTarget.activeElement
    : null;
  const authDialogFocused =
    !!targetElement?.closest?.(AUTH_DIALOG_SELECTOR) ||
    !!activeElement?.closest?.(AUTH_DIALOG_SELECTOR);

  if (event?.key === "Tab") {
    if (config.authDialogOpen || authDialogFocused) return false;
    event.preventDefault?.();
    config.setActiveArea?.((previous) => {
      const next = previous === "game" ? "chat" : "game";
      if (next === "chat") {
        schedule(() => config.focusChatInput?.());
      } else {
        const focusedElement = isHtmlElement(documentTarget?.activeElement, HTMLElementCtor)
          ? documentTarget.activeElement
          : null;
        focusedElement?.blur?.();
      }
      return next;
    });
    return true;
  }

  if (targetElement?.closest?.(EDITABLE_TARGET_SELECTOR)) return false;
  if (config.activeArea !== "game" || config.phase !== "playing") return false;
  if (config.inputLockedRef?.current) return false;

  const tag = event?.target?.tagName;
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    event?.target?.isContentEditable
  ) {
    return false;
  }

  const key = String(event?.key || "").toLowerCase();
  if (/^[a-z]$/.test(key)) {
    event.preventDefault?.();
    if (config.lastInputModeRef) config.lastInputModeRef.current = "keyboard";
    config.addLetter?.(key.toUpperCase());
    return true;
  }
  if (key === "arrowup" || key === "arrowdown") {
    event.preventDefault?.();
    if (config.lastInputModeRef) config.lastInputModeRef.current = "keyboard";
    config.cycleWordHistory?.(key === "arrowup" ? -1 : 1);
    return true;
  }
  if (key === "enter") {
    event.preventDefault?.();
    if (config.lastInputModeRef) config.lastInputModeRef.current = "keyboard";
    config.submit?.();
    return true;
  }
  if (key === "backspace") {
    event.preventDefault?.();
    if (config.lastInputModeRef) config.lastInputModeRef.current = "keyboard";
    config.removeLastLetter?.();
    return true;
  }
  return false;
}

export default function useGridInputLifecycle(config) {
  const configRef = React.useRef(config);
  configRef.current = config;

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const preventTouchScrollDuringDrag = (event) => {
      if (!configRef.current.draggingRef?.current) return;
      if (event?.cancelable) event.preventDefault();
    };
    window.addEventListener("touchmove", preventTouchScrollDuringDrag, {
      passive: false,
    });
    return () => {
      window.removeEventListener("touchmove", preventTouchScrollDuringDrag);
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      handleGridKeyboardEvent(event, configRef.current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
