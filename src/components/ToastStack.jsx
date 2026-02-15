import React from "react";

export default function ToastStack({ toasts = [], darkMode = false }) {
  const list = Array.isArray(toasts) ? toasts : [];
  if (!list.length) return null;
  return (
    <div className="fixed top-3 right-3 z-[21050] pointer-events-none flex flex-col gap-2 max-w-[min(90vw,420px)]">
      {list.map((toast) => (
        <div
          key={toast?.id || Math.random()}
          className={`rounded-xl px-3 py-2 text-sm font-semibold shadow-lg border ${
            darkMode
              ? "bg-slate-900/95 border-slate-600 text-slate-100"
              : "bg-white/95 border-slate-200 text-slate-800"
          }`}
        >
          {toast?.message || ""}
        </div>
      ))}
    </div>
  );
}
