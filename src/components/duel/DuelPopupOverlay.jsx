import React from "react";
import { createPortal } from "react-dom";
import DuelObjectivesPanel from "../DuelObjectivesPanel.jsx";

export default function DuelPopupOverlay({ actions, darkMode, state, status, tutorialSteps }) {
  if (!state?.mode || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[12100] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
      <div
        className={`w-full max-w-md rounded-2xl border p-4 space-y-3 ${
          darkMode
            ? "bg-slate-900/95 border-white/10 text-slate-100"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {state.mode === "team" ? (
          <>
            <div className="text-lg font-black">Duel d'équipes</div>
            <div className="text-sm">
              Tu es dans l'équipe{" "}
              <span
                className={
                  state.team === "red"
                    ? "text-red-500 font-bold"
                    : "text-blue-500 font-bold"
                }
              >
                {state.team === "red" ? "Rouge" : "Bleue"}
              </span>{" "}
              cette semaine.
            </div>
            <button
              type="button"
              className="w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
              onClick={actions.onAcknowledgeTeam}
            >
              Compris
            </button>
          </>
        ) : state.mode === "objectives" || state.mode === "objectives_manual" ? (
          <>
            <div className="text-lg font-black">Objectifs du jour</div>
            <div className="text-sm opacity-80">
              Valide ces objectifs dans le jeu principal pour faire monter le score de ton équipe.
            </div>
            <DuelObjectivesPanel
              darkMode={darkMode}
              objectivesStatus={status.objectives}
              onReroll={actions.onReroll}
              rerollBusyBucket={status.rerollBusyBucket}
              onObjectiveValidated={actions.onObjectiveValidated}
              hiddenValidatedKeys={actions.getConsumedValidatedKeys("popup")}
              onValidatedObjectiveConsumed={(objective, key) =>
                actions.onValidatedObjectiveConsumed("popup", objective, key)
              }
              hasPlayedDaily={status.hasPlayedDaily}
            />
            <button
              type="button"
              className="w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
              onClick={actions.onCloseObjectives}
            >
              Continuer
            </button>
          </>
        ) : (
          <>
            <div className="text-lg font-black">Mini tuto Duel</div>
            <div className="text-sm">{tutorialSteps[state.step] || ""}</div>
            <div className="text-xs opacity-70">
              {state.step + 1}/{tutorialSteps.length}
            </div>
            <button
              type="button"
              className="w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
              onClick={actions.onAdvanceTutorial}
            >
              {state.step + 1 >= tutorialSteps.length ? "Terminer" : "Suivant"}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
