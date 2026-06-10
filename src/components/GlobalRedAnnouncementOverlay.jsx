import React from "react";
import { createPortal } from "react-dom";

function GlobalRedAnnouncementOverlay({ announcement }) {
  if (!announcement || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed left-0 right-0 top-4 px-3 pointer-events-none flex justify-center transition-all duration-500 ease-out"
      style={{
        zIndex: 2147483000,
        opacity: announcement.visible ? 1 : 0,
        transform: announcement.visible ? "translateY(0)" : "translateY(-14px)",
      }}
      aria-live="assertive"
    >
      <div className="max-w-3xl rounded-xl border border-red-200/80 bg-red-700/95 px-4 py-3 text-center text-white shadow-[0_18px_60px_rgba(127,29,29,0.45)]">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-red-100/90">
          {announcement.title || "Annonce serveur"}
        </div>
        <div className="mt-1 whitespace-pre-wrap text-sm sm:text-base font-black leading-snug">
          {announcement.body}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default React.memo(GlobalRedAnnouncementOverlay);
