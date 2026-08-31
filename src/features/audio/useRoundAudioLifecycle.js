import React from "react";

export function shouldStartRoundAudio({
  lastStartedRoundId,
  phase,
  roundId,
  suppressStart,
}) {
  return (
    phase === "playing" &&
    !!roundId &&
    lastStartedRoundId !== roundId &&
    !suppressStart
  );
}

export function resolveRoundAmbientTransition({
  isAmbientMuted,
  isDailyView,
  isLoggedIn,
  phase,
  previousPhase,
}) {
  const isResults = phase === "results";
  const canPlayLiveAmbient = isLoggedIn && !isDailyView && isResults;
  return {
    action: isAmbientMuted || !canPlayLiveAmbient ? "stop" : "start",
    resetOrder: isResults && previousPhase !== "results",
  };
}

export default function useRoundAudioLifecycle(config) {
  const configRef = React.useRef(config);
  configRef.current = config;
  const roundStartSoundRef = React.useRef(null);
  const previousAmbientPhaseRef = React.useRef(null);

  React.useEffect(() => {
    const current = configRef.current;
    if (
      !shouldStartRoundAudio({
        lastStartedRoundId: roundStartSoundRef.current,
        phase: current.phase,
        roundId: current.roundId,
        suppressStart: current.mobileRoundIntroSuppressRoundStartRef?.current,
      })
    ) {
      return;
    }
    roundStartSoundRef.current = current.roundId;
    if (!current.audioUnlockedRef?.current) {
      if (current.roundStartPendingRef) {
        current.roundStartPendingRef.current = current.roundId;
      }
      return;
    }
    current.playRoundStartSound?.();
  }, [config.mobileRoundIntroStage, config.phase, config.roundId]);

  React.useEffect(() => {
    if (config.phase === "playing") return;
    const current = configRef.current;
    current.stopRoundEndTickSound?.({ fadeMs: 80 });
    current.stopIntroCountdownSound?.({ fadeMs: 80 });
    current.stopRoundStartSound?.({ fadeMs: 80 });
  }, [config.phase]);

  React.useEffect(() => {
    const current = configRef.current;
    const previousPhase = previousAmbientPhaseRef.current;
    previousAmbientPhaseRef.current = current.phase;
    const transition = resolveRoundAmbientTransition({
      isAmbientMuted: current.isAmbientMuted,
      isDailyView: current.isDailyView,
      isLoggedIn: current.isLoggedIn,
      phase: current.phase,
      previousPhase,
    });
    if (transition.resetOrder) current.resetAmbientOrder?.();
    if (transition.action === "start") {
      current.startAmbientMusic?.({ silent: false });
      return;
    }
    current.stopAmbientMusic?.({ fadeMs: 700, keepAlive: false });
  }, [config.isAmbientMuted, config.isDailyView, config.isLoggedIn, config.phase]);

  return { roundStartSoundRef };
}
