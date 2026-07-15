import React from "react";
import { createPortal } from "react-dom";

const HELP_SECTIONS = [
  {
    title: "Principes communs",
    rules: [
      "Trace un mot en reliant des tuiles voisines, diagonales comprises.",
      "Une même tuile ne peut pas être réutilisée dans un mot.",
      "Les mots rares ou jamais trouvés par les joueurs donnent un bonus dédié sur les manches concernées.",
      "En mini-tournoi : manches normales en 1 et 5, manches spéciales en 2 et 4, Massive Boggle en 3.",
    ],
    scoring: [
      "Score d'un mot classique : valeur des lettres + bonus de longueur.",
      "Bonus de longueur : 5 lettres +3, 6 lettres +6, 7 lettres +10, 8 lettres ou plus +15.",
      "Les tuiles L2/L3 multiplient la lettre ; les tuiles M2/M3 multiplient ensuite le mot.",
      "Bonus rare : +10 points par mot rare, très rare, extrême ou jamais trouvé.",
    ],
  },
  {
    title: "Manche normale",
    rules: [
      "Objectif simple : trouver un maximum de mots valides avant la fin du chrono.",
      "Les gobbles récompensent les meilleurs mots de la grille, notamment le meilleur score et le plus long mot.",
    ],
    scoring: [
      "Chaque mot rapporte son score de grille.",
      "En mini-tournoi, le classement de manche attribue 10, 9, 8... points aux meilleurs scores.",
    ],
  },
  {
    title: "Rapidité",
    rules: [
      "La grille se joue comme une manche normale, mais la valeur des mots est volontairement aplatie.",
      "Le but est de valider vite et beaucoup, pas d'optimiser chaque bonus.",
    ],
    scoring: [
      "Chaque mot valide rapporte 11 points.",
      "Les bonus de tuiles et de longueur ne changent pas ce score fixe.",
    ],
  },
  {
    title: "Grille monstrueuse",
    rules: [
      "La grille est plus grande et contient davantage de possibilités.",
      "Elle se joue comme une manche normale, mais avec un volume de mots beaucoup plus élevé.",
    ],
    scoring: [
      "Les mots utilisent le barème classique : lettres, longueur, L2/L3, M2/M3.",
      "Les mots rares rapportent aussi leur bonus si la manche n'est pas une manche cible.",
    ],
  },
  {
    title: "Lettre en or",
    rules: [
      "Une lettre indiquée au début de la manche devient particulièrement rentable.",
      "Tous les mots valides restent jouables ; ceux qui utilisent cette lettre profitent du bonus de valeur.",
    ],
    scoring: [
      "Chaque occurrence de la lettre en or vaut 20 points avant application des bonus de tuile.",
      "Le reste du score suit le barème classique.",
    ],
  },
  {
    title: "Massive Boggle",
    rules: [
      "La grille se joue comme une manche normale, mais sans bonus de tuiles ni bonus de longueur classique.",
      "En mini-tournoi, elle est jouée en troisième manche.",
      "La manche vise une grille riche : environ 200 mots possibles, dont plusieurs mots longs.",
    ],
    scoring: [
      "Barème Boggle : 3 ou 4 lettres = 1 point, 5 = 2, 6 = 3, 7 = 5, 8 et plus = 11.",
      "Seul le gobble du ou des plus longs mots est actif.",
    ],
  },
  {
    title: "Faux jumeaux",
    rules: [
      "Une tuile peut représenter deux lettres possibles.",
      "Les mots de 2 lettres ou plus qui utilisent cette tuile gagnent le bonus faux jumeaux.",
      "Le bonus de complétion demande de trouver assez de mots communs ou peu communs utilisant la tuile jumelle.",
    ],
    scoring: [
      "Un mot qui utilise la tuile jumelle rapporte +50 points.",
      "La prime de complétion vaut +500 points si l'objectif affiché est atteint.",
      "Les mots rares utilisant la tuile comptent toujours pour le +50, mais pas pour l'objectif de complétion.",
    ],
  },
  {
    title: "Cible longueur",
    rules: [
      "Un mot cible est caché dans la grille : il faut retrouver le mot le plus long demandé.",
      "Les indices peuvent aider au fil du chrono.",
    ],
    scoring: [
      "La manche se joue au temps : les joueurs sont classés selon l'ordre de découverte.",
      "En mini-tournoi, le premier obtient 10 points, puis 9, 8...",
    ],
  },
  {
    title: "Cible score",
    rules: [
      "Un mot cible est caché dans la grille : il faut retrouver le mot au meilleur score demandé.",
      "Le mot attendu peut être plus court qu'un autre, mais mieux placé sur les bonus.",
    ],
    scoring: [
      "La manche se joue au temps, comme la cible longueur.",
      "Le classement de manche donne 10, 9, 8... points selon l'ordre de découverte.",
    ],
  },
  {
    title: "Manche OCID",
    rules: [
      "Une définition est affichée et le vrai mot cible est présent dans la grille.",
      "Phase 1 : chaque joueur trace le mot qu'il pense être la réponse, ou bluffe avec un autre mot.",
      "Phase 2 : les propositions distinctes et le vrai mot sont soumis au vote.",
    ],
    scoring: [
      "Mot cible trouvé au traçage : +1000 points.",
      "Mot cible trouvé au vote : +600 points.",
      "Proposition valide au dictionnaire : +100 points.",
      "Chaque vote reçu sur un bluff qui n'est pas le mot cible : +500 points.",
      "Voter pour son propre mauvais mot rapporte 0 point.",
    ],
  },
  {
    title: "3 mots",
    rules: [
      "Tu places les bonus sur la grille, puis tu dois garder exactement 3 mots.",
      "Les trois mots doivent partir de tuiles de départ différentes.",
      "Cette manche ne compte pas les mots trouvés comme vocabulaire unique.",
    ],
    scoring: [
      "Le score final est la somme des 3 mots conservés.",
      "Les bonus que tu places peuvent fortement changer le meilleur trio possible.",
      "Le bonus rare global n'est pas appliqué sur cette manche.",
    ],
  },
];

function HelpOverlay({ open = false, darkMode = false, onClose = null }) {
  React.useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const panelClass = darkMode
    ? "bg-slate-950/96 text-slate-100 border-slate-700"
    : "bg-white text-slate-900 border-slate-200";
  const cardClass = darkMode
    ? "border-slate-700 bg-slate-900/70"
    : "border-slate-200 bg-slate-50";

  return createPortal(
    <div
      className="fixed inset-0 z-[20150] flex items-center justify-center bg-black/55 px-3 py-4"
      onClick={() => onClose?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Aide de jeu"
        className={`flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${panelClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.22em] opacity-60">
              Aide
            </div>
            <div className="mt-1 text-xl font-black leading-tight">Règles et scoring</div>
          </div>
          <button
            type="button"
            className={`h-8 min-w-8 rounded-full border px-2 text-sm font-black ${
              darkMode
                ? "border-slate-600 bg-slate-800 text-slate-100"
                : "border-slate-300 bg-white text-slate-700"
            }`}
            onClick={() => onClose?.()}
            aria-label="Fermer l'aide"
          >
            x
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            {HELP_SECTIONS.map((section) => (
              <section key={section.title} className={`rounded-xl border px-3 py-3 ${cardClass}`}>
                <h2 className="text-sm font-black">{section.title}</h2>
                <div className="mt-2 text-[11px] font-black uppercase tracking-wide opacity-55">
                  Règles
                </div>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-snug">
                  {section.rules.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="mt-3 text-[11px] font-black uppercase tracking-wide opacity-55">
                  Scoring
                </div>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-snug">
                  {section.scoring.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default React.memo(HelpOverlay);
