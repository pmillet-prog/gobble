import React from "react";
import { createPortal } from "react-dom";

import ToastStack from "../../components/ToastStack.jsx";
import GobblarsRewardCelebration from "./GobblarsRewardCelebration.jsx";
import {
  useFeatureRuntime,
  useFeatureSelector,
} from "../../app/react/useFeatureRuntime.js";

export default function NotificationToastLayer({ darkMode = false }) {
  const notifications = useFeatureRuntime("notifications");
  const toasts = useFeatureSelector(notifications, (state) => state.toasts);
  const reward = useFeatureSelector(notifications, (state) => state.gobblarsReward);
  const celebration = reward ? <GobblarsRewardCelebration key={reward.id} reward={reward} /> : null;
  // Purchases can happen inside the profile overlay, outside the game root.
  return <><ToastStack toasts={toasts} darkMode={darkMode} />{celebration && typeof document !== "undefined"
    ? createPortal(celebration, document.body) : celebration}</>;
}
