import React from "react";

import ChatWidget from "./ChatWidget.jsx";

function MobileChatLayer(props) {
  const {
    appView = "",
    blockedCount = 0,
    blockedEntries = [],
    chatAnimationMs = 220,
    chatEditTarget = null,
    chatInput = "",
    chatInputDisabled = false,
    chatFocusPreserveKey = "",
    chatInputPlaceholder = "",
    chatInputRef = null,
    chatInputType = "text",
    chatOpenedAtMs = 0,
    chatMessagesUnreadCount = 0,
    chatReplyTarget = null,
    chatSystemCount = 0,
    chatTab = "messages",
    chatTopInsetPx = 0,
    closeChatPanel = null,
    cycleChatHistory = null,
    darkMode = false,
    installId = "",
    isChatClosing = false,
    isChatOpenMobile = false,
    isLoggedIn = false,
    isMobileLayout = false,
    isSpecial3WordsMode = false,
    mobileChatUnreadIsBotOnly = false,
    mobileChatUnreadCount = 0,
    getAuthorNickClassName = null,
    onChangeChatTab = null,
    onChatInputFocus = null,
    onClearChatEdit = null,
    onClearChatReply = null,
    onCloseSound = null,
    onDeleteOwnMessage = null,
    onEditOwnMessage = null,
    onOpenChat = null,
    onOpenRules = null,
    onOpenUserMenu = null,
    onReactToMessage = null,
    onSelectChatReply = null,
    onToggleBlockedList = null,
    onUnblockInstallId = null,
    reactionEmojis = [],
    selfNick = "",
    setChatInput = null,
    showLauncherButton = true,
    showBlockedList = false,
    submitChat = null,
  } = props;

  const shouldRender = isMobileLayout && (isLoggedIn || (!isLoggedIn && appView === "home"));
  if (!shouldRender) return null;

  // ChatContent owns the live message subscription. Forwarding the root snapshot
  // here would freeze the open drawer until GobbleApplication renders again.
  return (
    <ChatWidget
      chatInput={chatInput}
      chatFocusPreserveKey={chatFocusPreserveKey}
      chatInputRef={chatInputRef}
      chatInputType={chatInputType}
      chatInputDisabled={chatInputDisabled}
      chatInputPlaceholder={chatInputPlaceholder}
      chatOpenedAtMs={chatOpenedAtMs}
      chatEditTarget={chatEditTarget}
      chatReplyTarget={chatReplyTarget}
      chatTab={chatTab}
      onChangeChatTab={onChangeChatTab}
      onClearChatEdit={onClearChatEdit}
      onClearChatReply={onClearChatReply}
      onDeleteOwnMessage={onDeleteOwnMessage}
      onEditOwnMessage={onEditOwnMessage}
      onSelectChatReply={onSelectChatReply}
      onReactToMessage={onReactToMessage}
      messagesUnreadCount={chatMessagesUnreadCount}
      systemCount={chatSystemCount}
      onChatInputFocus={onChatInputFocus}
      chatTopInsetPx={chatTopInsetPx}
      chatAnimationMs={chatAnimationMs}
      cycleChatHistory={cycleChatHistory}
      darkMode={darkMode}
      getAuthorNickClassName={getAuthorNickClassName}
      isChatOpenMobile={isChatOpenMobile}
      isChatClosing={isChatClosing}
      mobileChatUnreadIsBotOnly={mobileChatUnreadIsBotOnly}
      mobileChatUnreadCount={mobileChatUnreadCount}
      blockedCount={blockedCount}
      blockedEntries={blockedEntries}
      onToggleBlockedList={onToggleBlockedList}
      onUnblockInstallId={onUnblockInstallId}
      onOpenChat={onOpenChat}
      onOpenRules={onOpenRules}
      onCloseSound={onCloseSound}
      onOpenUserMenu={onOpenUserMenu}
      showBlockedList={showBlockedList}
      selfNick={selfNick}
      selfInstallId={installId}
      setChatInput={setChatInput}
      setIsChatOpenMobile={closeChatPanel}
      submitChat={submitChat}
      showLauncherButton={showLauncherButton && isLoggedIn && !isSpecial3WordsMode}
      reactionEmojis={reactionEmojis}
    />
  );
}

export default React.memo(MobileChatLayer);
