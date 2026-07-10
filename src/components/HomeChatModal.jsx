import React from "react";
import { createPortal } from "react-dom";

import ChatContent from "./chat/ChatContent.jsx";

export default function HomeChatModal({
  darkMode = false,
  onClose = null,
  open = false,
  ...chatContentProps
}) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const panelClass = darkMode
    ? "bg-[linear-gradient(180deg,rgba(18,47,103,0.96),rgba(7,22,55,0.98))] border-amber-300/70 text-amber-50"
    : "bg-[linear-gradient(180deg,rgba(255,250,232,0.98),rgba(226,238,255,0.99))] border-amber-300/80 text-slate-900";

  return createPortal(
    <div className="fixed inset-0 z-[12130] flex items-center justify-center px-3 py-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={() => onClose?.()}
        aria-label="Fermer le chat"
      />
      <div
        role="dialog"
        aria-modal="true"
        data-chat-panel="true"
        className={`relative flex h-[min(760px,calc(100dvh-32px))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border-2 shadow-2xl ${panelClass}`}
      >
        <ChatContent
          {...chatContentProps}
          darkMode={darkMode}
          isOpen={open}
          closeChat={onClose}
        />
      </div>
    </div>,
    document.body
  );
}
