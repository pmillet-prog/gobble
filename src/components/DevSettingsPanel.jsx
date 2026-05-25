import React from "react";

export default function DevSettingsPanel({
  darkMode = false,
  isOpen = false,
  available = false,
  locked = true,
  accountAllowed = false,
  accountLabel = "",
  passwordRequired = true,
  passwordConfigured = false,
  controls = {},
  roundTypes = [],
  bots = [],
  botDuration = "rounds:3",
  busy = false,
  password = "",
  error = "",
  onClose = null,
  onPasswordChange = null,
  onUnlock = null,
  onLock = null,
  onPatch = null,
  onFillChat = null,
  onClearChat = null,
  onRefreshBots = null,
  onBotDurationChange = null,
  onSetBotActive = null,
}) {
  const panelClass = darkMode
    ? "bg-[linear-gradient(180deg,rgba(18,47,103,0.97),rgba(7,22,55,0.99))] border-amber-300/70 text-amber-50"
    : "bg-[linear-gradient(180deg,rgba(255,250,232,0.98),rgba(226,238,255,0.99))] border-amber-300/80 text-slate-900";
  const headerClass = darkMode
    ? "border-amber-200/25 bg-amber-300/10"
    : "border-amber-300/55 bg-amber-100/65";
  const buttonClass =
    "bg-gradient-to-b from-amber-200 to-amber-600 border-amber-300/70 text-slate-950";
  const mutedClass = darkMode
    ? "bg-slate-950/35 border-amber-200/25 text-amber-50"
    : "bg-white/65 border-amber-300/45 text-slate-800";
  const toggleClass = (enabled) =>
    enabled
      ? darkMode
        ? "bg-emerald-900/60 border-emerald-300/45 text-emerald-50"
        : "bg-emerald-50/85 border-emerald-300/60 text-emerald-800"
      : darkMode
      ? "bg-rose-950/55 border-rose-300/40 text-rose-50"
      : "bg-rose-50/85 border-rose-300/60 text-rose-800";
  const patch = (next) => {
    if (typeof onPatch === "function") onPatch(next);
  };
  const canUseTools = available && !locked;
  const selectedRoundTypes = Array.isArray(controls?.forcedRoundTypes)
    ? controls.forcedRoundTypes
    : controls?.forcedRoundType
    ? [controls.forcedRoundType]
    : [];
  const randomCycleEnabled = !!controls?.forcedRoundRandom;
  const patchRoundTypeSelection = (value, checked) => {
    const next = new Set(selectedRoundTypes);
    if (checked) next.add(value);
    else next.delete(value);
    const forcedRoundTypes = Array.from(next);
    patch({
      forcedRoundTypes,
      forcedRoundType: forcedRoundTypes[0] || "",
    });
  };
  const renderToggle = ({ keyName, label, disabled = false }) => {
    const enabled = !!controls?.[keyName];
    return (
      <button
        type="button"
        disabled={disabled || busy || !canUseTools}
        onClick={() => patch({ [keyName]: !enabled })}
        className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2 disabled:opacity-50 ${toggleClass(
          enabled
        )}`}
      >
        <span>{label}</span>
        <span className="text-[10px] font-semibold opacity-80">{enabled ? "On" : "Off"}</span>
      </button>
    );
  };

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
            <div className="text-sm font-extrabold tracking-wide">Dev</div>
            <span className="text-[10px] font-bold opacity-75">
              {!available ? "bloque" : locked ? "verrou" : "ouvert"}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-sm">
          {available && locked ? (
            <div className={`rounded-xl border px-3 py-3 text-xs font-semibold ${mutedClass}`}>
              Acces dev en attente d'autorisation compte.
            </div>
          ) : null}
          {!available ? (
            <div className={`rounded-xl border px-3 py-3 text-xs font-semibold ${mutedClass}`}>
              {accountAllowed
                ? "Options dev indisponibles sur ce serveur."
                : accountLabel
                ? `Compte non autorise: ${accountLabel}.`
                : "Connecte-toi avec un compte dev autorise."}
            </div>
          ) : null}
          {available && !locked ? (
            <>
          {renderToggle({ keyName: "enabled", label: "Mode developpeur" })}
          <div className={`rounded-xl border px-3 py-2 ${mutedClass}`}>
            <span className="block text-[11px] font-bold uppercase tracking-widest opacity-75">
              Cycle force
            </span>
            <div className="mt-1 text-[11px] font-semibold opacity-70">
              Aucun choix: cycle normal. Plusieurs choix: rotation a tour de role, ou tirage aleatoire.
            </div>
            <label
              className={`mt-2 flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                randomCycleEnabled
                  ? darkMode
                    ? "border-sky-300/45 bg-sky-900/45 text-sky-50"
                    : "border-sky-300/60 bg-sky-50/85 text-sky-800"
                  : "border-amber-300/25 bg-white/10"
              }`}
            >
              <span>Tirage aleatoire dans la selection</span>
              <input
                type="checkbox"
                disabled={busy || !canUseTools || !controls?.enabled || selectedRoundTypes.length < 2}
                checked={randomCycleEnabled}
                onChange={(e) => patch({ forcedRoundRandom: e.target.checked })}
                className="h-4 w-4 accent-sky-500"
              />
            </label>
            <div className="mt-2 grid grid-cols-1 gap-1">
              {(roundTypes || [])
                .filter((entry) => entry?.value)
                .map((entry) => {
                  const checked = selectedRoundTypes.includes(entry.value);
                  return (
                    <label
                      key={entry.value}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                        checked
                          ? darkMode
                            ? "border-emerald-300/45 bg-emerald-900/45 text-emerald-50"
                            : "border-emerald-300/60 bg-emerald-50/85 text-emerald-800"
                          : "border-amber-300/25 bg-white/10"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={busy || !canUseTools || !controls?.enabled}
                        checked={checked}
                        onChange={(e) => patchRoundTypeSelection(entry.value, e.target.checked)}
                        className="h-4 w-4 accent-emerald-500"
                      />
                      <span>{entry.label}</span>
                    </label>
                  );
                })}
            </div>
          </div>
          {renderToggle({
            keyName: "botMedals",
            label: "3 medailles de chaque aux bots",
            disabled: !controls?.enabled,
          })}
          {renderToggle({
            keyName: "chatFill",
            label: "Chat rempli par messages test",
            disabled: !controls?.enabled,
          })}
          {renderToggle({
            keyName: "botChat",
            label: "Bots parlent pendant les tests",
            disabled: !controls?.enabled,
          })}
          {renderToggle({
            keyName: "botReactions",
            label: "Reaction bot aux messages humains",
            disabled: !controls?.enabled,
          })}
          {renderToggle({
            keyName: "selfCrown",
            label: "Me donner la couronne",
            disabled: !controls?.enabled,
          })}
          {renderToggle({
            keyName: "selfGoldNick",
            label: "Me donner le pseudo dore",
            disabled: !controls?.enabled,
          })}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              disabled={busy || !canUseTools}
              onClick={onFillChat}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${buttonClass}`}
            >
              Remplir chat
            </button>
            <button
              type="button"
              disabled={busy || !canUseTools}
              onClick={onClearChat}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${mutedClass}`}
            >
              Retirer tests
            </button>
          </div>
          <div className={`rounded-xl border px-3 py-3 ${mutedClass}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest opacity-75">
                Bots live
              </span>
              <button
                type="button"
                disabled={busy || !canUseTools}
                onClick={onRefreshBots}
                className={`rounded-lg border px-2 py-1 text-[11px] font-semibold disabled:opacity-50 ${buttonClass}`}
              >
                Maj
              </button>
            </div>
            <div className="mt-2">
              {renderToggle({ keyName: "botsEnabled", label: "Activer tous les bots" })}
            </div>
            <label className="mt-2 block">
              <span className="block text-[10px] font-bold uppercase tracking-widest opacity-65">
                Duree de l'ajustement
              </span>
              <select
                disabled={busy || !canUseTools}
                value={botDuration}
                onChange={(e) =>
                  typeof onBotDurationChange === "function"
                    ? onBotDurationChange(e.target.value)
                    : null
                }
                className="mt-1 w-full rounded-lg border border-amber-300/40 bg-white/90 px-2 py-2 text-xs text-slate-900 disabled:opacity-60"
              >
                <option value="rounds:1">1 manche</option>
                <option value="rounds:3">3 manches</option>
                <option value="rounds:5">5 manches</option>
                <option value="minutes:15">15 minutes</option>
                <option value="minutes:30">30 minutes</option>
                <option value="minutes:60">1 heure</option>
                <option value="manual">Jusqu'au changement manuel</option>
              </select>
            </label>
            <div className="mt-2 max-h-56 overflow-y-auto pr-1 space-y-1">
              {(bots || []).length ? (
                bots.map((bot) => (
                  <button
                    key={bot.nick}
                    type="button"
                    disabled={busy || !canUseTools || !controls?.botsEnabled}
                    onClick={() =>
                      typeof onSetBotActive === "function"
                        ? onSetBotActive(bot.nick, !bot.active)
                        : null
                    }
                    className={`w-full flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs disabled:opacity-50 ${toggleClass(
                      !!bot.active
                    )}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{bot.nick}</span>
                      {bot.override ? (
                        <span className="block truncate text-[10px] opacity-75">
                          force {bot.override.active ? "present" : "absent"}
                          {Number.isFinite(bot.override.roundsRemaining)
                            ? `, ${bot.override.roundsRemaining} manche(s)`
                            : bot.override.expiresAt
                            ? ", minuteur"
                            : ", manuel"}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-[10px] opacity-80">
                      {bot.active ? "Present" : "Absent"}
                    </span>
                  </button>
                ))
              ) : (
                <div className="py-3 text-xs font-semibold opacity-70">
                  Aucun bot charge.
                </div>
              )}
            </div>
          </div>
          <div className="pt-2 text-[11px] font-semibold opacity-70">
            Les changements s'appliquent aux prochaines manches. Les medailles bots sont seulement affichees.
          </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
