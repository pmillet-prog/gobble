import React from "react";
import { createPortal } from "react-dom";
import {
  FINALE_TILE_BONUS_MULTIPLIER,
  FINALE_TYPE,
} from "../../../shared/finaleRules.js";
import { MASSIVE_BOGGLE_TYPE } from "../../game/specialRoundTypes.js";
import { clampValue } from "../../utils/numbers.js";
import TutorialOverlay from "../TutorialOverlay.jsx";
import {
  DAILY_FAKE_TWINS_MODE,
  DAILY_SPECIAL_MODE,
} from "../daily/dailyModes.js";
import { FAKE_TWINS_TYPE, OCID_TYPE } from "../gameLogic.js";
import FinaleBonusTilesDemo from "../finale/FinaleBonusTilesDemo.jsx";
import { getFinaleTutorialSteps } from "../finale/finalePresentation.js";

const SPECIAL_TUTORIAL_BONUS_TILE_STYLES = {
  L2: { bg: "rgba(163,196,243,0.85)", border: "rgba(99,147,230,0.9)", text: "#0f172a" },
  L3: { bg: "rgba(51,93,227,0.8)", border: "rgba(30,64,175,0.95)", text: "#ffffff" },
  M2: { bg: "rgba(255,191,180,0.9)", border: "rgba(248,113,113,0.95)", text: "#0f172a" },
  M3: { bg: "rgba(239,68,68,0.85)", border: "rgba(185,28,28,0.95)", text: "#ffffff" },
};

export default function useTutorialPresentation(runtime) {
  const {
    completeTutorial,
    darkMode,
    isMobileLayout,
    isSpecial3TutorialInteractiveActive,
    isSpecialTutorialOpen,
    isTutorialOpen,
    markSpecialTutorialSeen,
    mobileSpecial3Step1GhostStyle,
    mobileSpecial3Step2OverlayStyle,
    renderSpecial3BonusChipButton,
    setIsSpecialTutorialOpen,
    setSpecialTutorialPlan,
    setSpecialTutorialStepIndex,
    SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK,
    specialTutorialPlan,
    specialTutorialStepIndex,
  } = runtime;

  const specialTutorialType = specialTutorialPlan?.type || null;
  const specialTutorialLabel = specialTutorialPlan?.label || "Manche spéciale";
  const specialTutorialFixedScore =
    specialTutorialPlan?.fixedWordScore ?? SPECIAL_TUTORIAL_SPEED_SCORE_FALLBACK;
  const monstrousMinLongLen = specialTutorialPlan?.minLongWordLen ?? null;
  const monstrousMinLongCount = specialTutorialPlan?.minLongWordCount ?? null;
  const monstrousMinTotalScore = specialTutorialPlan?.minTotalScore ?? null;
  const specialTutorialSteps = (() => {
    if (!specialTutorialType) return null;
    if (specialTutorialType === FINALE_TYPE) {
      return getFinaleTutorialSteps(specialTutorialPlan);
    }
    if (specialTutorialType === DAILY_SPECIAL_MODE) {
      return [
        {
          lead: "Glisse les 4 tuiles spéciales sur la grille quand tu veux.",
          bullets: [
            "Tu peux placer L2, L3, M2 et M3 où tu veux.",
            "Elles ne sont pas verrouillées : tu peux les repositionner autant de fois que nécessaire.",
            "Tu peux commencer par les bonus, ou d'abord valider des mots : liberté totale.",
          ],
          demoKind: "special3_drag",
        },
        {
          lead: "Valide jusqu'à 3 mots seulement.",
          bullets: [
            "Chaque mot doit exister dans la grille avec les placements actuels.",
            "Tu peux saisir les mots d'abord, puis poser les bonus ensuite.",
            "Une fois saisi, tu peux encore déplacer les tuiles spéciales pour tout recalculer.",
          ],
          demoKind: "special3_slots",
        },
        {
          lead: "Les 3 mots doivent partir de tuiles différentes.",
          bullets: [
            "Une tuile de départ déjà utilisée est hachurée sur la grille.",
            "Tu peux réutiliser la même lettre si elle vient d'une autre case.",
            "Un seul Gobble est attribué si l'un de tes mots fait partie des plus longs possibles de la grille.",
          ],
          demoKind: "special3_start_tile",
        },
      ];
    }
    if (specialTutorialType === "target_long" || specialTutorialType === "target_score") {
      const goalLabel =
        specialTutorialType === "target_long"
          ? "le mot le plus long"
          : "le mot qui rapporte le plus de points";
      return [{
        lead: `Manche spéciale ${specialTutorialLabel} : ici, pas besoin de s'acharner à trouver plein de mots, il n'y en a qu'un seul !`,
        bullets: [
          `Objectif : trouver ${goalLabel}.`,
          "Les indices se dévoilent progressivement au fil de la manche.",
          "Sois rapide : le premier à le trouver remporte le plus de points !",
        ],
        showTargetDemo: true,
        targetIsScore: specialTutorialType === "target_score",
      }];
    }
    if (specialTutorialType === OCID_TYPE) {
      return [{
        lead: "Manche OCID : une définition est affichée, et le vrai mot est présent dans la grille.",
        bullets: [
          "Trace le mot qui te semble correspondre à la définition, ou bluffe avec une autre proposition.",
          "Quand le chrono de traçage se termine, le mot visible dans ton aperçu est retenu automatiquement.",
          "Au vote, choisis la proposition qui te semble être le vrai mot cible.",
          "Tu marques pour le mot cible trouvé, pour un vote correct, pour un mot valide proposé, et pour les votes reçus sur ton bluff.",
        ],
      }];
    }
    if (specialTutorialType === "speed") {
      return [{
        lead: `Tous les mots valent ${specialTutorialFixedScore} points.`,
        bullets: [
          "Privilégie les petits mots rapides pour marquer un maximum.",
          "Un gobble \"mot le plus long\" s'y cache quand même.",
        ],
      }];
    }
    if (specialTutorialType === "monstrous") {
      const bullets = [
        Number.isFinite(monstrousMinLongCount) && Number.isFinite(monstrousMinLongLen)
          ? `Au moins ${monstrousMinLongCount} mots d'au moins ${monstrousMinLongLen} lettres.`
          : null,
        monstrousMinTotalScore ? `Potentiel total d'au moins ${monstrousMinTotalScore} points.` : null,
      ].filter(Boolean);
      return [{
        lead: "Grille monstrueuse : une grille riche en mots longs.",
        bullets,
      }];
    }
    if (specialTutorialType === "bonus_letter") {
      return [{
        lead: `Lettre en or : ${specialTutorialPlan?.bonusLetter ? String(specialTutorialPlan.bonusLetter).toUpperCase() : "?"} vaut ${specialTutorialPlan?.bonusLetterScore ?? 20} points.`,
        bullets: ["Les autres lettres gardent leur valeur habituelle."],
      }];
    }
    if (specialTutorialType === MASSIVE_BOGGLE_TYPE) {
      return [{
        lead: "Massive Boggle : barème 3/4=1, 5=2, 6=3, 7=5, 8+=11.",
        bullets: [
          "Les bonus de tuiles sont désactivés.",
          "Seuls les gobbles du ou des plus longs mots sont actifs.",
        ],
      }];
    }
    if (specialTutorialType === FAKE_TWINS_TYPE || specialTutorialType === DAILY_FAKE_TWINS_MODE) {
      return [{
        lead: "Une case de la grille peut valoir l'une ou l'autre de deux lettres.",
        bullets: [
          "Un mot est valide si cette case peut être lue avec l'une ou l'autre lettre.",
          "Les mots de 2 lettres ou plus sont valides.",
        ],
      }];
    }
    return [{
      lead: `Manche spéciale ${specialTutorialLabel}.`,
      bullets: [],
    }];
  })();
  const specialTutorialContent = Array.isArray(specialTutorialSteps)
    ? specialTutorialSteps[
        clampValue(specialTutorialStepIndex, 0, Math.max(0, specialTutorialSteps.length - 1))
      ] || null
    : null;
  const isInGameSpecial3Tutorial = isSpecial3TutorialInteractiveActive;
  const special3TutorialStep = isInGameSpecial3Tutorial
    ? clampValue(specialTutorialStepIndex, 0, Math.max(0, (specialTutorialSteps?.length || 1) - 1))
    : -1;
  const specialTutorialIsFirstStep = specialTutorialStepIndex <= 0;
  const specialTutorialIsLastStep =
    !Array.isArray(specialTutorialSteps) ||
    specialTutorialStepIndex >= Math.max(0, specialTutorialSteps.length - 1);
  const closeSpecialTutorial = React.useCallback(() => {
    setIsSpecialTutorialOpen(false);
    setSpecialTutorialStepIndex(0);
    if (specialTutorialPlan?.type) {
      markSpecialTutorialSeen(specialTutorialPlan.type);
    }
    setSpecialTutorialPlan(null);
  }, [markSpecialTutorialSeen, specialTutorialPlan]);
  const specialTutorialDemo = specialTutorialContent?.showFinaleBonusDemo ? (
    <FinaleBonusTilesDemo
      multiplier={specialTutorialPlan?.tileBonusMultiplier || FINALE_TILE_BONUS_MULTIPLIER}
    />
  ) : specialTutorialType === DAILY_SPECIAL_MODE && specialTutorialContent?.demoKind ? (
      <div
        className={`mt-4 rounded-xl border p-3 ${
          darkMode ? "bg-slate-900/80 border-slate-700" : "bg-white/90 border-slate-200"
        }`}
      >
        <style>{`
@keyframes special3TutorialArrow {
  0%, 100% { transform: translateX(0); opacity: 0.55; }
  50% { transform: translateX(10px); opacity: 1; }
}
@keyframes special3TutorialGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.12); }
  50% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
}
`}</style>
        {specialTutorialContent.demoKind === "special3_drag" ? (
          <div className="flex items-center justify-center gap-3">
            <div
              className={`rounded-2xl border-2 border-dashed p-3 ${
                darkMode ? "border-amber-400/70 bg-slate-800/70" : "border-amber-400 bg-amber-50"
              }`}
            >
              <div className="grid grid-cols-2 gap-2">
                {["L2", "L3", "M2", "M3"].map((bonusKey) => {
                  const bonusStyle = SPECIAL_TUTORIAL_BONUS_TILE_STYLES[bonusKey];
                  return (
                    <div
                      key={`special3-demo-bonus-${bonusKey}`}
                      className="relative flex h-11 w-11 items-center justify-center rounded-xl border-2 text-[11px] font-black"
                      style={{
                        background: bonusStyle?.bg,
                        borderColor: bonusStyle?.border,
                        color: bonusStyle?.text,
                        animation: "special3TutorialGlow 1.8s ease-in-out infinite",
                      }}
                    >
                      {bonusKey}
                    </div>
                  );
                })}
              </div>
            </div>
            <div
              className={`text-3xl font-black ${darkMode ? "text-amber-300" : "text-amber-500"}`}
              style={{ animation: "special3TutorialArrow 1.4s ease-in-out infinite" }}
            >
              →
            </div>
            <div
              className="grid rounded-xl p-2"
              style={{
                gridTemplateColumns: "repeat(4, 38px)",
                gridTemplateRows: "repeat(4, 38px)",
                gap: "6px",
              }}
            >
              {Array.from({ length: 16 }).map((_, idx) => {
                const highlighted = idx === 5 || idx === 6 || idx === 10;
                return (
                  <div
                    key={`special3-demo-grid-${idx}`}
                    className={`rounded-lg border flex items-center justify-center text-xs font-black ${
                      darkMode ? "bg-slate-800/70 border-slate-600" : "bg-slate-100 border-slate-300"
                    }`}
                    style={
                      highlighted
                        ? {
                            boxShadow: "inset 0 0 0 2px rgba(245, 158, 11, 0.95)",
                            background: darkMode ? "rgba(120, 53, 15, 0.45)" : "rgba(254, 215, 170, 0.85)",
                          }
                        : undefined
                    }
                  >
                    {highlighted ? "+" : ""}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
        {specialTutorialContent.demoKind === "special3_slots" ? (
          <div className="space-y-3">
            <div className="grid gap-2">
              {[1, 2, 3].map((slotNo) => (
                <div
                  key={`special3-demo-slot-${slotNo}`}
                  className={`rounded-xl border-2 border-dashed px-3 py-2 ${
                    darkMode ? "border-amber-400/70 bg-slate-800/70" : "border-amber-400 bg-amber-50"
                  }`}
                >
                  <div className="text-[11px] font-semibold opacity-70">Mot {slotNo}</div>
                  <div className="mt-1 text-sm font-black tracking-wide">
                    {slotNo === 1 ? "TABLE" : slotNo === 2 ? "BANC" : "RIVE"}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3 text-center">
              <div className={`text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                mots d'abord
              </div>
              <div
                className={`text-2xl font-black ${darkMode ? "text-amber-300" : "text-amber-500"}`}
                style={{ animation: "special3TutorialArrow 1.4s ease-in-out infinite" }}
              >
                ↔
              </div>
              <div className={`text-xs font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
                bonus d'abord
              </div>
            </div>
          </div>
        ) : null}
        {specialTutorialContent.demoKind === "special3_start_tile" ? (
          <div
            className="grid place-content-center"
            style={{
              gridTemplateColumns: "repeat(4, 40px)",
              gridTemplateRows: "repeat(4, 40px)",
              gap: "6px",
            }}
          >
            {Array.from({ length: 16 }).map((_, idx) => {
              const isUsedStart = idx === 1;
              const isOtherStart = idx === 6 || idx === 10;
              return (
                <div
                  key={`special3-demo-start-${idx}`}
                  className={`relative rounded-lg border flex items-center justify-center text-xs font-black ${
                    darkMode ? "bg-slate-800/70 border-slate-600" : "bg-slate-100 border-slate-300"
                  }`}
                  style={
                    isOtherStart
                      ? {
                          boxShadow: "inset 0 0 0 2px rgba(245, 158, 11, 0.95)",
                        }
                      : undefined
                  }
                >
                  {isUsedStart ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-[2px] rounded-[8px]"
                      style={{
                        background:
                          "repeating-linear-gradient(135deg, rgba(15,23,42,0.42) 0 4px, rgba(15,23,42,0) 4px 9px)",
                        boxShadow: "inset 0 0 0 2px rgba(15,23,42,0.26)",
                      }}
                    />
                  ) : null}
                  <span className="relative z-[1]">{isUsedStart ? "A" : isOtherStart ? "A" : ""}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    ) : specialTutorialContent?.showTargetDemo && specialTutorialPlan ? (
      <div
        className={`mt-4 rounded-xl border p-3 ${
          darkMode ? "bg-slate-900/80 border-slate-700" : "bg-white/90 border-slate-200"
        }`}
      >
        <div className={`text-[11px] font-semibold ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
          Indices progressifs
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-lg font-black tracking-[0.3em]">
          {["_", "_", "_", "_", "_", "_"].map((mark, idx) => {
            const isHintLetter = idx === 2;
            return (
              <span
                key={`hint-${idx}`}
                className={isHintLetter ? "special-hint-letter text-amber-500" : ""}
              >
                {isHintLetter ? "A" : mark}
              </span>
            );
          })}
        </div>
        <div
          className="mt-3 grid place-content-center"
          style={{
            gridTemplateColumns: "repeat(4, 44px)",
            gridTemplateRows: "repeat(4, 44px)",
            gap: "6px",
          }}
        >
          {Array.from({ length: 16 }).map((_, idx) => {
            const isHint = idx === 5;
            const hintStyleClass = isHint
              ? specialTutorialContent?.targetIsScore
                ? "special-hint-outline"
                : "special-hint-fill"
              : "";
            const bonusMap = specialTutorialContent?.targetIsScore
              ? new Map([
                  [1, "L2"],
                  [3, "M2"],
                  [10, "L3"],
                  [12, "M3"],
                ])
              : null;
            const bonusKey = bonusMap?.get(idx) || null;
            const bonusStyle = bonusKey ? SPECIAL_TUTORIAL_BONUS_TILE_STYLES[bonusKey] : null;
            return (
              <div
                key={`demo-cell-${idx}`}
                className={`relative flex items-center justify-center rounded-lg border text-sm font-black ${
                  darkMode ? "bg-slate-800/70 border-slate-600" : "bg-slate-100 border-slate-300"
                } ${isHint ? "special-hint-tile" : ""} ${hintStyleClass}`}
                style={
                  bonusStyle
                    ? {
                        background: bonusStyle.bg,
                        borderColor: bonusStyle.border,
                        color: bonusStyle.text,
                      }
                    : undefined
                }
              >
                {bonusKey ? (
                  <span
                    className={`absolute -top-1 -right-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-black ${
                      bonusKey === "M3"
                        ? "bg-red-600 text-white"
                        : bonusKey === "M2"
                        ? "bg-blue-700 text-white"
                        : "bg-amber-600 text-white"
                    }`}
                  >
                    {bonusKey}
                  </span>
                ) : null}
                {isHint ? <span className="special-hint-letter">A</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    ) : null;
  const special3GuideIcon =
    special3TutorialStep === 0
      ? "swipe_vertical"
      : special3TutorialStep === 1
      ? "gesture_select"
      : "rule";
  const special3GuideTitle =
    special3TutorialStep === 0
      ? "Fais glisser une tuile spéciale sur la grille"
      : special3TutorialStep === 1
      ? "Trace puis valide un premier mot"
      : "Chaque mot doit partir d'une autre tuile";
  const special3GuideBody =
    special3TutorialStep === 0
      ? "Les tuiles spéciales restent déplaçables: commence par en poser une où tu veux."
      : special3TutorialStep === 1
      ? "Tu peux valider les mots avant les bonus, ou déplacer les bonus ensuite. Liberté totale."
      : "Les tuiles de départ déjà utilisées se hachurent. Tu peux supprimer n'importe quel mot déjà validé pour en tracer un autre. Bonne chance !";
  const special3GuideTitleMobile =
    special3TutorialStep === 0
      ? "Fais glisser une tuile spéciale sur la grille"
      : special3TutorialStep === 1
      ? "Trace puis valide un premier mot"
      : "Chaque mot doit partir d'une autre tuile";
  const special3GuideBodyMobile =
    special3TutorialStep === 0
      ? "Les tuiles spéciales restent déplaçables: commence par en poser une où tu veux."
      : special3TutorialStep === 1
      ? "Tu peux valider les mots avant les bonus, ou déplacer les bonus ensuite. Liberté totale."
      : "Les tuiles de départ déjà utilisées se hachurent. Tu peux supprimer n'importe quel mot déjà validé pour en tracer un autre. Bonne chance !";
  const special3GuideCardTitle = isMobileLayout ? special3GuideTitleMobile : special3GuideTitle;
  const special3GuideCardBody = isMobileLayout ? special3GuideBodyMobile : special3GuideBody;
  const special3ShowGlobalTutorialCard =
    !((isMobileLayout && special3TutorialStep === 1) || (!isMobileLayout && special3TutorialStep === 1));
  const special3InGameTutorialCard =
    isInGameSpecial3Tutorial && specialTutorialContent && special3ShowGlobalTutorialCard ? (
      <>
        <style>{`
          .special3-tutorial-focus {
            box-shadow:
              0 0 0 3px rgba(251, 191, 36, 0.35),
              inset 0 0 0 2px rgba(251, 191, 36, 0.55);
          }
          .special3-tutorial-ghost {
            animation: special3TutorialGhostMove 1.8s ease-in-out infinite;
          }
          .special3-tutorial-pulse {
            animation: specialHintTile 1.8s ease-in-out infinite;
          }
          .special3-tutorial-mobile-ghost {
            animation: special3TutorialMobileGhostMove 1.8s ease-in-out infinite;
          }
          .special3-tutorial-arrow {
            animation: special3TutorialArrowBob 1.1s ease-in-out infinite;
          }
          @keyframes special3TutorialArrowBob {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(5px); }
          }
          @keyframes special3TutorialMobileGhostMove {
            0% {
              transform: translate(0, 0) scale(1);
              opacity: 0;
            }
            18% {
              opacity: 0.92;
            }
            70% {
              transform: translate(var(--special3-ghost-dx, 0px), var(--special3-ghost-dy, 0px)) scale(1.06);
              opacity: 0.96;
            }
            100% {
              transform: translate(var(--special3-ghost-dx, 0px), var(--special3-ghost-dy, 0px)) scale(1.02);
              opacity: 0;
            }
          }
        `}</style>
        <div
          className={`z-[80] pointer-events-none ${
            isMobileLayout ? "fixed inset-x-3 top-3" : "absolute inset-x-3 top-3"
          }`}
        >
          <div
            className={`pointer-events-auto rounded-2xl border shadow-xl ${
              isMobileLayout ? "px-3 py-2" : "px-4 py-3"
            } ${
              darkMode
                ? "border-amber-300 bg-amber-500 text-slate-950"
                : "border-amber-300 bg-amber-500 text-slate-900"
            }`}
          >
            <div className={`flex items-start ${isMobileLayout ? "gap-2" : "gap-3"}`}>
              <span className={`material-symbols-outlined mt-0.5 ${isMobileLayout ? "text-[18px]" : "text-[24px]"}`}>
                {special3GuideIcon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className={`font-extrabold tracking-widest uppercase opacity-75 ${isMobileLayout ? "text-[10px]" : "text-[11px]"}`}>
                    Tutoriel 3 mots
                  </div>
                  {Array.isArray(specialTutorialSteps) && specialTutorialSteps.length > 1 ? (
                    <div className={`font-semibold opacity-75 ${isMobileLayout ? "text-[10px]" : "text-[11px]"}`}>
                      {specialTutorialStepIndex + 1}/{specialTutorialSteps.length}
                    </div>
                  ) : null}
                </div>
                <div className={`mt-1 font-bold leading-tight ${isMobileLayout ? "text-[13px]" : "text-[15px]"}`}>
                  {special3GuideCardTitle}
                </div>
                <div className={`mt-1 leading-snug opacity-85 ${isMobileLayout ? "text-[11px]" : "text-[13px]"}`}>
                  {special3GuideCardBody}
                </div>
                {special3TutorialStep === 0 ? (
                  <div className="mt-2 flex items-center gap-2 text-[12px] font-semibold opacity-85">
                    <span className="material-symbols-outlined text-[18px] special3-tutorial-arrow">
                      arrow_downward
                    </span>
                    <span>Le tuto continue dès qu'une tuile spéciale est posée.</span>
                  </div>
                ) : null}
                {!isMobileLayout && special3TutorialStep === 1 ? (
                  <div className="mt-2 text-[12px] font-semibold opacity-85">
                    Le tuto continue dès qu'un premier mot est validé.
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={`rounded-full border font-semibold ${
                  isMobileLayout ? "px-2.5 py-1 text-[11px]" : "px-3 py-1 text-[12px]"
                } ${
                  darkMode
                    ? "border-amber-200/70 bg-amber-400 text-slate-950"
                    : "border-amber-200 bg-amber-400 text-slate-900"
                }`}
                onClick={() => {
                  if (special3TutorialStep < 2) {
                    setSpecialTutorialStepIndex(2);
                    return;
                  }
                  closeSpecialTutorial();
                }}
              >
                {special3TutorialStep < 2 ? "Passer" : "Compris"}
              </button>
            </div>
          </div>
        </div>
      </>
    ) : null;
  const special3MobileStep2TutorialOverlay =
    isMobileLayout &&
    isInGameSpecial3Tutorial &&
    special3TutorialStep === 1 &&
    mobileSpecial3Step2OverlayStyle ? (
      <div
        className="absolute inset-x-0 z-[82] pointer-events-none"
        style={mobileSpecial3Step2OverlayStyle}
      >
        <div
          className={`pointer-events-auto rounded-2xl border px-3 py-2 shadow-xl ${
            darkMode
              ? "border-amber-300 bg-amber-500 text-slate-950"
              : "border-amber-300 bg-amber-500 text-slate-900"
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] mt-0.5">
              gesture_select
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-extrabold tracking-widest uppercase opacity-75">
                Tutoriel 3 mots
              </div>
              <div className="mt-1 text-[13px] font-bold leading-tight">
                {special3GuideTitle}
              </div>
              <div className="mt-1 text-[11px] leading-snug opacity-85">
                {special3GuideBody}
              </div>
              <div className="mt-2 text-[11px] font-semibold opacity-85">
                Le tuto continue dès qu'un premier mot est validé.
              </div>
            </div>
            <button
              type="button"
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                darkMode
                  ? "border-amber-200/70 bg-amber-400 text-slate-950"
                  : "border-amber-200 bg-amber-400 text-slate-900"
              }`}
              onClick={() => setSpecialTutorialStepIndex(2)}
            >
              Passer
            </button>
          </div>
        </div>
      </div>
    ) : null;
  const special3DesktopStep2TutorialOverlay =
    !isMobileLayout &&
    isInGameSpecial3Tutorial &&
    special3TutorialStep === 1 ? (
      <div className="absolute inset-0 z-[82] pointer-events-none">
        <div
          className={`pointer-events-auto h-full rounded-2xl border px-4 py-3 shadow-xl ${
            darkMode
              ? "border-amber-300 bg-amber-500 text-slate-950"
              : "border-amber-300 bg-amber-500 text-slate-900"
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[24px] mt-0.5">
              gesture_select
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-extrabold tracking-widest uppercase opacity-75">
                  Tutoriel 3 mots
                </div>
                {Array.isArray(specialTutorialSteps) && specialTutorialSteps.length > 1 ? (
                  <div className="text-[11px] font-semibold opacity-75">
                    {specialTutorialStepIndex + 1}/{specialTutorialSteps.length}
                  </div>
                ) : null}
              </div>
              <div className="mt-1 text-[15px] font-bold leading-tight">
                {special3GuideTitle}
              </div>
              <div className="mt-1 text-[13px] leading-snug opacity-85">
                {special3GuideBody}
              </div>
              <div className="mt-2 text-[12px] font-semibold opacity-85">
                Le tuto continue dès qu'un premier mot est validé.
              </div>
            </div>
            <button
              type="button"
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${
                darkMode
                  ? "border-amber-200/70 bg-amber-400 text-slate-950"
                  : "border-amber-200 bg-amber-400 text-slate-900"
              }`}
              onClick={() => setSpecialTutorialStepIndex(2)}
            >
              Passer
            </button>
          </div>
        </div>
      </div>
    ) : null;
  const special3MobileStep1Ghost =
    isMobileLayout &&
    isInGameSpecial3Tutorial &&
    special3TutorialStep === 0 &&
    mobileSpecial3Step1GhostStyle ? (
      <div
        className="absolute z-[81] pointer-events-none"
        style={mobileSpecial3Step1GhostStyle}
      >
        <div className="special3-tutorial-mobile-ghost opacity-75">
          {renderSpecial3BonusChipButton("M3", {
            keyPrefix: "tutorial-mobile-special3-ghost",
            sizeClass: "h-14 min-w-14 px-3",
          })}
        </div>
      </div>
    ) : null;
  const specialTutorialOverlay =
    specialTutorialType !== DAILY_SPECIAL_MODE &&
    isSpecialTutorialOpen &&
    specialTutorialPlan &&
    specialTutorialContent &&
    typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[13080] flex items-center justify-center px-4 py-6">
            <div
              className={`absolute inset-0 ${darkMode ? "bg-black/60" : "bg-white/60"} backdrop-blur-sm`}
            />
            <div
              role="dialog"
              aria-modal="true"
              className={`relative w-full max-w-lg rounded-2xl border p-4 shadow-2xl ${
                darkMode
                  ? "bg-slate-900/95 border-slate-700 text-slate-100"
                  : "bg-white/95 border-slate-200 text-slate-900"
              }`}
            >
              <div className="text-[11px] font-extrabold tracking-widest uppercase text-amber-500">
                {specialTutorialType === FINALE_TYPE ? "Manche finale" : "Manche spéciale"}
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="text-lg font-black">{specialTutorialLabel}</div>
                {Array.isArray(specialTutorialSteps) && specialTutorialSteps.length > 1 ? (
                  <div className={`text-[11px] font-semibold ${darkMode ? "text-slate-300" : "text-slate-500"}`}>
                    {specialTutorialStepIndex + 1}/{specialTutorialSteps.length}
                  </div>
                ) : null}
              </div>
              <p className={`mt-2 text-sm ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
                {specialTutorialContent.lead}
              </p>
              {specialTutorialContent.bullets?.length ? (
                <ul className="mt-3 text-[12px] list-disc list-inside space-y-1">
                  {specialTutorialContent.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {specialTutorialDemo}
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                    specialTutorialIsFirstStep
                      ? "opacity-0 pointer-events-none"
                      : darkMode
                      ? "bg-slate-800 hover:bg-slate-700"
                      : "bg-slate-100 hover:bg-slate-200"
                  }`}
                  onClick={() =>
                    setSpecialTutorialStepIndex((prev) => Math.max(0, prev - 1))
                  }
                >
                  Précédent
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-semibold text-white ${
                    darkMode ? "bg-amber-500 hover:bg-amber-400" : "bg-amber-500 hover:bg-amber-400"
                  }`}
                  onClick={() => {
                    if (!specialTutorialIsLastStep) {
                      setSpecialTutorialStepIndex((prev) =>
                        Math.min((specialTutorialSteps?.length || 1) - 1, prev + 1)
                      );
                      return;
                    }
                    closeSpecialTutorial();
                  }}
                >
                  {specialTutorialIsLastStep ? "Compris !" : "Suivant"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;
  const tutorialOverlay = (
    <TutorialOverlay
      open={isTutorialOpen}
      darkMode={darkMode}
      onComplete={completeTutorial}
    />
  );

  return {
    special3DesktopStep2TutorialOverlay,
    special3InGameTutorialCard,
    special3MobileStep1Ghost,
    special3MobileStep2TutorialOverlay,
    specialTutorialOverlay,
    tutorialOverlay,
  };
}
