import React from "react";

import HomeChatModalHost from "../../components/HomeChatModalHost.jsx";
import HomeLobby from "../../components/home/HomeLobby.jsx";
import useHomeLobbyActions from "../../components/home/useHomeLobbyActions.js";
import StandaloneTrainingPicker from "../../components/training/StandaloneTrainingPicker.jsx";
import HomeApplicationRuntime from "./HomeApplicationRuntime.jsx";
import {
  countHomeLobbyPlayers,
  getHomeDailyRemainingCount,
  isHomeMaintenanceActive,
  resolveHomeTournamentLobby,
  shouldShowHomeBroadcastPopup,
} from "./homeViewModel.js";

const BroadcastNoticePopup = React.lazy(() =>
  import("../../components/BroadcastNoticePopup.jsx")
);
const VaultWordOfDayPopup = React.lazy(() =>
  import("../../components/home/VaultWordOfDayPopup.jsx")
);

export default function HomeApplication({
  account,
  actions,
  chat,
  dailyStatus,
  displayMode,
  duel,
  intro,
  lobby,
  overlays,
  resume,
  runtime,
  session,
  training,
  weeklyRecapLoading = false,
}) {
  const homeLobbyActions = useHomeLobbyActions(actions);
  const playersCount = React.useMemo(
    () => countHomeLobbyPlayers(lobby),
    [
      lobby?.lobbyPlayersList,
      lobby?.players,
      lobby?.roomId,
      lobby?.roomsStats,
    ]
  );
  const dailyRemainingCount = getHomeDailyRemainingCount(dailyStatus);
  const tournamentLobby = resolveHomeTournamentLobby({
    roomId: lobby?.roomId,
    roomsStats: lobby?.roomsStats,
    tournamentLobby: lobby?.tournamentLobby,
  });
  const maintenanceMode = isHomeMaintenanceActive({
    dailyStatus,
    tournamentLobby,
  });
  const maintenanceLiveJoinAllowed = !!tournamentLobby?.maintenanceLiveJoinAllowed;
  const [maintenanceLiveAction, setMaintenanceLiveAction] = React.useState("");
  const requestLiveAction = React.useCallback(
    (actionName, event) => {
      if (!maintenanceLiveJoinAllowed) {
        homeLobbyActions[actionName]?.(event);
        return;
      }
      event?.preventDefault?.();
      setMaintenanceLiveAction(actionName);
    },
    [homeLobbyActions, maintenanceLiveJoinAllowed]
  );
  const confirmMaintenanceLiveJoin = React.useCallback(
    (event) => {
      const actionName = maintenanceLiveAction;
      setMaintenanceLiveAction("");
      if (!maintenanceLiveJoinAllowed) return;
      homeLobbyActions[actionName]?.(event);
    },
    [homeLobbyActions, maintenanceLiveAction, maintenanceLiveJoinAllowed]
  );
  React.useEffect(() => {
    if (!maintenanceLiveJoinAllowed && maintenanceLiveAction) {
      setMaintenanceLiveAction("");
    }
  }, [maintenanceLiveAction, maintenanceLiveJoinAllowed]);
  const accountLabel =
    account?.usernameDisplay ||
    account?.legacyProfileUsername ||
    account?.savedSessionNick ||
    account?.nickname ||
    "Compte";
  const showBroadcastPopup = shouldShowHomeBroadcastPopup({
    accountSeenMarkers: overlays?.broadcast?.accountSeenMarkers,
    accountSeenReady: overlays?.broadcast?.accountSeenReady,
    active: !!runtime,
    duelPopupMode: overlays?.broadcast?.duelPopupMode,
    isAccountAuthenticated: account?.isAuthenticated,
    isNewPlayerPopupQuiet: overlays?.broadcast?.isNewPlayerPopupQuiet,
    isTutorialOpen: overlays?.broadcast?.isTutorialOpen,
    message: overlays?.broadcast?.message,
    shouldShowTutorial: overlays?.broadcast?.shouldShowTutorial,
  });
  const vaultPopup = overlays?.vault?.popup;

  return (
    <>
      {runtime ? <HomeApplicationRuntime {...runtime} /> : null}
      {showBroadcastPopup ? (
        <React.Suspense fallback={null}>
          <BroadcastNoticePopup
            darkMode={overlays?.broadcast?.darkMode}
            message={overlays?.broadcast?.message}
            onClose={overlays?.broadcast?.onClose}
          />
        </React.Suspense>
      ) : null}
      {vaultPopup?.open ? (
        <React.Suspense fallback={null}>
          <VaultWordOfDayPopup
            definition={vaultPopup.definition}
            displayWord={vaultPopup.displayWord}
            onClose={overlays?.vault?.onClose}
            onOpenVault={overlays?.vault?.onOpenVault}
            source={vaultPopup.source}
            url={vaultPopup.url}
            word={vaultPopup.word}
          />
        </React.Suspense>
      ) : null}
      {maintenanceLiveAction && maintenanceLiveJoinAllowed ? (
        <div
          className="fixed inset-0 z-[22000] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setMaintenanceLiveAction("")}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-amber-300/40 bg-slate-950 px-5 py-5 text-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="maintenance-live-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div
              id="maintenance-live-title"
              className="text-center text-sm font-black uppercase tracking-[0.16em] text-amber-300"
            >
              Maintenance imminente
            </div>
            <p className="mt-3 text-center text-sm font-semibold leading-relaxed text-slate-100">
              Tu peux rejoindre ou reprendre le mini-tournoi en cours et le terminer. Une
              interruption pour maintenance est imminente et pourra avoir lieu dès qu'il sera fini.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-black text-white"
                onClick={() => setMaintenanceLiveAction("")}
              >
                Rester ici
              </button>
              <button
                type="button"
                className="rounded-xl bg-amber-400 px-3 py-2 text-sm font-black text-slate-950"
                onClick={confirmMaintenanceLiveJoin}
              >
                Continuer vers le live
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <HomeChatModalHost {...chat} />
      <HomeLobby
        accountLabel={accountLabel}
        accountOnline={account?.isAuthenticated}
        accountNotice={account?.notice}
        canResumeNow={resume?.canResumeNow}
        dailyRemainingCount={dailyRemainingCount}
        duelBlueScore={duel?.blueScore}
        duelRedScore={duel?.redScore}
        isAuthServerUnavailable={account?.serverUnavailable}
        isAuthStatusPending={account?.statusPending}
        isConnecting={session?.isConnecting}
        loginError={account?.loginError}
        maintenanceLiveJoinAllowed={maintenanceLiveJoinAllowed}
        maintenanceMode={maintenanceMode}
        onIntroComplete={intro?.onComplete}
        displayModeAction={displayMode?.action}
        onToggleFullscreen={displayMode?.onToggleFullscreen}
        {...homeLobbyActions}
        onPlay={(event) => requestLiveAction("onPlay", event)}
        onResume={(event) => requestLiveAction("onResume", event)}
        playerTeam={duel?.team}
        playIntro={intro?.play}
        playersCount={playersCount}
        resumePhaseLabel={resume?.phaseLabel}
        resumeRoomLabel={resume?.roomLabel}
        savedSessionNick={account?.savedSessionNick}
        trainingControl={
          <StandaloneTrainingPicker
            busy={training?.busy}
            darkMode={training?.darkMode}
            disabled={
              account?.statusPending ||
              session?.isConnecting ||
              maintenanceMode
            }
            onRequestOpen={training?.onRequestOpen}
            onStart={training?.onStart}
            playUiClickSound={training?.playUiClickSound}
            team={duel?.team}
          />
        }
        weeklyRecapLoading={weeklyRecapLoading}
      />
    </>
  );
}
