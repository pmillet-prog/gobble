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
  const maintenanceMode = isHomeMaintenanceActive({
    dailyStatus,
    tournamentLobby: lobby?.tournamentLobby,
  });
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
        maintenanceMode={maintenanceMode}
        onIntroComplete={intro?.onComplete}
        displayModeAction={displayMode?.action}
        onToggleFullscreen={displayMode?.onToggleFullscreen}
        {...homeLobbyActions}
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
