import React from "react";
import { createPortal } from "react-dom";
import ChatContent from "./ChatContent";

export default function ChatStyleSlide(props) {
  const {
    darkMode,
    isChatOpenMobile,
    isChatClosing,
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
  const [isRenderedOpen, setIsRenderedOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isChatVisible) {
      setIsRenderedOpen(false);
      return undefined;
    }
    if (!isOpen) {
      setIsRenderedOpen(false);
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

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[20050] flex items-start justify-center overflow-hidden"
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
          className={`pointer-events-auto w-full rounded-b-[28px] border-x border-b flex flex-col shadow-2xl ${
            darkMode
              ? "bg-slate-900/90 text-slate-100 border-slate-700"
              : "bg-white/90 text-slate-900 border-slate-200"
          }`}
          style={{
            ...(chatSheetStyle || {}),
            transitionProperty: "transform, opacity",
            transitionDuration: `${durationMs}ms`,
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
            transform: isRenderedOpen ? "translateY(0)" : "translateY(calc(-100% - 24px))",
            opacity: isRenderedOpen ? 1 : 0.94,
            willChange: "transform, opacity",
          }}
        >
          <ChatContent {...props} isOpen={isOpen} closeChat={closeChat} />
        </div>
      </div>
    </div>,
    document.body
  );
}
