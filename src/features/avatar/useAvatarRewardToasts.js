import { useEffect, useRef } from "react";
import { useApplicationKernel } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { useFeatureRuntime } from "../../app/react/useFeatureRuntime.js";
import { accountAvatarStore } from "./accountAvatarStore.js";
import { createAvatarRewardNotifier } from "./createAvatarRewardNotifier.js";
import { weeklyAuraStore } from "./weeklyAuraStore.js";

export default function useAvatarRewardToasts({ userId, enabled, nickname }) {
  const socket = useApplicationKernel().ports.realtime;
  const notifications = useFeatureRuntime("notifications");
  const name = useRef(nickname);
  name.current = nickname;
  useEffect(() => {
    if (!enabled || !userId) return;
    const controller = new AbortController();
    const notifier = createAvatarRewardNotifier({ userId: Number(userId), show: notifications.show, nickname: () => name.current,
      acknowledge: async keys => {
        const response = await fetch("/api/auth/avatar/rewards/ack", { method: "POST", credentials: "include", signal: controller.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: Number(userId), keys }) });
        if (!response.ok) throw new Error("reward_ack_failed");
      },
    });
    const offRewards = accountAvatarStore.subscribeRewards(notifier.receive);
    const offSocket = socket.bind({ avatarRewardsUnlocked: payload => accountAvatarStore.receiveRewards(payload),
      "avatar:weekly-auras": snapshot => {
        weeklyAuraStore.update(snapshot);
        if (snapshot.grants?.[userId] || accountAvatarStore.getSnapshot().avatar?.weeklyAura) {
          void accountAvatarStore.refreshAfterPending().catch(() => {});
        }
      },
      connect: () => { void accountAvatarStore.refresh().catch(() => {}); },
    });
    return () => { offSocket(); offRewards(); notifier.dispose(); controller.abort(); };
  }, [userId, enabled, notifications, socket]);
}
