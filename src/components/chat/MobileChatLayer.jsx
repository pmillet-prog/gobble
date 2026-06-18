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
    chatKeyboardInsetPx = 0,
    chatMessagesUnreadCount = 0,
    chatOverlayStyle = undefined,
    chatReplyTarget = null,
    chatSheetStyle = undefined,
    chatSystemCount = 0,
    chatTab = "messages",
    chatViewportStyle = undefined,
    closeChatPanel = null,
    cycleChatHistory = null,
    darkMode = false,
    installId = "",
    isChatClosing = false,
    isChatOpenMobile = false,
    isLoggedIn = false,
    isMobileLayout = false,
    isSpecial3WordsMode = false,
    keyboardInsetReservePx = 0,
    mobileChatReactionToasts = [],
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
    showBotMessages = true,
    showBlockedList = false,
    submitChat = null,
    onToggleShowBotMessages = null,
    visibleMessages = [],
  } = props;

  const shouldRender = isMobileLayout && (isLoggedIn || (!isLoggedIn && appView === "home"));
  if (!shouldRender) return null;

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
      chatOverlayStyle={chatOverlayStyle}
      chatViewportStyle={chatViewportStyle}
      chatSheetStyle={chatSheetStyle}
      chatAnimationMs={chatAnimationMs}
      cycleChatHistory={cycleChatHistory}
      darkMode={darkMode}
      hasKeyboardInset={chatKeyboardInsetPx > 0 || keyboardInsetReservePx > 0}
      chatKeyboardInsetPx={chatKeyboardInsetPx}
      keyboardInsetReservePx={keyboardInsetReservePx}
      getAuthorNickClassName={getAuthorNickClassName}
      isChatOpenMobile={isChatOpenMobile}
      isChatClosing={isChatClosing}
      mobileChatUnreadCount={mobileChatUnreadCount}
      mobileReactionToasts={mobileChatReactionToasts}
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
      showBotMessages={showBotMessages}
      setIsChatOpenMobile={closeChatPanel}
      submitChat={submitChat}
      onToggleShowBotMessages={onToggleShowBotMessages}
      showLauncherButton={isLoggedIn && !isSpecial3WordsMode}
      visibleMessages={visibleMessages}
      reactionEmojis={reactionEmojis}
    />
  );
}

export default React.memo(MobileChatLayer);
