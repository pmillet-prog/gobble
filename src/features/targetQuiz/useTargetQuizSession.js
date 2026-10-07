import React from "react";
import { createTargetQuizController } from "./targetQuizController.js";

export default function useTargetQuizSession({ active, socket, roundId, endsAt, getNowServerMs, devPreview }) {
  const nowRef = React.useRef(getNowServerMs);
  nowRef.current = getNowServerMs;
  const controller = React.useMemo(() => createTargetQuizController({
    socket,
    roundId,
    devPreview,
    getNow: () => nowRef.current?.() ?? Date.now(),
  }), [socket, roundId, devPreview]);
  const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  React.useEffect(() => {
    if (!active) return undefined;
    const visibilityChanged = () => controller.setVisible(document.visibilityState !== "hidden");
    controller.activate({ deadline: endsAt, isVisible: document.visibilityState !== "hidden" });
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      controller.deactivate();
    };
  }, [active, controller]);

  React.useEffect(() => controller.setDeadline(endsAt), [controller, endsAt]);

  return { state, controller };
}
