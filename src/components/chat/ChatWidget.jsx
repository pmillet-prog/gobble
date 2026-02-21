import React from "react";
import ChatStyleSlide from "./ChatStyleSlide";

export default function ChatWidget(props) {
  const {
    showLauncherButton = true,
    mobileChatUnreadCount = 0,
    onOpenChat,
  } = props;

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

  return (
    <>
      {showLauncherButton ? (
        <div
          className="fixed z-[20050]"
          style={{
            right: "max(10px, 2.8vw)",
            bottom: "max(14px, calc(env(safe-area-inset-bottom) + 4.2vh))",
          }}
        >
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
        </div>
      ) : null}

      <ChatStyleSlide {...props} />
    </>
  );
}
