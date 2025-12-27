import React from "react";

export default function MobileChatWidget({
  chatInput,
  chatInputRef,
  chatOverlayStyle,
  chatSheetStyle,
  cycleChatHistory,
  darkMode,
  isChatOpenMobile,
  mobileChatUnreadCount,
  selfNick,
  setChatInput,
  setIsChatOpenMobile,
  setMobileChatUnreadCount,
  submitChat,
  visibleMessages,
}) {
  return (
    <>
      <div className="fixed bottom-4 right-4 z-30">
        <button
          type="button"
          onClick={() => {
            setMobileChatUnreadCount(0);
            setIsChatOpenMobile(true);
          }}
          className="px-3 py-2 rounded-full shadow-lg text-xs font-semibold bg-blue-600 text-white relative inline-flex items-center whitespace-nowrap"
        >
          Chat
          {mobileChatUnreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
          )}
        </button>
      </div>

      {isChatOpenMobile && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 chat-safe-bottom"
          style={chatOverlayStyle}
        >
          <div
            className={`w-full rounded-t-2xl border-t flex flex-col ${
              darkMode
                ? "bg-slate-900 text-slate-100 border-slate-700"
                : "bg-white text-slate-900 border-slate-200"
            }`}
            style={chatSheetStyle}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <div className="font-extrabold text-base">Chat</div>
              <button
                type="button"
                onClick={() => setIsChatOpenMobile(false)}
                className={`h-10 px-4 text-sm font-semibold rounded-xl border ${
                  darkMode
                    ? "bg-slate-800 border-slate-600 text-slate-100"
                    : "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              >
                Fermer
              </button>
            </div>
            <div className="flex flex-col flex-1 min-h-0 px-3 py-2 gap-2">
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse gap-1 text-xs">
                {visibleMessages.length === 0 ? (
                  <div className="text-[11px] text-slate-400 text-center mt-4">
                    Aucun message pour l'instant.
                  </div>
                ) : (
                  [...visibleMessages].reverse().map((msg) => {
                    const author = (msg.author || msg.nick || "Anonyme").trim();
                    const isYou = author === selfNick;
                    const isSystem = ["systeme", "system", "système"].includes(
                      author.toLowerCase()
                    );
                    return (
                      <div
                        key={msg.id}
                        className={
                          isSystem
                            ? "px-2 py-0.5 text-[0.65rem] italic text-orange-700 dark:text-amber-300 self-start"
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
                          <>
                            <span className="font-semibold mr-1">{author}:</span>
                            <span>{msg.text}</span>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <form
                onSubmit={submitChat}
                className="flex items-center gap-2 pt-1 pb-1 border-t border-slate-200 dark:border-slate-700 shrink-0"
              >
                <input
                  type="text"
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      cycleChatHistory(-1);
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      cycleChatHistory(1);
                    }
                  }}
                  className="flex-1 border rounded px-2 py-1 text-xs ios-input bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
                  placeholder="Écrire un message..."
                />
                <button
                  type="button"
                  className="px-3 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-50"
                  disabled={!chatInput.trim()}
                  onPointerDown={(e) => {
                    if (!chatInput.trim()) return;
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
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
