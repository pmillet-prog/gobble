import React from "react";
import { createPortal } from "react-dom";

function getRisePx(kind) {
  if (kind === "launcher") return 154;
  if (kind === "bottom") return 196;
  return 138;
}

export default function ChatReactionToastLayer({ toasts = [] }) {
  const list = Array.isArray(toasts) ? toasts.filter(Boolean) : [];
  if (!list.length || typeof document === "undefined") return null;

  return createPortal(
    <>
      <style>{`
        @keyframes chatReactionToastBurst {
          0% {
            opacity: 0;
            transform: translate(-50%, 10px) scale(0.82);
          }
          14% {
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
          }
          72% {
            opacity: 1;
            transform: translate(-50%, calc(-1 * var(--chat-reaction-rise, 54px))) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate(
                calc(-50% + var(--chat-reaction-drift, 0px)),
                calc(-1 * (var(--chat-reaction-rise, 54px) + 54px))
              )
              scale(0.95);
          }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-[20220]" aria-hidden="true">
        {list.map((toast, idx) => {
          const x = Number(toast?.x);
          const y = Number(toast?.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          const kind = typeof toast?.kind === "string" ? toast.kind : "bottom";
          const driftPx = ((idx % 3) - 1) * 16;
          return (
            <div
              key={toast?.id || `${toast?.emoji || "?"}-${idx}`}
              className="absolute rounded-full border border-white/70 bg-white/95 px-3 py-1.5 text-slate-900 shadow-lg backdrop-blur-sm"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                animation: "chatReactionToastBurst 2400ms ease-out forwards",
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
                WebkitUserDrag: "none",
                ["--chat-reaction-rise"]: `${getRisePx(kind)}px`,
                ["--chat-reaction-drift"]: `${driftPx}px`,
              }}
            >
              <div className="flex items-center gap-2 leading-none whitespace-nowrap">
                <span className="text-xl">{toast?.emoji || ""}</span>
                {toast?.actorNick ? (
                  <span className="max-w-[140px] truncate text-[13px] font-bold">
                    {toast.actorNick}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>,
    document.body
  );
}
