import React from "react";

export default function ToastStack({ toasts = [], darkMode = false }) {
  const list = Array.isArray(toasts) ? toasts : [];
  if (!list.length) return null;
  return (
    <div className="fixed top-3 right-3 z-[21050] pointer-events-none flex flex-col gap-2 max-w-[min(90vw,420px)]">
      <style>{`
@keyframes toastMorphInOut {
  0% {
    opacity: 0;
    transform: translate3d(10px, -4px, 0) scale(0.28);
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
    transform: translate3d(10px, -4px, 0) scale(0.3);
    border-radius: 9999px;
  }
}
`}</style>
      {list.map((toast) => (
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
            transformOrigin: "top right",
            willChange: "transform, opacity, border-radius",
          }}
        >
          {toast?.message || ""}
        </div>
      ))}
    </div>
  );
}
