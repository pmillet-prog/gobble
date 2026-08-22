import React from "react";

import ToastStack from "../../components/ToastStack.jsx";
import {
  useFeatureRuntime,
  useFeatureSelector,
} from "../../app/react/useFeatureRuntime.js";

export default function NotificationToastLayer({ darkMode = false }) {
  const notifications = useFeatureRuntime("notifications");
  const toasts = useFeatureSelector(notifications, (state) => state.toasts);
  return <ToastStack toasts={toasts} darkMode={darkMode} />;
}
