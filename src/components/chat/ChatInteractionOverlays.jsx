import React from "react";
import { createPortal } from "react-dom";

const REPORT_REASONS = [
  "Spam",
  "Harcèlement",
  "Contenu inapproprié",
  "Infos perso",
  "Autre",
];

function ChatRulesDialog({ appearance, rules }) {
  if (!rules.open) return null;
  const { darkMode } = appearance;
  return (
    <div
      className="fixed inset-0 z-[20060] flex items-center justify-center bg-black/50 px-4"
      onClick={rules.onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-sm rounded-xl border p-4 shadow-xl ${
          darkMode
            ? "bg-slate-900 text-slate-100 border-slate-600"
            : "bg-white text-slate-900 border-slate-200"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-sm font-extrabold">Règles du chat</div>
        <ul className="mt-3 text-[13px] space-y-1">
          <li>Respectez les autres joueurs.</li>
          <li>Pas d'insultes ni harcèlement.</li>
          <li>Pas de spam ni pub.</li>
          <li>Pas d'infos personnelles (téléphone, email, adresse, paiement).</li>
          <li>Utilisez "Signaler" en cas d'abus.</li>
        </ul>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
              darkMode
                ? "bg-slate-800 border-slate-600 text-slate-100"
                : "bg-gray-50 border-gray-200 text-slate-900"
            }`}
            onClick={() => {
              rules.playCloseSound();
              rules.onCancel();
            }}
          >
            Fermer
          </button>
          <button
            type="button"
            ref={rules.confirmRef}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white"
            onClick={rules.onConfirm}
          >
            J'accepte
          </button>
        </div>
      </div>
    </div>
  );
}

function UserMenu({ appearance, menu }) {
  const state = menu.state;
  if (!state.open || typeof document === "undefined") return null;
  const { darkMode } = appearance;
  return createPortal(
    <div className="fixed inset-0 z-[20060]" onClick={menu.onClose}>
      <div
        className={`fixed min-w-[170px] rounded-lg border px-2 py-2 text-xs shadow-lg ${
          darkMode
            ? "bg-slate-900 text-slate-100 border-slate-700"
            : "bg-white text-slate-900 border-slate-200"
        }`}
        style={{ left: `${state.left}px`, top: `${state.top}px` }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-1 pb-1 text-[11px] font-semibold opacity-70">{state.nick}</div>
        <button
          type="button"
          className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition ${
            darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100"
          }`}
          onClick={() => {
            menu.onOpenProfile({ userId: state.userId, nick: state.nick });
            menu.onClose();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
          Profil
        </button>
        <button
          type="button"
          className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition ${
            darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100"
          }`}
          onClick={() => {
            menu.onBlock(state.installId, state.nick);
            menu.onClose();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <line x1="5" y1="19" x2="19" y2="5" />
          </svg>
          Bloquer
        </button>
        <button
          type="button"
          className={`w-full flex items-center gap-2 px-2 py-1 rounded-md transition ${
            darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100"
          }`}
          onClick={() => {
            menu.onReport({
              installId: state.installId,
              nick: state.nick,
              messageId: state.messageId,
            });
            menu.onClose();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5v16" />
            <path d="M4 5h12l-2 4 2 4H4" />
          </svg>
          Signaler
        </button>
        <button
          type="button"
          className={`w-full mt-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
            darkMode
              ? "text-slate-300 hover:text-slate-100"
              : "text-slate-500 hover:text-slate-800"
          }`}
          onClick={menu.onClose}
        >
          Annuler
        </button>
      </div>
    </div>,
    document.body
  );
}

function ReactionPicker({ appearance, reactions }) {
  const picker = reactions.picker;
  if (!picker.open || typeof document === "undefined") return null;
  const { darkMode } = appearance;
  return createPortal(
    <div className="fixed inset-0 z-[20060]" onClick={reactions.onClosePicker}>
      <div
        className={`fixed rounded-2xl border px-2 py-2 shadow-lg ${
          darkMode
            ? "bg-slate-900 text-slate-100 border-slate-700"
            : "bg-white text-slate-900 border-slate-200"
        }`}
        style={{ left: `${picker.left}px`, top: `${picker.top}px` }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid grid-cols-6 gap-1">
          {reactions.emojis.map((emoji) => (
            <button
              key={`desktop-react-${emoji}`}
              type="button"
              className={`h-9 w-9 rounded-full text-xl leading-none flex items-center justify-center ${
                darkMode ? "hover:bg-slate-800" : "hover:bg-slate-100"
              }`}
              onClick={() => {
                if (picker.messageId) reactions.onSend(picker.messageId, emoji);
                reactions.onClosePicker();
              }}
              aria-label={`Réagir avec ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ReactionDetails({ appearance, reactions }) {
  const details = reactions.details;
  if (!details.open || typeof document === "undefined") return null;
  const { darkMode } = appearance;
  return createPortal(
    <div
      className={`fixed z-[20065] w-[230px] rounded-xl border p-2 shadow-xl ${
        darkMode
          ? "bg-slate-900 border-slate-700 text-slate-100"
          : "bg-white border-slate-200 text-slate-900"
      }`}
      style={{ left: `${details.left}px`, top: `${details.top}px` }}
      onMouseEnter={reactions.onKeepDetailsOpen}
      onMouseLeave={() => reactions.onScheduleDetailsClose(90)}
    >
      <div className="mb-1 text-xs font-bold">
        {details.emoji} Réactions ({details.users.length})
      </div>
      <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
        {details.users.map((user) => {
          const isMe =
            String(user?.installId || "").trim() ===
            String(reactions.installId || "").trim();
          return (
            <div
              key={`${details.messageId || "msg"}:${details.emoji}:${user.installId}`}
              className={`rounded-md px-2 py-1 text-xs ${
                isMe
                  ? darkMode
                    ? "bg-blue-600/25 text-blue-100"
                    : "bg-blue-100 text-blue-700"
                  : darkMode
                  ? "bg-slate-800 text-slate-100"
                  : "bg-slate-50 text-slate-700"
              }`}
            >
              {user.nick}
              {isMe ? " (toi)" : ""}
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

function ReportDialog({ appearance, report }) {
  const state = report.state;
  if (!state.open) return null;
  const { darkMode } = appearance;
  return (
    <div
      className="fixed inset-0 z-[20061] flex items-center justify-center bg-black/50 px-4"
      onClick={report.onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-sm rounded-xl border p-4 shadow-xl ${
          darkMode
            ? "bg-slate-900 text-slate-100 border-slate-600"
            : "bg-white text-slate-900 border-slate-200"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-sm font-extrabold">Signaler</div>
        <div className="mt-1 text-[11px] opacity-70">{state.reportedNick || "Joueur"}</div>
        <div className="mt-3 grid gap-2">
          {REPORT_REASONS.map((reason) => {
            const selected = state.reason === reason;
            return (
              <button
                key={reason}
                type="button"
                className={`px-3 py-2 rounded-lg border text-xs font-semibold text-left transition ${
                  selected
                    ? "bg-blue-600 border-blue-500 text-white"
                    : darkMode
                    ? "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => report.onChange((previous) => ({ ...previous, reason }))}
              >
                {reason}
              </button>
            );
          })}
        </div>
        {state.reason === "Autre" ? (
          <input
            type="text"
            maxLength={120}
            value={state.details}
            onChange={(event) =>
              report.onChange((previous) => ({ ...previous, details: event.target.value }))
            }
            className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs ${
              darkMode
                ? "bg-slate-800 border-slate-700 text-slate-100"
                : "bg-white border-slate-200 text-slate-800"
            }`}
            placeholder="Précisez en quelques mots"
          />
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            className={`px-3 py-2 text-xs font-semibold rounded-lg border ${
              darkMode
                ? "bg-slate-800 border-slate-600 text-slate-100"
                : "bg-gray-50 border-gray-200 text-slate-900"
            }`}
            onClick={report.onClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white disabled:opacity-50"
            disabled={!state.reason}
            onClick={report.onSubmit}
          >
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatInteractionOverlays({ appearance, reactions, report, rules, userMenu }) {
  return (
    <>
      <ChatRulesDialog appearance={appearance} rules={rules} />
      <UserMenu appearance={appearance} menu={userMenu} />
      <ReactionPicker appearance={appearance} reactions={reactions} />
      <ReactionDetails appearance={appearance} reactions={reactions} />
      <ReportDialog appearance={appearance} report={report} />
    </>
  );
}
