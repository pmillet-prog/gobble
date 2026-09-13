import React from "react";
import { createPortal } from "react-dom";
import { getSpecialRoundReminder } from "./specialRoundReminder.js";

const TutorialApplication = React.lazy(() => import("../../features/tutorial/TutorialApplication.jsx"));

export default function useTutorialPresentation({
  completeTutorial, darkMode, isSpecialTutorialOpen, isTutorialOpen,
  markSpecialTutorialSeen, setIsSpecialTutorialOpen, setSpecialTutorialPlan,
  specialTutorialPlan, tutorialIdentity, tutorialPendingLogin, tutorialGame,
}) {
  const reminder = isSpecialTutorialOpen && !isTutorialOpen
    ? getSpecialRoundReminder(specialTutorialPlan) : null;
  const reminderVisible = !!reminder;
  const closeReminder = React.useCallback(() => {
    if (specialTutorialPlan?.type) markSpecialTutorialSeen(specialTutorialPlan.type);
    setIsSpecialTutorialOpen(false);
    setSpecialTutorialPlan(null);
  }, [markSpecialTutorialSeen, setIsSpecialTutorialOpen, setSpecialTutorialPlan, specialTutorialPlan]);

  React.useEffect(() => {
    if (!reminderVisible) return undefined;
    const onKey = event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeReminder();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reminderVisible, closeReminder]);

  const specialTutorialOverlay = reminder && typeof document !== "undefined"
    ? createPortal(
      <div className="fixed inset-0 z-[13080] flex items-center justify-center px-4 py-6">
        <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeReminder} aria-label="Fermer le rappel des règles" />
        <div role="dialog" aria-modal="true" aria-labelledby="round-rules-title"
          className={`relative w-full max-w-lg max-h-full overflow-y-auto rounded-2xl border p-5 shadow-2xl ${darkMode
            ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600">Première fois · rappel des règles</p>
          <h2 id="round-rules-title" className="mt-1 text-lg font-black">{reminder.title}</h2>
          <ul className="mt-3 list-disc pl-5 space-y-2 text-sm leading-relaxed">
            {reminder.rules.map(rule => <li key={rule}>{rule}</li>)}
          </ul>
          <button type="button" autoFocus onClick={closeReminder}
            className="mt-5 w-full rounded-xl bg-amber-500 px-4 py-3 font-bold text-slate-950 hover:bg-amber-400">Compris, à moi de jouer !</button>
        </div>
      </div>, document.body,
    ) : null;

  return {
    // Scene inputs remain neutral: automatic in-game tours have been retired.
    isInGameSpecial3Tutorial: false,
    special3DesktopStep2TutorialOverlay: null,
    special3InGameTutorialCard: null,
    special3MobileStep1Ghost: null,
    special3MobileStep2TutorialOverlay: null,
    special3TutorialStep: -1,
    specialTutorialOverlay,
    tutorialOverlay: isTutorialOpen ? <React.Suspense fallback={null}>
      <TutorialApplication game={tutorialGame} darkMode={darkMode} onComplete={completeTutorial}
        identity={tutorialIdentity} autoStart={tutorialPendingLogin} pendingLogin={tutorialPendingLogin} />
    </React.Suspense> : null,
  };
}
