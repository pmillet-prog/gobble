import React from "react";

export default function ModerationPanel({
  darkMode = false,
  isOpen = false,
  available = false,
  accountLabel = "",
  players = [],
  busy = false,
  error = "",
  onClose = null,
  onRefresh = null,
  onAction = null,
}) {
  const panelClass = darkMode
    ? "bg-[linear-gradient(180deg,rgba(24,32,54,0.98),rgba(8,14,28,0.99))] border-sky-300/60 text-sky-50"
    : "bg-[linear-gradient(180deg,rgba(248,252,255,0.99),rgba(232,242,255,0.99))] border-sky-300/70 text-slate-900";
  const headerClass = darkMode
    ? "border-sky-200/20 bg-sky-300/10"
    : "border-sky-300/55 bg-sky-100/70";
  const buttonClass = darkMode
    ? "bg-sky-500/25 border-sky-200/35 text-sky-50"
    : "bg-white/80 border-sky-300/60 text-slate-900";
  const dangerClass = darkMode
    ? "bg-rose-950/55 border-rose-300/45 text-rose-50"
    : "bg-rose-50/90 border-rose-300/70 text-rose-800";
  const warnClass = darkMode
    ? "bg-amber-950/45 border-amber-300/45 text-amber-50"
    : "bg-amber-50/90 border-amber-300/70 text-amber-900";

  return (
    <div
      className={`absolute inset-y-0 right-0 w-full max-w-md border-l-2 shadow-2xl transition-transform duration-300 ${panelClass} ${
        isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
      }`}
    >
      <div className="h-full flex flex-col">
        <div className={`shrink-0 px-4 py-3 border-b ${headerClass}`}>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`h-8 px-2 rounded-lg border text-xs font-semibold ${buttonClass}`}
            >
              Retour
            </button>
            <div className="text-sm font-extrabold tracking-wide">Moderation</div>
            <span className="text-[10px] font-bold opacity-75">
              {available ? accountLabel || "autorise" : "bloque"}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
          {!available ? (
            <div className={`rounded-xl border px-3 py-3 text-xs font-semibold ${buttonClass}`}>
              Compte non autorise pour la moderation.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-widest opacity-75">
                  Joueurs connectes
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onRefresh}
                  className={`rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${buttonClass}`}
                >
                  Maj
                </button>
              </div>
              {error ? <div className="text-xs font-semibold text-rose-400">{error}</div> : null}
              <div className="space-y-1">
                {(players || []).length ? (
                  players.map((player) => (
                    <div
                      key={player.socketId || player.installId || player.nick}
                      className={`rounded-xl border px-3 py-2 ${buttonClass}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">{player.nick}</div>
                          <div className="truncate text-[10px] opacity-65">
                            {player.userId ? `user #${player.userId}` : "invite"}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              typeof onAction === "function" ? onAction(player, "kick") : null
                            }
                            className={`rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${warnClass}`}
                          >
                            Kick
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              typeof onAction === "function" ? onAction(player, "ban_5m") : null
                            }
                            className={`rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${dangerClass}`}
                          >
                            Ban 5m
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={`rounded-xl border px-3 py-4 text-xs font-semibold ${buttonClass}`}>
                    Aucun joueur humain connecte.
                  </div>
                )}
              </div>
              <div className="pt-2 text-[11px] font-semibold opacity-70">
                Les actions sont appliquees cote serveur et journalisees.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
