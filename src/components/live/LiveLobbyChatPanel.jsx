import React from "react";
import { useChatDraft } from "../../features/chat/useChatDraft.js";
import { useChatPresentation } from "../../features/chat/useChatPresentation.js";

function getAuthor(message) {
  return String(message?.nick || message?.author || "Systeme").trim() || "Systeme";
}

export default function LiveLobbyChatPanel({
  darkMode = false,
  chatInputDisabled = false,
  chatInputPlaceholder = "Message",
  getAuthorNickClassName = null,
  onChatInputFocus = null,
  submitChat = null,
  visibleMessages: visibleMessagesProp = [],
}) {
  const { chatInput, setChatInput } = useChatDraft();
  const { messagesOnly: visibleMessages } = useChatPresentation();
  const messages = Array.isArray(visibleMessages) ? visibleMessages.slice(-4) : [];
  const panelClass = darkMode
    ? "border-white/10 bg-white/5 text-slate-100"
    : "border-slate-200 bg-white text-slate-900";
  const inputClass = darkMode
    ? "border-white/10 bg-slate-950 text-slate-100 placeholder:text-slate-500"
    : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400";

  return (
    <div className={`rounded-xl border p-3 ${panelClass}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-extrabold uppercase tracking-widest opacity-70">
          Chat
        </div>
      </div>
      <div className="flex h-24 flex-col gap-1 overflow-y-auto pr-1 text-xs">
        {messages.length > 0 ? (
          messages.map((message, index) => {
            const author = getAuthor(message);
            const authorClass =
              (typeof getAuthorNickClassName === "function"
                ? getAuthorNickClassName(message, author)
                : "") || "font-extrabold";
            return (
              <div key={message?.id || `${author}-${index}`} className="min-w-0 leading-snug">
                <span className={authorClass}>{author}: </span>
                <span className="break-words opacity-90">{message?.text || ""}</span>
              </div>
            );
          })
        ) : (
          <div className="flex h-full items-center justify-center text-center text-xs font-semibold opacity-55">
            Aucun message pour le moment.
          </div>
        )}
      </div>
      <form
        className="mt-2 flex items-center gap-2"
        onSubmit={(event) => {
          const didSend =
            typeof submitChat === "function" ? submitChat(event, chatInput) : false;
          if (didSend !== false) setChatInput?.("");
        }}
      >
        <input
          type="text"
          value={chatInput}
          disabled={chatInputDisabled}
          placeholder={chatInputPlaceholder}
          onFocus={onChatInputFocus || undefined}
          onChange={(event) => setChatInput?.(event.target.value)}
          className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm font-semibold outline-none disabled:opacity-60 ${inputClass}`}
        />
        <button
          type="submit"
          disabled={chatInputDisabled || !String(chatInput || "").trim()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-500 disabled:opacity-50"
          aria-label="Envoyer"
          title="Envoyer"
        >
          <span className="material-symbols-outlined text-[21px]" aria-hidden="true">
            send
          </span>
        </button>
      </form>
    </div>
  );
}
