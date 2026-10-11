import React from "react";
import { createPortal } from "react-dom";
import AvatarRewardToast from "../features/avatar/AvatarRewardToast.jsx";
import TrophyRewardToast from "../features/trophies/TrophyRewardToast.jsx";
import "../features/avatar/avatarRewardToast.css";

export default function ToastStack({ toasts = [], darkMode = false }) {
  const list = Array.isArray(toasts) ? toasts : [];
  if (!list.length) return null;
  const topLeftToasts = list.filter((toast) => toast?.position === "top-left");
  const topRightToasts = list.filter((toast) => toast?.position !== "top-left");
  const renderToastGroup = (items, position = "top-right") => {
    if (!items.length) return null;
    const isLeft = position === "top-left";
    const aboveProfile = items.some(toast => toast?.achievementReward);
    const group = (
      <div
        className={`fixed top-3 z-[21050] pointer-events-none flex flex-col gap-2 max-w-[min(90vw,420px)] ${
          isLeft ? "left-3 items-start" : "right-3 items-end"
        }`}
        style={aboveProfile ? { zIndex: 26050 } : undefined}
      >
        {items.map((toast) => (
          <div
            key={toast?.id || toast?.message || "toast"}
            className={`rounded-xl px-3 py-2 text-sm font-semibold shadow-lg border ${
              darkMode
                ? "bg-slate-900/95 border-slate-600 text-slate-100"
                : "bg-white/95 border-slate-200 text-slate-800"
            }`}
            style={{
              animation: `toastMorphInOut ${Math.max(
                1600,
                Number(toast?.durationMs) || 3200
              )}ms cubic-bezier(0.22, 1, 0.36, 1) both`,
              transformOrigin: isLeft ? "top left" : "top right",
              willChange: "transform, opacity, border-radius",
              ["--toast-shift-x"]: isLeft ? "-10px" : "10px",
            }}
          >
            {toast?.achievementReward ? <TrophyRewardToast reward={toast.achievementReward} /> : toast?.avatarReward ? <AvatarRewardToast reward={toast.avatarReward} /> : <span className="inline-flex items-center gap-2">
              {toast?.iconSrc ? (
                <img
                  src={toast.iconSrc}
                  alt={toast.iconAlt || ""}
                  className="h-4 w-4 rounded-full"
                />
              ) : null}
              <span>{toast?.message || ""}</span>
            </span>}
          </div>
        ))}
      </div>
    );
    return aboveProfile && typeof document !== "undefined" ? createPortal(group, document.body) : group;
  };
  return (
    <>
      <style>{`
@keyframes toastMorphInOut {
  0% {
    opacity: 0;
    transform: translate3d(var(--toast-shift-x, 10px), -4px, 0) scale(0.28);
    border-radius: 9999px;
  }
  12% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    border-radius: 14px;
  }
  84% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    border-radius: 14px;
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--toast-shift-x, 10px), -4px, 0) scale(0.3);
    border-radius: 9999px;
  }
}
`}</style>
      {renderToastGroup(topLeftToasts, "top-left")}
      {renderToastGroup(topRightToasts, "top-right")}
    </>
  );
}
