import React, { useEffect, useRef } from "react";

function setCompositeRef(targetRef, value) {
  if (typeof targetRef === "function") {
    targetRef(value);
    return;
  }
  if (targetRef && typeof targetRef === "object") {
    targetRef.current = value;
  }
}

function isSystemAuthor(rawAuthor) {
  if (!rawAuthor) return false;
  const simplified = String(rawAuthor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return simplified === "system" || simplified === "systeme";
}

function formatUnreadSuffix(unreadCount) {
  const value = Number(unreadCount) || 0;
  if (value <= 0) return "";
  if (value >= 10) return " (9+)";
  return ` (${value})`;
}

export default function ChatContent({
  darkMode,
  isOpen,
  closeChat,
  chatTab,
  chatKeyboardInsetPx = 0,
  keyboardInsetReservePx = 0,
  onChangeChatTab,
  messagesUnreadCount,
  visibleMessages,
  showBlockedList,
  blockedEntries,
  blockedCount,
  onToggleBlockedList,
  onUnblockInstallId,
  onOpenRules,
  onOpenUserMenu,
  selfNick,
  selfInstallId,
  chatInput,
  setChatInput,
  chatInputRef,
  chatInputDisabled,
  chatInputPlaceholder,
  onChatInputFocus,
  submitChat,
  cycleChatHistory,
}) {
  const isSystemTab = chatTab === "system";
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const localTextareaRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    let raf1 = null;
    let raf2 = null;
    let timeout1 = null;
    let timeout2 = null;
    const scrollToBottom = () => {
      const listEl = messagesListRef.current;
      if (listEl) {
        listEl.scrollTop = listEl.scrollHeight;
      }
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    };

    scrollToBottom();
    raf1 = window.requestAnimationFrame(() => {
      scrollToBottom();
      raf2 = window.requestAnimationFrame(scrollToBottom);
    });
    timeout1 = window.setTimeout(scrollToBottom, 80);
    timeout2 = window.setTimeout(scrollToBottom, 180);

    return () => {
      if (raf1 !== null) window.cancelAnimationFrame(raf1);
      if (raf2 !== null) window.cancelAnimationFrame(raf2);
      if (timeout1 !== null) window.clearTimeout(timeout1);
      if (timeout2 !== null) window.clearTimeout(timeout2);
    };
  }, [isOpen, chatTab, visibleMessages.length, chatKeyboardInsetPx, keyboardInsetReservePx]);

  useEffect(() => {
    const el = localTextareaRef.current;
    if (!el || isSystemTab) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [chatInput, chatTab, isOpen, isSystemTab]);

  const handleKeyDown = (e) => {
    if (e.key === "ArrowUp" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (!chatInput.includes("\n")) {
        e.preventDefault();
        cycleChatHistory?.(-1);
      }
      return;
    }
    if (e.key === "ArrowDown" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (!chatInput.includes("\n")) {
        e.preventDefault();
        cycleChatHistory?.(1);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!chatInput.trim() || chatInputDisabled) return;
      submitChat?.(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        className={`flex items-center justify-between px-4 py-3 border-b ${
          darkMode
            ? "border-slate-700 bg-slate-900/95 text-slate-100"
            : "border-slate-200 bg-white/95 text-slate-900"
        }`}
      >
        <div className="font-extrabold text-base">Chat</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`text-[11px] font-semibold ${
              darkMode ? "text-slate-300" : "text-slate-600"
            }`}
            onClick={onOpenRules}
          >
            Regles
          </button>
          <button
            type="button"
            className={`text-[11px] font-semibold ${
              darkMode ? "text-amber-300" : "text-blue-600"
            }`}
            onClick={onToggleBlockedList}
          >
            Joueurs bloques ({blockedCount})
          </button>
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              closeChat?.();
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

      <div className="px-3 pt-2">
        <div
          className={`inline-flex rounded-full border p-1 ${
            darkMode ? "border-white/10 bg-slate-800/70" : "border-slate-200 bg-slate-100"
          }`}
        >
          <button
            type="button"
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
              !isSystemTab
                ? "bg-blue-600 text-white"
                : darkMode
                ? "text-slate-200"
                : "text-slate-700"
            }`}
            onClick={() => onChangeChatTab?.("messages")}
          >
            Messages{formatUnreadSuffix(messagesUnreadCount)}
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
              isSystemTab
                ? "bg-orange-500 text-white"
                : darkMode
                ? "text-slate-200"
                : "text-slate-700"
            }`}
            onClick={() => onChangeChatTab?.("system")}
          >
            Logs serveur
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 px-3 py-2 gap-2">
        {showBlockedList ? (
          <div
            className={`rounded-lg border px-2 py-2 text-[11px] ${
              darkMode
                ? "bg-slate-900/70 border-slate-600 text-slate-100"
                : "bg-gray-50 border-gray-200 text-gray-700"
            }`}
          >
            {blockedEntries.length === 0 ? (
              <div className="text-center">Aucun joueur bloque.</div>
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
                      onClick={() => onUnblockInstallId?.(entry.id)}
                    >
                      Reactiver
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div
          ref={messagesListRef}
          className={`flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 text-sm rounded-lg border p-2 ${
            darkMode
              ? "bg-slate-900/70 border-slate-700 text-slate-100"
              : "bg-white/80 border-slate-200 text-slate-900"
          }`}
          style={{ overscrollBehavior: "contain" }}
        >
          {visibleMessages.length === 0 ? (
            <div className="text-sm text-slate-400 text-center mt-4">
              {isSystemTab
                ? "Aucun log de connexion/deconnexion."
                : "Aucun message pour l'instant."}
            </div>
          ) : (
            visibleMessages.map((msg) => {
              const author = (msg.nick || msg.author || "Anonyme").trim();
              const authorInstallId =
                typeof msg.installId === "string" ? msg.installId : "";
              const isYou = authorInstallId
                ? authorInstallId === selfInstallId
                : author === selfNick;
              const isSystem = isSystemAuthor(author);
              const canOpenMenu =
                !isSystem && authorInstallId && authorInstallId !== selfInstallId;
              return (
                <div
                  key={msg.id}
                  className={
                    isSystem
                      ? "px-2 py-0.5 text-sm italic text-orange-700 dark:text-amber-300"
                      : `px-2 py-1 rounded-lg ${
                          isYou
                            ? "bg-blue-600 text-white self-end"
                            : darkMode
                            ? "bg-slate-800 text-slate-100 self-start"
                            : "bg-slate-100 text-slate-900 self-start"
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
                            onOpenUserMenu?.(e, {
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
          <div ref={messagesEndRef} />
        </div>

        {!isSystemTab ? (
          <div className="flex items-end gap-2 pt-1 pb-1 border-t border-slate-200 dark:border-slate-700 shrink-0">
            <textarea
              ref={(el) => {
                localTextareaRef.current = el;
                setCompositeRef(chatInputRef, el);
              }}
              rows={1}
              autoComplete="on"
              autoCapitalize="on"
              spellCheck
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
              value={chatInput}
              onChange={(e) => setChatInput?.(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 border rounded px-3 py-2 text-sm ios-input chat-input bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 resize-none min-h-[44px] max-h-[168px]"
              placeholder={chatInputPlaceholder}
            />
            <button
              type="button"
              className="px-3 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
              disabled={!chatInput.trim() || chatInputDisabled}
              onPointerDown={(e) => {
                if (!chatInput.trim() || chatInputDisabled) return;
                e.preventDefault();
                submitChat?.();
                const el = localTextareaRef.current;
                if (!el) return;
                try {
                  el.focus({ preventScroll: true });
                } catch (_) {
                  el.focus();
                }
              }}
              onClick={(e) => e.preventDefault()}
            >
              Envoyer
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
