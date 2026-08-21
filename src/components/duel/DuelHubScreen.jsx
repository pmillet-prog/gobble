import React, { Suspense } from "react";
import DuelWeeklyWidget from "../DuelWeeklyWidget.jsx";

const DuelObjectivesPanel = React.lazy(() => import("../DuelObjectivesPanel.jsx"));

export default function DuelHubScreen({
  overlays,
  appearance,
  duel,
  identity,
  actions,
  renderHumanDot,
}) {
  const {
    aboutModalView,
    authDialogView,
    definitionModalView,
    playerProfileModalView,
    playersOverlay,
    quickHelpOverlay,
    settingsMenuView,
    tutorialOverlay,
  } = overlays;
  const { darkMode, menuDarkMode, weeklyOverlayStyle } = appearance;
  const {
    dailyStatus,
    duelBlueScore,
    duelContributorsBlue,
    duelContributorsRed,
    duelRedScore,
    duelRerollBusyBucket,
    duelStatus,
    duelTeam,
  } = duel;
  const { installId, selfNick } = identity;
  const {
    getDuelConsumedValidatedKeys,
    handleDuelObjectiveValidated,
    markDuelValidatedObjectiveConsumed,
    rerollDuelObjective,
    setAppView,
  } = actions;
  const dailyHomePanelClass = "border-amber-200/25 bg-slate-950/35 text-amber-50";
  const dailyHomeRowBorderClass = "border-amber-200/10";
  const renderDuelContributorsColumn = (
    entries,
    team,
    maxHeightClass = "max-h-[360px]"
  ) => (
    <div
      className={`rounded-xl border px-2 py-1.5 ${maxHeightClass} overflow-y-auto custom-scrollbar custom-scrollbar-gray ${dailyHomePanelClass}`}
    >
      {entries.length ? (
        entries.map((entry, idx) => {
          const points = Number(entry?.points) || 0;
          const isSelfEntry =
            (entry?.installId && installId && entry.installId === installId) ||
            (entry?.nick && selfNick && entry.nick === selfNick);
          return (
            <div
              key={entry?.installId || `${entry?.nick}-${idx}`}
              className={`flex items-center justify-between gap-2 py-1.5 text-xs border-b last:border-b-0 ${dailyHomeRowBorderClass} ${
                isSelfEntry ? "bg-emerald-900/30 text-emerald-100" : ""
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-black tabular-nums w-5 text-right opacity-70">
                  {idx + 1}
                </span>
                <span className="truncate text-[10px] sm:text-[11px] font-semibold leading-tight flex items-center gap-1">
                  {entry?.nick || "Joueur"}
                  {renderHumanDot(entry?.nick, { ...entry, team })}
                </span>
              </div>
              <span className="text-[10px] font-semibold opacity-85 shrink-0">{points} pts</span>
            </div>
          );
        })
      ) : (
        <div className="text-xs opacity-70 py-6 text-center">Aucune contribution.</div>
      )}
    </div>
  );

    return (
      <>
        {playersOverlay}
        {playerProfileModalView}
        {definitionModalView}
        {tutorialOverlay}
        {authDialogView}
        {settingsMenuView}
        {aboutModalView}
        {quickHelpOverlay}
        <div
          className={`w-full flex items-stretch justify-center px-2 sm:px-4 overflow-hidden ${
            darkMode
              ? "bg-gradient-to-br from-slate-900 via-slate-950 to-slate-800 text-white"
              : "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
          }`}
          style={weeklyOverlayStyle}
        >
          <div
            className={`relative w-full max-w-none h-full rounded-2xl border shadow-2xl overflow-hidden flex flex-col min-h-0 ${
              menuDarkMode
                ? "bg-slate-900/90 border-white/10 text-white"
                : "bg-white/95 border-slate-200 text-slate-900"
            }`}
          >
            <div className="p-4 pb-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-70">
                  DUEL D'EQUIPES
                </div>
                <button
                  type="button"
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full border ${
                    menuDarkMode
                      ? "bg-slate-800/80 border-white/10 text-slate-100"
                      : "bg-white border-slate-200 text-slate-700"
                  }`}
                  onClick={() => setAppView("home")}
                  aria-label="Fermer le duel"
                >
                  Fermer
                </button>
              </div>
              <DuelWeeklyWidget darkMode={menuDarkMode} redScore={duelRedScore} blueScore={duelBlueScore} />
              {duelStatus?.error ? (
                <div className={`text-center text-[11px] ${menuDarkMode ? "text-amber-300" : "text-amber-700"}`}>
                  Impossible de récupérer le duel sur cette machine ({duelStatus.error})
                </div>
              ) : null}
              <div
                className={`rounded-xl border px-3 py-2 text-xs ${
                  menuDarkMode ? "border-white/10 bg-slate-900/50" : "border-slate-200 bg-white"
                }`}
              >
                Equipe:{" "}
                <span className={duelTeam === "red" ? "text-red-500 font-bold" : duelTeam === "blue" ? "text-blue-500 font-bold" : ""}>
                  {duelTeam === "red" ? "Rouge" : duelTeam === "blue" ? "Bleue" : "Attribution en cours"}
                </span>
                {duelStatus?.crowned ? " • Couronné" : ""}
              </div>
            </div>
            <div
              className="px-4 pb-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar custom-scrollbar-gray"
              data-stats-scroll="true"
              style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y" }}
            >
              <div className="space-y-3">
                <Suspense fallback={null}>
                  <DuelObjectivesPanel
                    darkMode={menuDarkMode}
                    objectivesStatus={duelStatus?.objectives}
                    onReroll={rerollDuelObjective}
                    rerollBusyBucket={duelRerollBusyBucket}
                    onObjectiveValidated={handleDuelObjectiveValidated}
                    hiddenValidatedKeys={getDuelConsumedValidatedKeys("page")}
                    onValidatedObjectiveConsumed={(objective, key) =>
                      markDuelValidatedObjectiveConsumed("page", objective, key)
                    }
                    hasPlayedDaily={!!dailyStatus?.hasPlayed}
                  />
                </Suspense>
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.16em] font-bold opacity-70">
                    Meilleurs contributeurs
                  </div>
                  <div className="grid grid-cols-2 items-center gap-0 text-xs font-black">
                    <div className="text-red-500 text-center truncate">ROUGE</div>
                    <div className="text-blue-500 text-center truncate">BLEU</div>
                  </div>
                  <div className="grid grid-cols-2 items-start gap-0">
                    {renderDuelContributorsColumn(duelContributorsRed, "red", "max-h-[320px]")}
                    {renderDuelContributorsColumn(duelContributorsBlue, "blue", "max-h-[320px]")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }
