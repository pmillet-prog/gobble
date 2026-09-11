import React from "react";
import { createPortal } from "react-dom";
import ChatContent from "./ChatContent";
import useChatViewport, {
  computeChatKeyboardSessionTransition,
} from "./useChatViewport.js";

export default function ChatStyleSlide(props) {
  const {
    darkMode,
    isChatOpenMobile,
    isChatClosing,
    chatOpenedAtMs,
    chatAnimationMs,
    chatTopInsetPx = 0,
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
  const {
    keyboardConstrained,
    keyboardInsetPx,
    keyboardOpen,
    keyboardVisible,
    overlayStyle,
    sheetStyle,
  } = useChatViewport({
    enabled: isChatVisible,
    frozen: isChatClosing,
    topInsetPx: chatTopInsetPx,
  });
  const keyboardSessionSeenRef = React.useRef(false);

  const closeChat = React.useCallback(() => {
    if (typeof onCloseSound === "function") {
      onCloseSound();
    }
    setIsChatOpenMobile?.(false);
  }, [onCloseSound, setIsChatOpenMobile]);

  React.useLayoutEffect(() => {
    const transition = computeChatKeyboardSessionTransition({
      isChatOpen: isOpen,
      keyboardOpen,
      keyboardWasOpen: keyboardSessionSeenRef.current,
    });
    keyboardSessionSeenRef.current = transition.keyboardWasOpen;
    if (!transition.shouldCloseChat) return;
    setIsRenderedOpen(false);
    closeChat();
  }, [closeChat, isOpen, keyboardOpen]);

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

  const sheetThemeClass = darkMode
    ? "bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] text-amber-50 border-amber-300/70"
    : "bg-[linear-gradient(180deg,rgba(255,250,232,0.97),rgba(226,238,255,0.98))] text-slate-900 border-amber-300/80";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[20050] flex items-start justify-center overflow-hidden"
      data-chat-panel="true"
      style={{
        ...overlayStyle,
        overscrollBehavior: "none",
        paddingTop: chatTopInsetPx
          ? `${Math.max(0, chatTopInsetPx)}px`
          : undefined,
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
            ...(sheetStyle || {}),
            boxSizing: "border-box",
            paddingBottom: keyboardConstrained
              ? "max(6px, env(safe-area-inset-bottom, 0px))"
              : undefined,
            transitionProperty: keyboardVisible
              ? "transform, opacity"
              : "transform, opacity, height, max-height",
            transitionDuration: `${durationMs}ms`,
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
            transform: isRenderedOpen ? "translateY(0)" : "translateY(calc(-100% - 24px))",
            opacity: isRenderedOpen ? 1 : 0.94,
            willChange: "transform, opacity, height, max-height",
          }}
        >
          <ChatContent
            {...props}
            chatKeyboardInsetPx={keyboardInsetPx}
            keyboardInsetReservePx={0}
            isOpen={isOpen}
            closeChat={closeChat}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
