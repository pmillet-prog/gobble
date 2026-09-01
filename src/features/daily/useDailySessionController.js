import React from "react";

import { useLazyArrayController } from "../../app/react/useLazyController.js";
import { createDailyGameController } from "../../components/daily/createDailyGameController.js";

export default function useDailySessionController({
  application,
  audio,
  daily,
  duel,
  game,
  identity,
  network,
  notifications,
}) {
  const dailyLifecycleRef = React.useRef({ startGeneration: 0 });
  const dailySessionRef = React.useRef({ dateId: null, startedAt: null });
  const dailySubmitRef = React.useRef({ inFlight: false });
  const dailyTictocPlayedRef = React.useRef(false);

  const [
    startDailyGame,
    submitDailyScore,
    openDailyLaunchDialog,
    closeDailyLaunchDialog,
    confirmDailyLaunch,
  ] = useLazyArrayController(createDailyGameController, [
    game?.getProgress,
    game?.acceptedRef,
    application?.appViewRef,
    game?.applyThemeVisualState,
    game?.board,
    game?.clearSelection,
    daily?.acceptedPathsRef,
    daily?.launchDialog,
    dailyLifecycleRef,
    daily?.playMode,
    dailySessionRef,
    daily?.specialDragRef,
    daily?.specialPlacements,
    daily?.status,
    dailySubmitRef,
    dailyTictocPlayedRef,
    daily?.wordSlots,
    network?.emitSocketAck,
    network?.ensureAuthenticated,
    network?.fetchDailyBoard,
    network?.fetchDailyStatus,
    game?.fetchThemeProfileRef,
    game?.inputLockedRef,
    identity?.installId,
    application?.isDailyPlayRef,
    daily?.isSpecialMode,
    identity?.nickname,
    network?.readJsonResponseLoose,
    audio?.requestUnlock,
    game?.resetSubmissionQueue,
    application?.setAppView,
    daily?.actions?.setActiveSlot,
    daily?.actions?.setBoard,
    daily?.actions?.setInvalidSlot,
    daily?.actions?.setLaunchDialog,
    daily?.actions?.setPlayMode,
    daily?.actions?.setResult,
    daily?.actions?.setSection,
    daily?.actions?.setSpecialDrag,
    daily?.actions?.setSpecialPlacements,
    daily?.actions?.setStartError,
    daily?.actions?.setStatus,
    daily?.actions?.setSubmitError,
    daily?.actions?.setWordSlots,
    duel?.setStatus,
    game?.setInputLocked,
    game?.setPhase,
    game?.setRoundId,
    game?.setServerEndsAt,
    game?.setServerRoundDurationMs,
    game?.setServerStatus,
    notifications?.showToast,
    game?.specialScoreConfig,
    game?.startGameFromServerRef,
    game?.themeAppliedSafe,
    game?.gameplaySession,
  ], 5);

  const resetDailySession = React.useCallback(() => {
    dailySessionRef.current = { dateId: null, startedAt: null };
  }, []);

  return {
    closeDailyLaunchDialog,
    confirmDailyLaunch,
    dailySessionRef,
    dailyTictocPlayedRef,
    openDailyLaunchDialog,
    resetDailySession,
    startDailyGame,
    submitDailyScore,
  };
}
