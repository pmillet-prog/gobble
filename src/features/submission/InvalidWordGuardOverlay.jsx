import React from "react";
import { createPortal } from "react-dom";

function InvalidWordGuardOverlay({ message, visible }) {
  if (!visible || !message || typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[1190] flex items-center justify-center px-5">
      <div
        className="max-w-sm rounded-2xl border-2 border-amber-200 bg-slate-950 px-5 py-4 text-center text-sm font-black leading-snug text-amber-50 shadow-2xl"
        role="status"
        aria-live="assertive"
      >
        {message}
      </div>
    </div>,
    document.body
  );
}

export default React.memo(InvalidWordGuardOverlay);
