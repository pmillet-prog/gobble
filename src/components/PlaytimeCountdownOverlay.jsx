import React from "react";
import { createPortal } from "react-dom";

function formatRemainingTime(remainingMs) {
  const total = Math.max(0, Math.ceil((Number(remainingMs) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function PlaytimeCountdownOverlay({ visible, remainingMs }) {
  if (!visible || !Number.isFinite(Number(remainingMs)) || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed left-2 bottom-2 z-[2147482500] pointer-events-none rounded-lg border border-white/20 bg-black/30 px-2 py-1 text-[11px] font-black text-white shadow-lg backdrop-blur-sm"
      aria-live="polite"
    >
      {formatRemainingTime(remainingMs)}
    </div>,
    document.body
  );
}

export default React.memo(PlaytimeCountdownOverlay);
