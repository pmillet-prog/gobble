import React from "react";
import ChatContent from "./ChatContent";

export default function ChatStyleSlide(props) {
  const {
    darkMode,
    hasKeyboardInset,
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
  if (!isChatVisible) return null;

  const isOpen = isChatOpenMobile && !isChatClosing;
  const durationMs = Number.isFinite(chatAnimationMs) ? chatAnimationMs : 220;
  const closeChat = () => {
    if (typeof onCloseSound === "function") {
      onCloseSound();
    }
    setIsChatOpenMobile?.(false);
  };

  return (
    <div
      className={`fixed left-0 right-0 top-0 z-[20050] flex items-end justify-center ${
        hasKeyboardInset ? "" : "chat-safe-bottom"
      }`}
      style={{
        ...(chatViewportStyle || {}),
        ...(chatOverlayStyle || {}),
      }}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/40 transition-opacity"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transitionDuration: `${durationMs}ms`,
        }}
        onClick={closeChat}
        aria-label="Fermer le chat"
      />
      <div className="w-full relative">
        <div
          className={`w-full rounded-t-2xl border-t flex flex-col ${
            darkMode
              ? "bg-slate-900/90 text-slate-100 border-slate-700"
              : "bg-white/90 text-slate-900 border-slate-200"
          }`}
          style={{
            ...(chatSheetStyle || {}),
            transitionProperty: "transform, opacity",
            transitionDuration: `${durationMs}ms`,
            transitionTimingFunction: "ease",
            transform: isOpen ? "translateY(0)" : "translateY(100%)",
            opacity: isOpen ? 1 : 0.96,
          }}
        >
          <ChatContent {...props} isOpen={isOpen} closeChat={closeChat} />
        </div>
      </div>
    </div>
  );
}
