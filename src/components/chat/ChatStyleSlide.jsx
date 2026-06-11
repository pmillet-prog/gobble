import React from "react";
import { createPortal } from "react-dom";
import ChatContent from "./ChatContent";

export default function ChatStyleSlide(props) {
  const {
    darkMode,
    isChatOpenMobile,
    isChatClosing,
    chatOpenedAtMs,
    chatAnimationMs,
    chatOverlayStyle,
    chatViewportStyle,
    chatSheetStyle,
    onCloseSound,
    setIsChatOpenMobile,
  } = props;

  const isChatVisible = isChatOpenMobile || isChatClosing;
  const isOpen = isChatOpenMobile && !isChatClosing;
  const durationMs = Number.isFinite(chatAnimationMs) ? chatAnimationMs : 220;
  const openedAtMs = Number(chatOpenedAtMs) || 0;
  const shouldSkipInitialOpenAnimation =
    isOpen && openedAtMs > 0 && Date.now() - openedAtMs > durationMs + 80;
  const skipInitialOpenAnimationRef = React.useRef(shouldSkipInitialOpenAnimation);
  const [isRenderedOpen, setIsRenderedOpen] = React.useState(
    () => shouldSkipInitialOpenAnimation
  );

  React.useEffect(() => {
    if (!isChatVisible) {
      setIsRenderedOpen(false);
      return undefined;
    }
    if (!isOpen) {
      setIsRenderedOpen(false);
      return undefined;
    }
    if (skipInitialOpenAnimationRef.current) {
      skipInitialOpenAnimationRef.current = false;
      setIsRenderedOpen(true);
      return undefined;
    }
    let raf1 = null;
    let raf2 = null;
    setIsRenderedOpen(false);
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        setIsRenderedOpen(true);
      });
    });
    return () => {
      if (raf1 !== null) window.cancelAnimationFrame(raf1);
      if (raf2 !== null) window.cancelAnimationFrame(raf2);
    };
  }, [isChatVisible, isOpen]);

  if (!isChatVisible) return null;

  const closeChat = () => {
    if (typeof onCloseSound === "function") {
      onCloseSound();
    }
    setIsChatOpenMobile?.(false);
  };
  const sheetThemeClass = darkMode
    ? "bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] text-amber-50 border-amber-300/70"
    : "bg-[linear-gradient(180deg,rgba(255,250,232,0.97),rgba(226,238,255,0.98))] text-slate-900 border-amber-300/80";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[20050] flex items-start justify-center overflow-hidden"
      data-chat-panel="true"
      style={{
        ...(chatViewportStyle || {}),
        ...(chatOverlayStyle || {}),
        overscrollBehavior: "none",
      }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 transition-opacity"
        style={{
          opacity: isRenderedOpen ? 1 : 0,
          pointerEvents: isRenderedOpen ? "auto" : "none",
          transitionDuration: `${durationMs}ms`,
        }}
        onClick={closeChat}
        aria-label="Fermer le chat"
      />
      <div className="relative w-full pointer-events-none">
        <div
          className={`pointer-events-auto w-full rounded-b-[28px] border-x-2 border-b-2 flex flex-col shadow-2xl ${sheetThemeClass}`}
          style={{
            ...(chatSheetStyle || {}),
            transitionProperty: "transform, opacity, height, max-height",
            transitionDuration: `${durationMs}ms`,
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
            transform: isRenderedOpen ? "translateY(0)" : "translateY(calc(-100% - 24px))",
            opacity: isRenderedOpen ? 1 : 0.94,
            willChange: "transform, opacity, height, max-height",
          }}
        >
          <ChatContent {...props} isOpen={isOpen} closeChat={closeChat} />
        </div>
      </div>
    </div>,
    document.body
  );
}
