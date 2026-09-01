import React from "react";

import HomeLobby from "../../components/home/HomeLobby.jsx";
import useHomeLobbyActions from "../../components/home/useHomeLobbyActions.js";
import StandaloneTrainingPicker from "../../components/training/StandaloneTrainingPicker.jsx";
import HomeApplicationRuntime from "./HomeApplicationRuntime.jsx";
import {
  countHomeLobbyPlayers,
  getHomeDailyRemainingCount,
  isHomeMaintenanceActive,
} from "./homeViewModel.js";

export default function HomeApplication({
  account,
  actions,
  dailyStatus,
  displayMode,
  duel,
  intro,
  lobby,
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

  return (
    <>
      {runtime ? <HomeApplicationRuntime {...runtime} /> : null}
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
