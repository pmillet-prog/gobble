import React from "react";

function MobileChatWidget({
  chatInput,
  chatInputRef,
  chatInputType,
  chatInputDisabled,
  chatInputPlaceholder,
  onChatInputFocus,
  chatOverlayStyle,
  chatViewportStyle,
  chatSheetStyle,
  chatAnimationMs,
  cycleChatHistory,
  darkMode,
  hasKeyboardInset,
  isChatOpenMobile,
  isChatClosing,
  mobileChatUnreadCount,
  blockedCount,
  blockedEntries,
  onToggleBlockedList,
  onUnblockInstallId,
  onOpenChat,
  onOpenRules,
  onOpenUserMenu,
  showBlockedList,
  selfNick,
  selfInstallId,
  setChatInput,
  setIsChatOpenMobile,
  submitChat,
  visibleMessages,
}) {
  const isSystemAuthor = (rawAuthor) => {
    if (!rawAuthor) return false;
    const simplified = String(rawAuthor || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return simplified === "system" || simplified === "systeme";
  };
  const isChatVisible = isChatOpenMobile || isChatClosing;
  const animMs = Number.isFinite(chatAnimationMs) ? chatAnimationMs : 200;
  const overlayAnimationStyle = {
    animation: isChatClosing
      ? `chatOverlayOut ${animMs}ms ease forwards`
      : `chatOverlayIn ${animMs}ms ease`,
  };
  const sheetWrapStyle = {};
  const sheetStyle = {
    ...(chatSheetStyle || {}),
    transition: "height 220ms ease, max-height 220ms ease",
    animation: isChatClosing
      ? `chatSheetOut ${animMs}ms ease forwards`
      : `chatSheetIn ${animMs}ms ease`,
  };
  const handleChatInputKeyDown = (e) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      cycleChatHistory(-1);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      cycleChatHistory(1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submitChat(null);
    }
  };
  const unreadBadge =
    mobileChatUnreadCount > 0 ? (mobileChatUnreadCount >= 10 ? "9+" : String(mobileChatUnreadCount)) : "";
  return (
    <>
      <div className="fixed bottom-4 right-4 z-30">
        <button
          type="button"
          onClick={() => {
            onOpenChat();
          }}
          className="px-3 py-2 rounded-full shadow-lg text-xs font-semibold bg-blue-600 text-white relative inline-flex items-center whitespace-nowrap"
        >
          Chat
          {mobileChatUnreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
          )}
          {mobileChatUnreadCount > 0 && (
            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-[10px] font-extrabold text-white flex items-center justify-center shadow">
              {unreadBadge}
            </span>
          )}
        </button>
      </div>

      {isChatVisible && (
        <div
          className={`fixed left-0 right-0 top-0 z-40 flex items-end justify-center bg-black/40 ${
            hasKeyboardInset ? "" : "chat-safe-bottom"
          }`}
          style={{
            ...(chatViewportStyle || {}),
            ...(chatOverlayStyle || {}),
            ...overlayAnimationStyle,
          }}
        >
          <div className="w-full" style={sheetWrapStyle}>
            <div
              className={`w-full rounded-t-2xl border-t flex flex-col ${
                darkMode
                  ? "bg-slate-900/90 text-slate-100 border-slate-700"
                  : "bg-white/90 text-slate-900 border-slate-200"
              }`}
              style={sheetStyle}
            >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <div className="font-extrabold text-base">Chat</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={`text-[11px] font-semibold ${
                    darkMode ? "text-slate-300" : "text-slate-600"
                  }`}
                  onClick={onOpenRules}
                >
                  Règles
                </button>
                <button
                  type="button"
                  className={`text-[11px] font-semibold ${
                    darkMode ? "text-amber-300" : "text-blue-600"
                  }`}
                  onClick={onToggleBlockedList}
                >
                  Joueurs bloqués ({blockedCount})
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setIsChatOpenMobile(false);
                  }}
                  onClick={(e) => e.preventDefault()}
                  className={`h-10 px-4 text-sm font-semibold rounded-xl border ${
                    darkMode
                      ? "bg-slate-800 border-slate-600 text-slate-100"
                      : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                >
                  Fermer
                </button>
              </div>
            </div>
            <div className="flex flex-col flex-1 min-h-0 px-3 py-2 gap-2">
              {showBlockedList && (
                <div
                  className={`rounded-lg border px-2 py-2 text-[11px] ${
                    darkMode
                      ? "bg-slate-900/70 border-slate-600 text-slate-100"
                      : "bg-gray-50 border-gray-200 text-gray-700"
                  }`}
                >
                  {blockedEntries.length === 0 ? (
                    <div className="text-center">Aucun joueur bloqué.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {blockedEntries.map((entry) => (
                        <div key={entry.id} className="inline-flex items-center gap-2">
                          <span className="font-semibold">{entry.label}</span>
                          <button
                            type="button"
                            className={`text-[11px] font-semibold ${
                              darkMode ? "text-amber-300" : "text-blue-600"
                            }`}
                            onClick={() => onUnblockInstallId(entry.id)}
                          >
                            Réactiver
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse gap-1 text-sm">
                {visibleMessages.length === 0 ? (
                  <div className="text-sm text-slate-400 text-center mt-4">
                    Aucun message pour l'instant.
                  </div>
                ) : (
                  [...visibleMessages].reverse().map((msg) => {
                    const author = (msg.nick || msg.author || "Anonyme").trim();
                    const authorInstallId =
                      typeof msg.installId === "string" ? msg.installId : "";
                    const isYou = authorInstallId
                      ? authorInstallId === selfInstallId
                      : author === selfNick;
                    const isSystem = isSystemAuthor(author);
                    const canOpenMenu =
                      !isSystem &&
                      authorInstallId &&
                      authorInstallId !== selfInstallId;
                    return (
                      <div
                        key={msg.id}
                        className={
                          isSystem
                            ? "px-2 py-0.5 text-sm italic text-orange-700 dark:text-amber-300 self-start"
                            : `px-2 py-1 rounded-lg ${
                                isYou
                                  ? "bg-blue-600 text-white self-end"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 self-start"
                              }`
                        }
                      >
                        {isSystem ? (
                          <span>{msg.text}</span>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            {canOpenMenu ? (
                              <button
                                type="button"
                                className="font-semibold mr-1 hover:underline"
                                onClick={(e) =>
                                  onOpenUserMenu(e, {
                                    nick: author,
                                    installId: authorInstallId,
                                    messageId: msg.id,
                                  })
                                }
                              >
                                {author}:
                              </button>
                            ) : (
                              <span className="font-semibold mr-1">{author}:</span>
                            )}
                            <span>{msg.text}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex items-center gap-2 pt-1 pb-1 border-t border-slate-200 dark:border-slate-700 shrink-0">
                <input
                  type={chatInputType}
                  autoComplete="on"
                  autoCapitalize="on"
                  spellCheck={true}
                  inputMode="text"
                  enterKeyHint="send"
                  data-form-type="other"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  data-autofill="off"
                  aria-autocomplete="none"
                  aria-label="Message du chat"
                  readOnly={chatInputDisabled}
                  aria-disabled={chatInputDisabled}
                  onFocus={onChatInputFocus}
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleChatInputKeyDown}
                  className="flex-1 border rounded px-3 py-2 text-sm ios-input chat-input bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                  placeholder={chatInputPlaceholder}
                />
                <button
                  type="button"
                  className="px-3 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
                  disabled={!chatInput.trim() || chatInputDisabled}
                  onPointerDown={(e) => {
                    if (!chatInput.trim() || chatInputDisabled) return;
                    e.preventDefault();
                    submitChat();
                    if (chatInputRef.current) {
                      try {
                        chatInputRef.current.focus({ preventScroll: true });
                      } catch (_) {
                        chatInputRef.current.focus();
                      }
                    }
                  }}
                  onClick={(e) => e.preventDefault()}
                >
                  Envoyer
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}
    </>
  );
}

export default React.memo(MobileChatWidget);
