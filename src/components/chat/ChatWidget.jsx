import React from "react";
import { createPortal } from "react-dom";
import ChatStyleSlide from "./ChatStyleSlide";
import { UI_IMAGE_KEYS, getUiImageUrl } from "../../assets/uiAssetManifest.js";

export default function ChatWidget(props) {
  const {
    chatInput = "",
    setChatInput = null,
    submitChat = null,
    chatEditTarget = null,
    chatReplyTarget = null,
    showLauncherButton = true,
    mobileChatUnreadIsBotOnly = false,
    mobileChatUnreadCount = 0,
    onOpenChat,
    ...restProps
  } = props;
  const [mobileDraftInput, setMobileDraftInput] = React.useState(() => String(chatInput || ""));

  React.useEffect(() => {
    const nextValue = String(chatInput || "");
    setMobileDraftInput((prev) => (prev === nextValue ? prev : nextValue));
  }, [chatInput]);

  const handleMobileDraftChange = React.useCallback(
    (value) => {
      const nextValue = String(value ?? "");
      setMobileDraftInput(nextValue);
      setChatInput?.(nextValue);
    },
    [setChatInput]
  );

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
      ? mobileChatUnreadIsBotOnly
        ? "?"
        : mobileChatUnreadCount >= 10
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
            <button
              type="button"
              onClick={() => onOpenChat?.()}
              aria-label="Ouvrir le chat"
              data-chat-launcher-button="true"
              className="relative inline-flex items-center justify-center select-none"
              style={chatButtonStyle}
            >
              <img
                src={getUiImageUrl(UI_IMAGE_KEYS.live.chat)}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-contain drop-shadow-md"
                draggable="false"
              />
              {mobileChatUnreadCount > 0 ? (
                <span
                  className={`absolute h-3.5 w-3.5 rounded-full animate-pulse ${
                    mobileChatUnreadIsBotOnly ? "bg-amber-300" : "bg-amber-400"
                  }`}
                  style={{
                    top: "12%",
                    right: "12%",
                    transform: "translate(36%, -36%)",
                  }}
                />
              ) : null}
              {mobileChatUnreadCount > 0 ? (
                <span
                  className={`absolute min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-extrabold flex items-center justify-center shadow-md ${
                    mobileChatUnreadIsBotOnly
                      ? "bg-amber-400 text-slate-950"
                      : "bg-red-600 text-white"
                  }`}
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
      {launcher}
      <ChatStyleSlide
        {...restProps}
        chatEditTarget={chatEditTarget}
        chatInput={mobileDraftInput}
        chatReplyTarget={chatReplyTarget}
        mobileChatUnreadCount={mobileChatUnreadCount}
        onOpenChat={onOpenChat}
        setChatInput={handleMobileDraftChange}
        showLauncherButton={showLauncherButton}
        submitChat={handleMobileSubmit}
      />
    </>
  );
}
