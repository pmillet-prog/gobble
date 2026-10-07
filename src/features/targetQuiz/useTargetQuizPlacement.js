import React from "react";
import { getTargetQuizEligibility } from "./targetQuizEligibility.js";
import { useFeatureFields, useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";

export default function useTargetQuizPlacement(context) {
  const eligibility = getTargetQuizEligibility(context);
  const feature = useFeatureRuntime("targetQuiz");
  const celebration = useFeatureRuntime("celebration");
  const getGobbleActive = React.useCallback(() => !!celebration.getSnapshot().gobbleFlash, [celebration]);
  const gobbleActive = React.useSyncExternalStore(celebration.subscribe, getGobbleActive, getGobbleActive);
  const current = useFeatureFields(feature, ["key", "entered", "started", "dismissed", "targetFoundAt"]);
  const key = context.appView === "live" && context.isLoggedIn && !context.currentRoundTraining && !context.standaloneTrainingSession
    ? `${context.userId ?? context.nickname}:${context.roomId}:${context.roundId}` : "";
  React.useLayoutEffect(() => {
    feature.configure({ key, roundId: context.roundId, selfUserId: context.userId, selfNick: context.nickname });
    if (eligibility.active) feature.enter({ endsAt: context.endsAt, now: context.getNowServerMs(), devPreview: eligibility.devPreview });
  }, [feature, key, context.roundId, context.userId, context.nickname, context.endsAt, context.getNowServerMs, eligibility.active, eligibility.devPreview, current.targetFoundAt]);
  React.useEffect(() => {
    if (!eligibility.canRun || !context.socket) return undefined;
    const onSolved = payload => {
      if (String(payload?.roomId) !== String(context.roomId) || payload?.nick !== context.nickname ||
          !["target_long", "target_score"].includes(payload?.kind)) return;
      feature.noteDiscovery(payload.roundId, payload.targetFoundAt);
    };
    context.socket.on("specialSolved", onSolved);
    const onProgress = value => {
      if (String(value?.roundId) === String(context.roundId)) feature.capture(context.roundId, { ...value, started: true });
    };
    context.socket.on("targetQuiz:progress", onProgress);
    return () => {
      context.socket.off("specialSolved", onSolved);
      context.socket.off("targetQuiz:progress", onProgress);
    };
  }, [feature, eligibility.canRun, context.socket, context.roomId, context.nickname]);
  // Latch eligibility when the target is found (>5 s), but let the existing
  // celebration finish before mounting any quiz UI, audio or question session.
  // Once playing, a subsequent celebration must not interrupt the mini-game.
  const presentationReady = current.started || (!gobbleActive && context.endsAt > context.getNowServerMs());
  const active = eligibility.active && current.key === key && current.entered && !current.dismissed && presentationReady;
  const onSessionStateChange = React.useCallback(value => feature.capture(context.roundId, value), [feature, context.roundId]);
  const [gridHost, setGridHost] = React.useState(null);
  const [sideHost, setSideHost] = React.useState(null);

  return { ...eligibility, active, gridHost, sideHost, setGridHost, setSideHost, onSessionStateChange, onDismiss: feature.dismiss };
}
