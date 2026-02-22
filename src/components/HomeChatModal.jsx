import React from "react";
import { createPortal } from "react-dom";

function isSystemAuthor(rawAuthor) {
  if (!rawAuthor) return false;
  const simplified = String(rawAuthor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return simplified === "system" || simplified === "systeme";
}

function formatUnreadSuffix(count) {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  if (n >= 10) return " (9+)";
  return ` (${n})`;
}

const CHAT_TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

function parseMessageTimestampMs(message) {
  if (!message || typeof message !== "object") return null;
  const candidates = [message.t, message.ts, message.timestamp, message.createdAt];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const raw = candidate.trim();
      if (!raw) continue;
      const asNumber = Number(raw);
      if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
      const parsed = Date.parse(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function formatMessageTime(message) {
  const ts = parseMessageTimestampMs(message);
  if (!Number.isFinite(ts)) return "";
  try {
    return CHAT_TIME_FORMATTER.format(new Date(ts));
  } catch (_) {
    return "";
  }
}

export default function HomeChatModal({
  open = false,
  darkMode = false,
  chatTab = "messages",
  onChangeTab = null,
  onClose = null,
  messagesUnreadCount = 0,
  messages = [],
  chatInput = "",
  setChatInput = null,
  onInputFocus = null,
  onSubmit = null,
  chatInputDisabled = false,
  chatInputPlaceholder = "Ecrire un message...",
  selfNick = "",
  selfInstallId = "",
}) {
  const listRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const safeMessages = Array.isArray(messages) ? messages : [];
  const currentTab = chatTab === "system" ? "system" : "messages";
  const isSystemTab = currentTab === "system";
  const title = currentTab === "system" ? "Messages systemes" : "Messages";
  const lastMessageKey = React.useMemo(() => {
    if (!safeMessages.length) return "empty";
    const last = safeMessages[safeMessages.length - 1];
    if (!last || typeof last !== "object") return "missing";
    const id = typeof last.id === "string" ? last.id.trim() : "";
    if (id) return `id:${id}`;
    const ts = parseMessageTimestampMs(last);
    const author = String(last.nick || last.author || "").trim();
    const text = String(last.text || "");
    return `fallback:${ts || 0}:${author}:${text}`;
  }, [safeMessages]);

  React.useEffect(() => {
    if (!open) return undefined;
    const el = listRef.current;
    if (!el) return undefined;
    const rafId = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [open, currentTab, lastMessageKey]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[12130] flex items-center justify-center px-3 py-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={() => onClose?.()}
        aria-label="Fermer le chat"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden ${
          darkMode
            ? "bg-slate-900/95 border-white/10 text-slate-100"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        <div
          className={`flex items-center justify-between gap-2 px-4 py-3 border-b ${
            darkMode ? "border-white/10" : "border-slate-200"
          }`}
        >
          <div className="text-base font-extrabold">Chat accueil</div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className={`h-8 px-3 rounded-full text-xs font-semibold border ${
              darkMode
                ? "bg-slate-800 border-white/10 text-slate-100"
                : "bg-white border-slate-300 text-slate-700"
            }`}
          >
            Fermer
          </button>
        </div>

        <div className="px-4 pt-3 pb-2">
          <div
            className={`inline-flex rounded-full border p-1 ${
              darkMode ? "border-white/10 bg-slate-800/70" : "border-slate-200 bg-slate-100"
            }`}
          >
            <button
              type="button"
              onClick={() => onChangeTab?.("messages")}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
                currentTab === "messages"
                  ? "bg-blue-600 text-white"
                  : darkMode
                  ? "text-slate-200"
                  : "text-slate-700"
              }`}
            >
              Messages{formatUnreadSuffix(messagesUnreadCount)}
            </button>
            <button
              type="button"
              onClick={() => onChangeTab?.("system")}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition ${
                currentTab === "system"
                  ? "bg-orange-500 text-white"
                  : darkMode
                  ? "text-slate-200"
                  : "text-slate-700"
              }`}
            >
              Systeme
            </button>
          </div>
          <div className="mt-2 text-[11px] opacity-70">{title}</div>
        </div>

        <div
          ref={listRef}
          className={`mx-4 mb-4 rounded-xl border px-3 py-3 max-h-[62vh] overflow-y-auto custom-scrollbar custom-scrollbar-gray ${
            darkMode ? "bg-slate-900/50 border-white/10" : "bg-slate-50 border-slate-200"
          }`}
          style={{ overscrollBehavior: "contain" }}
        >
          {safeMessages.length === 0 ? (
            <div className="text-sm text-center opacity-70 py-8">
              {currentTab === "system"
                ? "Aucun log de connexion/deconnexion."
                : "Aucun message pour le moment."}
            </div>
          ) : (
            <div className="space-y-1.5">
              {safeMessages.map((msg, idx) => {
                const key = msg?.id || `chat-${idx}`;
                const author = (msg?.nick || msg?.author || "Anonyme").trim();
                const systemAuthor = author || "Système";
                const authorInstallId =
                  typeof msg?.installId === "string" ? msg.installId : "";
                const messageTime = formatMessageTime(msg);
                const isYou = authorInstallId
                  ? authorInstallId === selfInstallId
                  : author === selfNick;
                const isSystem = isSystemAuthor(author);
                if (isSystem) {
                  return (
                    <div
                      key={key}
                      className="px-2 py-1 text-xs italic text-orange-700 dark:text-amber-300"
                    >
                      <div className="flex items-baseline gap-1 flex-wrap">
                        <span className="font-bold">{systemAuthor}:</span>
                        {messageTime ? (
                          <span className="text-[10px] leading-none opacity-70">
                            {messageTime}
                          </span>
                        ) : null}
                        <span>{msg?.text || ""}</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={key}
                    className={`rounded-lg px-2 py-1.5 text-xs ${
                      isYou
                        ? "bg-blue-600 text-white"
                        : darkMode
                        ? "bg-slate-800 text-slate-100"
                        : "bg-white text-slate-900 border border-slate-200"
                    }`}
                  >
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="font-bold">{author}:</span>
                      {messageTime ? (
                        <span className="text-[10px] leading-none opacity-70">
                          {messageTime}
                        </span>
                      ) : null}
                      <span>{msg?.text || ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {!isSystemTab ? (
          <div
            className={`mx-4 mb-4 pt-2 border-t flex items-center gap-2 ${
              darkMode ? "border-white/10" : "border-slate-200"
            }`}
          >
            <input
              type="text"
              className={`flex-1 border rounded px-3 py-2 text-sm ios-input ${
                darkMode
                  ? "bg-slate-900 border-slate-600 text-slate-100"
                  : "bg-white border-slate-300 text-slate-900"
              }`}
              placeholder={chatInputPlaceholder}
              value={chatInput}
              onChange={(event) => setChatInput?.(event.target.value)}
              onFocus={onInputFocus}
              readOnly={chatInputDisabled}
              aria-disabled={chatInputDisabled}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSubmit?.();
                }
              }}
            />
            <button
              type="button"
              className="px-3 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
              disabled={!String(chatInput || "").trim() || chatInputDisabled}
              onClick={() => onSubmit?.()}
            >
              Envoyer
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
