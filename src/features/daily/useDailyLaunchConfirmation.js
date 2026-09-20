import React from "react";
import { requestDailyLaunch } from "../../components/daily/dailyLaunchTransport.js";

export default function useDailyLaunchConfirmation({ appView, appViewRef, board, sessionRef, emitSocketAck }) {
  const session = sessionRef.current;
  React.useEffect(() => {
    if (appView !== "daily_play" || !session?.launchId || session.displayed || !board?.length) return;
    let frame = null;
    let cancelled = false;
    function confirmAfterPaint() {
      if (document.visibilityState === "hidden" || cancelled || session.displayed) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (cancelled || document.visibilityState === "hidden" ||
            appViewRef.current !== "daily_play" || sessionRef.current !== session) return;
          session.displayed = true;
          void requestDailyLaunch({
            stage: "confirm", dateId: session.dateId, launchId: session.launchId,
            dailyMode: session.mode, pseudo: session.pseudo,
          }, { emitSocketAck }).then(() => { session.confirmed = true; }).catch(() => {
            // A lost ACK never frees the attempt: the server closes recovery after 30 seconds.
          });
        });
      });
    }
    confirmAfterPaint();
    document.addEventListener("visibilitychange", confirmAfterPaint);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", confirmAfterPaint);
    };
  }, [appView, appViewRef, board, session, sessionRef, emitSocketAck]);
}
