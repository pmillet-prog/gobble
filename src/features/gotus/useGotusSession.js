import React from "react";
import { createGotusController } from "./gotusController.js";

export default function useGotusSession({ active, socket, roundId, endsAt, getNowServerMs, mode }) {
  const nowRef = React.useRef(getNowServerMs);
  nowRef.current = getNowServerMs;
  const controller = React.useMemo(() => createGotusController({ socket, roundId, mode,
    getNow: () => nowRef.current?.() ?? Date.now(),
  }), [socket, roundId, mode]);
  const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  React.useEffect(() => {
    if (!active) return undefined;
    const changed = () => controller.setVisible(document.visibilityState !== "hidden");
    controller.activate({ deadline: endsAt, isVisible: document.visibilityState !== "hidden" });
    document.addEventListener("visibilitychange", changed);
    return () => { document.removeEventListener("visibilitychange", changed); controller.deactivate(); };
  }, [active, controller]);
  React.useEffect(() => controller.setDeadline(endsAt), [controller, endsAt]);
  return { state, controller };
}
