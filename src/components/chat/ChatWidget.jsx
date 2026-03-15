import React from "react";
import { createPortal } from "react-dom";
import ChatStyleSlide from "./ChatStyleSlide";

export default function ChatWidget(props) {
  const {
    chatInput = "",
    setChatInput = null,
    submitChat = null,
    chatEditTarget = null,
    chatReplyTarget = null,
    showLauncherButton = true,
    mobileChatUnreadCount = 0,
    mobileReactionToasts = [],
    onOpenChat,
    ...restProps
  } = props;
  const [mobileDraftInput, setMobileDraftInput] = React.useState(() => String(chatInput || ""));

  React.useEffect(() => {
    const nextValue = String(chatInput || "");
    setMobileDraftInput((prev) => (prev === nextValue ? prev : nextValue));
  }, [chatInput, chatEditTarget?.id, chatReplyTarget?.id]);

  const handleMobileDraftChange = React.useCallback((value) => {
    setMobileDraftInput(String(value ?? ""));
  }, []);

  const handleMobileSubmit = React.useCallback(
    (event, forcedText = null) => {
      const text = forcedText ?? mobileDraftInput;
      const didSend = typeof submitChat === "function" ? submitChat(event, text) : false;
      if (didSend === false) return false;
      setMobileDraftInput("");
      setChatInput?.("");
      return true;
    },
    [mobileDraftInput, setChatInput, submitChat]
  );

  const unreadBadge =
    mobileChatUnreadCount > 0
      ? mobileChatUnreadCount >= 10
        ? "9+"
        : String(mobileChatUnreadCount)
      : "";
  const chatButtonStyle = {
    width: "clamp(64px, 15vw, 82px)",
    height: "clamp(64px, 15vw, 82px)",
  };
  const launcher =
    showLauncherButton && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed z-[20050]"
            style={{
              right: "max(10px, 2.8vw)",
              bottom: "max(14px, calc(env(safe-area-inset-bottom) + 4.2vh))",
            }}
          >
            <div className="pointer-events-none absolute inset-x-0 bottom-full mb-1">
              {mobileReactionToasts.map((toast, idx) => (
                <div
                  key={toast.id || `${toast.emoji}-${idx}`}
                  className="absolute left-1/2 rounded-full border border-white/70 bg-white/95 px-2.5 py-1 text-lg shadow-lg backdrop-blur-sm"
                  style={{
                    bottom: `${idx * 22}px`,
                    animation: "chatReactionToastFloat 1800ms ease-out forwards",
                  }}
                  aria-hidden="true"
                >
                  {toast.emoji}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onOpenChat?.()}
              aria-label="Ouvrir le chat"
              className="relative inline-flex items-center justify-center select-none"
              style={chatButtonStyle}
            >
              <img
                src="/buttons/chat.png"
                alt=""
                aria-hidden="true"
                className="h-full w-full object-contain drop-shadow-md"
                draggable="false"
              />
              {mobileChatUnreadCount > 0 ? (
                <span
                  className="absolute h-3.5 w-3.5 rounded-full bg-amber-400 animate-pulse"
                  style={{
                    top: "12%",
                    right: "12%",
                    transform: "translate(36%, -36%)",
                  }}
                />
              ) : null}
              {mobileChatUnreadCount > 0 ? (
                <span
                  className="absolute min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-600 text-[11px] font-extrabold text-white flex items-center justify-center shadow-md"
                  style={{
                    top: "10%",
                    right: "10%",
                    transform: "translate(42%, -42%)",
                  }}
                >
                  {unreadBadge}
                </span>
              ) : null}
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <style>{`
        @keyframes chatReactionToastFloat {
          0% {
            opacity: 0;
            transform: translate(-50%, 10px) scale(0.86);
          }
          15% {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
          72% {
            opacity: 1;
            transform: translate(-50%, -34px) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(-50%, -56px) scale(0.96);
          }
        }
      `}</style>
      {launcher}
      <ChatStyleSlide
        {...restProps}
        chatEditTarget={chatEditTarget}
        chatInput={mobileDraftInput}
        chatReplyTarget={chatReplyTarget}
        mobileChatUnreadCount={mobileChatUnreadCount}
        mobileReactionToasts={mobileReactionToasts}
        onOpenChat={onOpenChat}
        setChatInput={handleMobileDraftChange}
        showLauncherButton={showLauncherButton}
        submitChat={handleMobileSubmit}
      />
    </>
  );
}
