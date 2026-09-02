import React from "react";
import ChatContent from "../chat/ChatContent.jsx";
import { isChatBotMessage } from "../chat/chatBotVisibility.js";
import {
  getLiveBackgroundKey,
  getUiImageUrl,
} from "../../assets/uiAssetManifest.js";

const styles = `
.live-salon-scene {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #120b06;
  isolation: isolate;
  touch-action: manipulation;
}
.live-salon-scene-fullscreen {
  position: fixed;
  inset: 0;
  width: 100vw;
  min-height: 100svh;
  height: 100svh;
}
.live-salon-stage {
  position: absolute;
  inset: 0;
}
.live-salon-backdrop,
.live-salon-backdrop img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}
.live-salon-backdrop {
  z-index: 0;
  pointer-events: none;
  user-select: none;
}
.live-salon-backdrop img {
  object-fit: fill;
}
.live-salon-keyboard-open .live-salon-backdrop {
  transform: translateY(var(--salon-vv-offset-top, 0px));
}
.live-salon-slot {
  position: absolute;
  z-index: 3;
}
.live-salon-top {
  left: 2.6%;
  right: 2.6%;
  top: 2.2%;
}
.live-salon-ready {
  left: 50%;
  top: 1%;
  width: 40%;
  transform: translateX(-50%);
}
.live-salon-training {
  left: 3%;
  bottom: 4%;
  width: 24%;
}
.live-salon-info {
  right: 3%;
  bottom: 4%;
  width: 24%;
}
.live-salon-players {
  right: 3%;
  top: 32%;
  width: 22%;
}
.live-salon-utilities {
  right: 2.5%;
  top: 36.5%;
  width: clamp(68px, 7.8%, 128px);
}
.live-salon-notebook {
  position: absolute;
  z-index: 2;
  left: 23.5%;
  top: 36.4%;
  width: 53%;
  height: 48.3%;
  transform: perspective(45vh) rotateX(10deg);
  transform-origin: center center;
  color: #5b3518;
  pointer-events: auto;
}
.live-salon-notebook .chat-content {
  font-family: "GobbleCaveat", "Caveat", "Segoe Script", "Lucida Handwriting", "Bradley Hand ITC", "Segoe Print", cursive;
  color: #572000;
}
.live-salon-notebook .chat-content-header,
.live-salon-notebook .chat-content-toolbar,
.live-salon-notebook .chat-content-blocked {
  display: none !important;
}
.live-salon-notebook .chat-content-body {
  gap: 0 !important;
  padding: 1% 1% 0 !important;
}
.live-salon-notebook .chat-content-messages {
  gap: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  padding: 0 1.5% 2% !important;
  color: #572000 !important;
  font-size: clamp(12px, 1.18vw, 21px) !important;
  line-height: 1.45;
  box-shadow: none !important;
  scrollbar-width: none;
}
.live-salon-notebook .chat-content-messages::-webkit-scrollbar {
  width: 0;
  height: 0;
}
.live-salon-notebook .chat-content-messages > [data-chat-system],
.live-salon-notebook .chat-content-messages > [data-chat-ambient],
.live-salon-notebook .chat-content-messages > [data-chat-own] {
  align-self: stretch !important;
  width: 100%;
  margin: 0 0 0.42em !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  padding: 0 !important;
  color: #572000 !important;
  box-shadow: none !important;
}
.live-salon-notebook .chat-content-messages > [data-chat-own="true"] {
  color: #174f9c !important;
}
.live-salon-notebook .chat-message-author {
  font-weight: 950 !important;
  letter-spacing: 0.035em;
  text-shadow: 0 0.4px 0 currentColor;
}
.live-salon-notebook .chat-message-text {
  font-weight: 400 !important;
  letter-spacing: 0.005em;
}
.live-salon-notebook .chat-message-reply-preview,
.live-salon-notebook .chat-content-reply-target {
  position: relative;
  margin: 0.15em 0 0.38em !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: rgba(50, 56, 82, 0.82) !important;
  padding: 0.3em 0.4em 0.3em 2.15em !important;
  font-style: italic;
  box-shadow: none !important;
}
.live-salon-notebook .chat-message-reply-preview::before,
.live-salon-notebook .chat-content-reply-target::before {
  position: absolute;
  color: #174f9c;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 2.7em;
  font-weight: 900;
  line-height: 0.75;
  opacity: 0.78;
}
.live-salon-notebook .chat-message-reply-preview::before,
.live-salon-notebook .chat-content-reply-target::before {
  content: "“";
  left: 0.08em;
  top: 0.05em;
}
.live-salon-notebook .chat-quote-close {
  display: inline;
  margin-left: 0.08em;
  color: #174f9c;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.75em;
  font-weight: 900;
  line-height: 0;
  vertical-align: -0.18em;
  opacity: 0.78;
}
.live-salon-notebook .chat-content-reply-target button {
  border: 0 !important;
  background: transparent !important;
  color: #174f9c !important;
}
.live-salon-notebook .chat-message-reaction-trigger {
  border-color: transparent !important;
  background: transparent !important;
  box-shadow: none !important;
  color: #632900 !important;
  opacity: 0.82;
}
.live-salon-notebook .chat-message-edit-trigger {
  border: 0 !important;
  background: transparent !important;
  color: #174f9c !important;
  opacity: 0.72;
  transform: rotate(-8deg);
  transition: opacity 150ms ease, transform 150ms ease;
}
.live-salon-notebook .chat-message-edit-trigger:hover {
  opacity: 1;
  transform: rotate(-3deg) scale(1.08);
}
.live-salon-notebook .chat-message-reaction-badge {
  border: 1px dashed rgba(88, 38, 7, 0.48) !important;
  background: transparent !important;
  color: #632900 !important;
  box-shadow: none !important;
}
.live-salon-notebook .chat-message-reaction-emoji,
.chat-reaction-portal-notebook .chat-reaction-choice-ink,
.chat-reaction-portal-notebook .chat-reaction-details-emoji {
  display: inline-block;
  color: #632900 !important;
  filter: grayscale(1) sepia(1) saturate(3.2) hue-rotate(338deg) brightness(0.5) contrast(1.12);
  mix-blend-mode: multiply;
  text-shadow: 0.35px 0 #632900, -0.2px 0.25px #632900;
}
.live-salon-notebook .notebook-reaction-openmoji,
.chat-reaction-portal-notebook .notebook-reaction-openmoji {
  display: inline-block;
  width: 1.15em;
  height: 1.15em;
  flex: 0 0 auto;
  vertical-align: -0.18em;
  background: #632900;
  -webkit-mask: var(--notebook-reaction-mask) center / contain no-repeat;
  mask: var(--notebook-reaction-mask) center / contain no-repeat;
  filter: none !important;
  mix-blend-mode: multiply;
  text-shadow: none;
}
.chat-reaction-portal-notebook .chat-reaction-picker,
.chat-reaction-portal-notebook .chat-reaction-details-panel {
  border: 1px dashed rgba(77, 49, 20, 0.55) !important;
  background: rgba(255, 246, 211, 0.97) !important;
  color: #174f9c !important;
  font-family: "GobbleCaveat", "Caveat", "Segoe Print", cursive;
  box-shadow: 0 8px 24px rgba(42, 22, 5, 0.3) !important;
}
.chat-reaction-portal-notebook .chat-reaction-choice {
  border: 0 !important;
  background: transparent !important;
  filter: none;
}
.chat-reaction-portal-notebook .chat-reaction-choice:nth-child(3n + 1) .chat-reaction-choice-ink {
  transform: rotate(-5deg) scale(1.04);
}
.chat-reaction-portal-notebook .chat-reaction-choice:nth-child(3n + 2) .chat-reaction-choice-ink {
  transform: rotate(3deg) scale(0.97);
}
.chat-reaction-portal-notebook .chat-reaction-choice:nth-child(3n) .chat-reaction-choice-ink {
  transform: rotate(-1deg) scale(1.01);
}
.live-salon-notebook .chat-content-compose {
  margin-left: 7%;
  margin-right: 1.5%;
  color: #572000;
}
.live-salon-notebook .chat-content-compose-row {
  border-color: rgba(105, 64, 24, 0.28) !important;
}
.live-salon-notebook .chat-content-input {
  min-height: 38px !important;
  max-height: 92px !important;
  border: 0 !important;
  border-bottom: 1px solid rgba(105, 64, 24, 0.42) !important;
  border-radius: 0 !important;
  background: rgba(255, 244, 205, 0.22) !important;
  color: #542000 !important;
  -webkit-text-fill-color: #542000 !important;
  caret-color: #b30b18;
  padding: 5px 4px 3px !important;
  font: inherit;
  font-size: clamp(16px, 1.05vw, 20px) !important;
  box-shadow: none !important;
}
.live-salon-notebook .chat-content-input::placeholder {
  color: rgba(78, 37, 10, 0.62) !important;
  -webkit-text-fill-color: rgba(78, 37, 10, 0.62) !important;
}
.live-salon-notebook .chat-content-send {
  border-color: rgba(105, 64, 24, 0.34) !important;
  background: rgba(244, 207, 127, 0.5) !important;
  color: #572000 !important;
  font-weight: 900;
}
@media (max-aspect-ratio: 1/1) {
.live-salon-scene .live-salon-top {
  left: 4%;
  right: 4%;
  top: calc(1.4% + env(safe-area-inset-top));
}
.live-salon-scene .live-salon-ready {
  left: 50%;
  top: 1%;
  width: 80%;
  transform: translateX(-50%);
}
.live-salon-scene .live-salon-training {
  left: 4.2%;
  bottom: calc(1.9% + env(safe-area-inset-bottom));
  width: 43%;
}
.live-salon-scene .live-salon-info {
  display: none;
}
.live-salon-scene .live-salon-players {
  right: 4.2%;
  top: auto;
  bottom: calc(1.9% + env(safe-area-inset-bottom));
  width: 47%;
}
.live-salon-scene .live-salon-utilities {
  left: 10%;
  right: 10%;
  top: 14.2%;
  width: auto;
}
.live-salon-scene .live-salon-notebook {
  left: 12.5%;
  top: 21.7%;
  width: 75%;
  height: 48%;
  transform: perspective(70vh) rotateX(10deg);
}
.live-salon-scene .live-salon-notebook .chat-content-messages {
  font-size: clamp(14px, 3.5vw, 20px) !important;
  padding-bottom: 1.5em !important;
}
.live-salon-scene .live-salon-notebook .chat-content-compose {
  margin-left: 2%;
  margin-right: 2%;
}
.live-salon-scene.live-salon-keyboard-open .live-salon-notebook {
  transform: none;
}
.live-salon-scene.live-salon-keyboard-open .chat-content-messages {
  padding-bottom: 6em !important;
  transform: perspective(70vh) rotateX(10deg);
  transform-origin: center center;
  backface-visibility: hidden;
}
.live-salon-scene.live-salon-keyboard-open .chat-content-compose {
  position: fixed;
  z-index: 50;
  left: 4vw;
  right: 4vw;
  bottom: calc(var(--salon-keyboard-inset, 0px) + 10px);
  margin: 0;
  padding: 8px 10px;
  border: 1px solid rgba(121, 71, 23, 0.46);
  border-radius: 14px;
  background: rgba(255, 244, 207, 0.98);
  color: #542000;
  box-shadow: 0 8px 26px rgba(22, 10, 2, 0.38);
}
.live-salon-scene.live-salon-keyboard-open .chat-content-compose-row {
  border-top: 0 !important;
}
.live-salon-scene.live-salon-keyboard-open .chat-content-input {
  background: #fff8df !important;
}
}
@media (max-width: 860px) and (min-aspect-ratio: 1/1) {
  .live-salon-scene .live-salon-ready {
    width: 40%;
  }
  .live-salon-scene .live-salon-players {
    display: none;
  }
}
`;

export default function LiveSalonScene({
  blockedCount = 0,
  blockedEntries = [],
  chatEditTarget = null,
  chatInput = "",
  chatInputDisabled = false,
  chatInputPlaceholder = "Message",
  chatInputRef = null,
  chatReplyTarget = null,
  chatTab = "messages",
  className = "",
  cycleChatHistory = null,
  darkMode = false,
  getAuthorNickClassName = null,
  infoControls = null,
  messagesUnreadCount = 0,
  onChangeChatTab = null,
  onChatInputFocus = null,
  onClearChatEdit = null,
  onClearChatReply = null,
  onDeleteOwnMessage = null,
  onEditOwnMessage = null,
  onOpenRules = null,
  onOpenUserMenu = null,
  onReactToMessage = null,
  onSelectChatReply = null,
  onToggleBlockedList = null,
  onUnblockInstallId = null,
  onUserActivity = null,
  playersControls = null,
  reactionEmojis = [],
  salonControls = null,
  selfInstallId = "",
  selfNick = "",
  setChatInput = null,
  showBlockedList = false,
  submitChat = null,
  team = null,
  topControls = null,
  trainingControls = null,
  utilityControls = null,
  visibleMessages = [],
}) {
  const sceneRef = React.useRef(null);
  const safeMessages = React.useMemo(
    () =>
      (Array.isArray(visibleMessages) ? visibleMessages : []).filter(
        (message) => !isChatBotMessage(message)
      ),
    [visibleMessages]
  );
  const desktopBackgroundUrl = getUiImageUrl(getLiveBackgroundKey(team, "wide"));
  const mobileBackgroundUrl = getUiImageUrl(getLiveBackgroundKey(team, "tall"));

  React.useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || typeof window === "undefined") return undefined;
    if (!window.matchMedia("(max-aspect-ratio: 1/1) and (pointer: coarse)").matches) {
      return undefined;
    }
    const visualViewport = window.visualViewport;
    let frameId = null;
    let baselineWidth = Math.round(window.innerWidth || visualViewport?.width || 0);
    let baselineHeight = Math.round(
      Math.max(
        window.innerHeight || 0,
        (visualViewport?.height || 0) + (visualViewport?.offsetTop || 0)
      )
    );

    const update = () => {
      frameId = null;
      const width = Math.round(window.innerWidth || visualViewport?.width || 0);
      const offsetTop = Math.max(0, Math.round(visualViewport?.offsetTop || 0));
      const viewportHeight = Math.round(visualViewport?.height || window.innerHeight || 0);
      const visibleBottom = offsetTop + viewportHeight;
      if (Math.abs(width - baselineWidth) > 72) {
        baselineWidth = width;
        baselineHeight = Math.max(visibleBottom, Math.round(window.innerHeight || 0));
      } else if (visibleBottom >= baselineHeight - 48) {
        baselineHeight = Math.max(baselineHeight, visibleBottom);
      }
      const keyboardInset = Math.max(0, baselineHeight - visibleBottom);
      const keyboardThreshold = Math.max(110, Math.round(baselineHeight * 0.17));
      const keyboardOpen = keyboardInset >= keyboardThreshold;
      scene.style.setProperty("--salon-vv-offset-top", `${offsetTop}px`);
      scene.style.setProperty(
        "--salon-keyboard-inset",
        `${keyboardOpen ? keyboardInset : 0}px`
      );
      scene.classList.toggle("live-salon-keyboard-open", keyboardOpen);
    };

    const scheduleUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    visualViewport?.addEventListener("resize", scheduleUpdate);
    visualViewport?.addEventListener("scroll", scheduleUpdate);
    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      visualViewport?.removeEventListener("resize", scheduleUpdate);
      visualViewport?.removeEventListener("scroll", scheduleUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      scene.classList.remove("live-salon-keyboard-open");
      scene.style.removeProperty("--salon-vv-offset-top");
      scene.style.removeProperty("--salon-keyboard-inset");
    };
  }, []);

  return (
    <div
      ref={sceneRef}
      className={`live-salon-scene ${className}`}
    >
      <style>{styles}</style>
      <div className="live-salon-stage">
        <picture className="live-salon-backdrop" aria-hidden="true">
          <source media="(min-aspect-ratio: 1/1)" srcSet={desktopBackgroundUrl} />
          <img
            src={mobileBackgroundUrl}
            alt=""
            decoding="async"
            fetchPriority="high"
            draggable="false"
          />
        </picture>
        {topControls ? <div className="live-salon-slot live-salon-top">{topControls}</div> : null}
        {salonControls ? (
          <div className="live-salon-slot live-salon-ready">{salonControls}</div>
        ) : null}
        {trainingControls ? (
          <div className="live-salon-slot live-salon-training">{trainingControls}</div>
        ) : null}
        {infoControls ? <div className="live-salon-slot live-salon-info">{infoControls}</div> : null}
        {playersControls ? (
          <div className="live-salon-slot live-salon-players">{playersControls}</div>
        ) : null}
        {utilityControls ? (
          <div className="live-salon-slot live-salon-utilities">{utilityControls}</div>
        ) : null}

        <div className="live-salon-notebook" aria-label="Chat du salon">
          <ChatContent
            blockedCount={blockedCount}
            blockedEntries={blockedEntries}
            chatEditTarget={chatEditTarget}
            chatInput={chatInput}
            chatInputDisabled={chatInputDisabled}
            chatInputPlaceholder={chatInputPlaceholder}
            chatInputRef={chatInputRef}
            chatReplyTarget={chatReplyTarget}
            chatTab={chatTab}
            closeChat={null}
            cycleChatHistory={cycleChatHistory}
            darkMode={darkMode}
            getAuthorNickClassName={getAuthorNickClassName}
            isOpen={true}
            keyboardInsetReservePx={0}
            messagesUnreadCount={messagesUnreadCount}
            onChangeChatTab={onChangeChatTab}
            onChatInputFocus={onChatInputFocus}
            onClearChatEdit={onClearChatEdit}
            onClearChatReply={onClearChatReply}
            onDeleteOwnMessage={onDeleteOwnMessage}
            onEditOwnMessage={onEditOwnMessage}
            onOpenRules={onOpenRules}
            onOpenUserMenu={onOpenUserMenu}
            onReactToMessage={onReactToMessage}
            onSelectChatReply={onSelectChatReply}
            onToggleBlockedList={onToggleBlockedList}
            onUnblockInstallId={onUnblockInstallId}
            onUserActivity={onUserActivity}
            reactionEmojis={reactionEmojis}
            selfInstallId={selfInstallId}
            selfNick={selfNick}
            setChatInput={setChatInput}
            showBlockedList={showBlockedList}
            showBotMessages={false}
            submitChat={submitChat}
            variant="notebook"
            visibleMessages={safeMessages}
          />
        </div>
      </div>
    </div>
  );
}
