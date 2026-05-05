import React from "react";
import { createPortal } from "react-dom";

function DesktopResultsSummaryDrawer({
  darkMode = false,
  enabled = false,
  expanded = true,
  layout = null,
  onToggleExpanded,
  renderPanel,
}) {
  if (!enabled || typeof document === "undefined" || !layout) return null;

  const panel = typeof renderPanel === "function" ? renderPanel() : null;
  if (!panel) return null;

  return createPortal(
    <div
      className="fixed z-[12040] pointer-events-none"
      style={{
        left: `${layout.centerX}px`,
        bottom: `${layout.bottom}px`,
        transform: "translateX(-50%)",
      }}
    >
      <div
        className="relative pointer-events-auto transition-transform duration-300"
        style={{
          width: `min(92vw, ${layout.maxWidth}px)`,
          transform: expanded ? "translateY(0)" : "translateY(calc(100% - 28px))",
        }}
      >
        <div className="flex justify-center">
          <button
            type="button"
            aria-expanded={expanded}
            className={`h-7 px-4 rounded-t-xl border border-b-0 text-[11px] font-extrabold tracking-wide ${
              darkMode
                ? "bg-slate-950 border-slate-700 text-slate-100"
                : "bg-white border-slate-300 text-slate-700"
            }`}
            onClick={onToggleExpanded}
          >
            BILAN
          </button>
        </div>
        <div
          className="mt-0.5 overflow-y-auto custom-scrollbar custom-scrollbar-gray pr-1"
          style={{ maxHeight: `${layout.maxHeight}px` }}
        >
          {panel}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default React.memo(DesktopResultsSummaryDrawer);
