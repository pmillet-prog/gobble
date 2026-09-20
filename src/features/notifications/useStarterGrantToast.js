import { useEffect } from "react";
import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { useApplicationKernel } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { createStarterGrantNotifier } from "./createStarterGrantNotifier.js";

export default function useStarterGrantToast({ authenticatedUserId, isAuthenticated }) {
  const notifications = useFeatureRuntime("notifications");
  const socket = useApplicationKernel().ports.realtime;
  useEffect(() => {
    const userId = Number(authenticatedUserId);
    if (!isAuthenticated || !Number.isSafeInteger(userId) || userId <= 0) return;
    const controller = new AbortController();
    const notifier = createStarterGrantNotifier({ userId, show: notifications.show,
      visible: () => document.visibilityState !== "hidden",
      request: async key => {
        const requestController = new AbortController();
        const abort = () => requestController.abort();
        controller.signal.addEventListener("abort", abort, { once: true });
        if (controller.signal.aborted) abort();
        const timer = setTimeout(abort, 12000);
        try {
          const response = await fetch(`/api/auth/gobblars/starter-grant${key ? "/ack" : `?userId=${userId}`}`, {
            method: key ? "POST" : "GET", credentials: "include", cache: "no-store", signal: requestController.signal,
            ...(key ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, key }) } : {}),
          });
          if (!response.ok) throw new Error("starter_grant_unavailable");
          return await response.json();
        } finally {
          clearTimeout(timer); controller.signal.removeEventListener("abort", abort);
        }
      },
    });
    const refresh = () => { void notifier.refresh(); };
    const offSocket = socket.bind({ connect: refresh });
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      notifier.dispose(); controller.abort(); offSocket();
      window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [authenticatedUserId, isAuthenticated, notifications, socket]);
}
