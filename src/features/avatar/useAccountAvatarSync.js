import { useEffect } from "react";
import { accountAvatarStore } from "./accountAvatarStore.js";
import useAvatarRewardToasts from "./useAvatarRewardToasts.js";
import useStarterGrantToast from "../notifications/useStarterGrantToast.js";

export default function useAccountAvatarSync({ authenticatedUserId, isAuthenticated, nickname }) {
  useStarterGrantToast({ authenticatedUserId, isAuthenticated });
  useAvatarRewardToasts({ userId: authenticatedUserId, enabled: isAuthenticated, nickname });
  useEffect(() => {
    if (!isAuthenticated || !Number.isSafeInteger(Number(authenticatedUserId)) || Number(authenticatedUserId) <= 0) return;
    const disconnect = accountAvatarStore.connect(authenticatedUserId);
    const refresh = () => {
      if (document.visibilityState !== "hidden") void accountAvatarStore.refresh().catch(() => {});
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disconnect();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [authenticatedUserId, isAuthenticated]);
}
