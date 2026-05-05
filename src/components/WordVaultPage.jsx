import React from "react";

const SORT_OPTIONS = [
  { key: "addedAt", label: "Date d'ajout" },
  { key: "alpha", label: "Alphabetique" },
  { key: "length", label: "Longueur" },
];

function normalizeSortMode(value) {
  return value === "alpha" || value === "length" ? value : "addedAt";
}

function getAlphaGroupLabel(word) {
  const first = String(word || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .charAt(0)
    .toLocaleUpperCase("fr-FR");
  return /[A-ZÀ-ÖØ-Þ]/u.test(first) ? first : "#";
}

function getLengthGroupLabel(word) {
  const length = Array.from(String(word || "")).length;
  return `${length} ${length > 1 ? "lettres" : "lettre"}`;
}

function getDateGroupLabel(addedAt) {
  const safeTs = Number(addedAt) || 0;
  if (!safeTs) return "Date inconnue";
  const now = new Date();
  const currentDayKey = now.toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
  });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = yesterday.toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
  });
  const target = new Date(safeTs);
  const targetKey = target.toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
  });
  if (targetKey === currentDayKey) return "Aujourd'hui";
  if (targetKey === yesterdayKey) return "Hier";
  return target.toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatAddedAtShort(addedAt) {
  const safeTs = Number(addedAt) || 0;
  if (!safeTs) return "";
  return new Date(safeTs).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function buildGroups(words, sortMode) {
  const safeWords = Array.isArray(words) ? [...words] : [];
  const mode = normalizeSortMode(sortMode);
  if (mode === "alpha") {
    safeWords.sort((a, b) => String(a?.word || "").localeCompare(String(b?.word || ""), "fr-FR"));
  } else if (mode === "length") {
    safeWords.sort((a, b) => {
      const diff = Array.from(String(b?.word || "")).length - Array.from(String(a?.word || "")).length;
      if (diff !== 0) return diff;
      return String(a?.word || "").localeCompare(String(b?.word || ""), "fr-FR");
    });
  } else {
    safeWords.sort((a, b) => {
      const diff = (Number(b?.addedAt) || 0) - (Number(a?.addedAt) || 0);
      if (diff !== 0) return diff;
      return String(a?.word || "").localeCompare(String(b?.word || ""), "fr-FR");
    });
  }

  const groups = [];
  for (const entry of safeWords) {
    const word = String(entry?.word || "").trim();
    if (!word) continue;
    const label =
      mode === "alpha"
        ? getAlphaGroupLabel(word)
        : mode === "length"
        ? getLengthGroupLabel(word)
        : getDateGroupLabel(entry?.addedAt);
    const previous = groups[groups.length - 1];
    if (!previous || previous.label !== label) {
      groups.push({ label, items: [entry] });
    } else {
      previous.items.push(entry);
    }
  }
  return groups;
}

export default function WordVaultPage({
  backgroundDesktop = "/background/desktop bleu.png",
  backgroundMobile = "/background/mobile bleu.png",
  darkMode = false,
  loading = false,
  error = "",
  words = [],
  accountLabel = "",
  standaloneWarning = false,
  sortMode = "addedAt",
  onSortChange = null,
  onOpenWord = null,
  onRetry = null,
  onClose = null,
}) {
  const groups = buildGroups(words, sortMode);
  const shellClass = darkMode
    ? "border-amber-300/70 bg-[linear-gradient(180deg,rgba(18,47,103,0.94),rgba(7,22,55,0.97))] text-amber-50"
    : "border-amber-300/80 bg-[linear-gradient(180deg,rgba(255,250,232,0.98),rgba(226,238,255,0.99))] text-slate-900";
  const headerClass = darkMode
    ? "border-amber-200/25 bg-amber-300/10"
    : "border-amber-300/55 bg-amber-100/65";
  const inactiveButtonClass = darkMode
    ? "bg-slate-950/35 border-amber-200/25 text-amber-50 hover:bg-slate-950/50"
    : "bg-white/65 border-amber-300/45 text-slate-800 hover:bg-amber-50/80";
  const cardClass = darkMode
    ? "bg-slate-950/45 border-amber-200/20 hover:bg-slate-950/60"
    : "bg-white/70 border-amber-300/40 hover:bg-amber-50/80";
  const screenStyle = {
    "--vault-bg-mobile": `url("${backgroundMobile}")`,
    "--vault-bg-desktop": `url("${backgroundDesktop}")`,
    minHeight: "100svh",
  };

  return (
    <div
      className="relative w-full flex items-stretch justify-center px-2 sm:px-4 overflow-hidden text-amber-50"
      style={screenStyle}
    >
      <style>{`
        .vault-themed-screen {
          background-image: var(--vault-bg-mobile);
          background-size: cover;
          background-position: center;
        }
        @media (min-aspect-ratio: 1/1) {
          .vault-themed-screen { background-image: var(--vault-bg-desktop); }
        }
      `}</style>
      <div className="vault-themed-screen absolute inset-0" aria-hidden="true" />
      <div className="absolute inset-0 bg-black/42 backdrop-blur-[1px]" aria-hidden="true" />
      <div
        className={`relative z-[1] w-full max-w-none h-full rounded-2xl border-2 shadow-2xl overflow-hidden flex flex-col min-h-0 ${shellClass}`}
      >
        <div className={`p-4 pb-3 space-y-3 border-b ${headerClass}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-70">
                COFFRE FORT
              </div>
              <div className="mt-1 text-sm opacity-75">
                Garde ici les mots que tu veux retrouver plus tard.
              </div>
              {accountLabel ? (
                <div className="mt-2 text-xs font-semibold opacity-65">
                  Compte : {accountLabel}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-black rounded-full border border-amber-300/70 bg-gradient-to-b from-amber-200 to-amber-600 text-slate-950 shadow"
              onClick={onClose}
              aria-label="Fermer le coffre fort"
            >
              Fermer
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {SORT_OPTIONS.map((option) => {
              const active = normalizeSortMode(sortMode) === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`px-3 py-2 rounded-full text-xs font-semibold border transition ${
                    active
                      ? darkMode
                        ? "bg-amber-400 text-slate-950 border-amber-300"
                        : "bg-amber-400 text-slate-950 border-amber-300"
                      : inactiveButtonClass
                  }`}
                  onClick={() => onSortChange?.(option.key)}
                >
                  {option.label}
                </button>
              );
            })}
            <div className="ml-auto text-xs font-semibold opacity-65">
              {Array.isArray(words) ? words.length : 0} mot{Array.isArray(words) && words.length > 1 ? "s" : ""}
            </div>
          </div>
          {standaloneWarning ? (
            <div
                className={`rounded-xl border px-3 py-2 text-xs font-semibold leading-snug ${
                darkMode
                  ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
                  : "border-amber-300/45 bg-amber-50/75 text-amber-900"
              }`}
            >
              Si le coffre reste vide depuis le raccourci iPhone, ouvre gobble.fr directement dans
              Safari pour resynchroniser la session.
            </div>
          ) : null}
        </div>
        <div
          className="px-4 py-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar custom-scrollbar-gray"
          style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
        >
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm opacity-75">
              Chargement du coffre fort...
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
              <div className="text-sm text-amber-200">
                Impossible de charger le coffre fort ({error})
              </div>
              <button
                type="button"
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  darkMode
                    ? "bg-amber-300 text-slate-950 hover:bg-amber-200"
                    : "bg-amber-300 text-slate-950 hover:bg-amber-200"
                }`}
                onClick={onRetry}
              >
                Reessayer
              </button>
            </div>
          ) : groups.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center">
              <div className="max-w-md space-y-2">
                <div className="text-lg font-black">Aucun mot garde</div>
                <div className="text-sm opacity-75">
                  Ouvre une definition et ajoute les mots que tu veux retenir.
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.label} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`text-2xl sm:text-3xl font-black tracking-[0.18em] uppercase ${
                        "text-amber-50/90"
                      }`}
                    >
                      {group.label}
                    </div>
                    <div className="h-px flex-1 bg-amber-200/20" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((entry) => (
                      <button
                        key={entry.wordKey}
                        type="button"
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${cardClass}`}
                        onClick={() => onOpenWord?.(entry.word)}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-base font-black tracking-[0.08em] uppercase">
                              {entry.word}
                            </div>
                            <div className="mt-1 text-[11px] font-semibold opacity-60">
                              {Array.from(String(entry.word || "")).length} lettres
                            </div>
                          </div>
                          <div className="shrink-0 text-[11px] font-semibold opacity-60">
                            {formatAddedAtShort(entry.addedAt)}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
