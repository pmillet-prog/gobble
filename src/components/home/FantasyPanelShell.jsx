import React from "react";

const styles = `
.fantasy-panel-shell {
  position: relative;
  border-radius: 18px;
  border: 2px solid rgba(245, 188, 68, 0.72);
  background:
    linear-gradient(180deg, rgba(18, 47, 103, 0.94), rgba(7, 22, 55, 0.96)),
    radial-gradient(circle at 50% 0%, rgba(255, 225, 128, 0.18), transparent 45%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 247, 214, 0.18),
    0 22px 38px rgba(0, 0, 0, 0.38);
  color: #fff7df;
}
.fantasy-panel-shell::before {
  content: "";
  position: absolute;
  inset: 6px;
  border-radius: 14px;
  border: 1px solid rgba(255, 230, 151, 0.2);
  pointer-events: none;
}
.fantasy-panel-header {
  position: relative;
  z-index: 1;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255, 218, 129, 0.24);
  background: linear-gradient(180deg, rgba(255, 198, 78, 0.12), rgba(255, 198, 78, 0));
}
.fantasy-panel-eyebrow {
  color: #f7cf73;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  text-shadow: 0 2px 2px rgba(0, 0, 0, 0.42);
}
.fantasy-panel-title {
  color: #fff7df;
  font-size: 20px;
  line-height: 1.08;
  font-weight: 900;
  text-shadow: 0 3px 4px rgba(0, 0, 0, 0.52);
}
.fantasy-panel-subtitle {
  margin-top: 3px;
  color: rgba(255, 247, 223, 0.72);
  font-size: 12px;
  font-weight: 700;
}
.fantasy-panel-close {
  min-width: 62px;
  min-height: 32px;
  border-radius: 999px;
  border: 1px solid rgba(255, 221, 128, 0.72);
  background: linear-gradient(180deg, #f9d168, #b86a14);
  color: #351900;
  font-size: 12px;
  font-weight: 900;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.34);
  box-shadow: 0 5px 10px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.38);
}
.fantasy-panel-close:hover {
  filter: brightness(1.08);
}
.fantasy-panel-body {
  position: relative;
  z-index: 1;
  color: #fff7df;
}
.fantasy-panel-tab {
  border-color: rgba(255, 218, 129, 0.34) !important;
  background: rgba(6, 20, 54, 0.52);
}
`;

function FantasyPanelShell({
  bodyClassName = "",
  children,
  className = "",
  eyebrow = "",
  headerControls = null,
  onClose = null,
  onClick,
  onTouchEnd,
  onTouchMove,
  onTouchStart,
  subtitle = "",
  title = "",
}) {
  return (
    <div
      className={`fantasy-panel-shell overflow-hidden flex flex-col min-h-0 ${className}`}
      onTouchStartCapture={onTouchStart}
      onTouchMoveCapture={onTouchMove}
      onTouchEndCapture={onTouchEnd}
      onClick={onClick}
    >
      <style>{styles}</style>
      <div className="fantasy-panel-header shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? <div className="fantasy-panel-eyebrow">{eyebrow}</div> : null}
            {title ? <div className="fantasy-panel-title truncate">{title}</div> : null}
            {subtitle ? <div className="fantasy-panel-subtitle">{subtitle}</div> : null}
          </div>
          {onClose ? (
            <button
              type="button"
              className="fantasy-panel-close shrink-0"
              onClick={onClose}
              aria-label="Fermer"
            >
              Fermer
            </button>
          ) : null}
        </div>
        {headerControls ? <div className="mt-3">{headerControls}</div> : null}
      </div>
      <div className={`fantasy-panel-body min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

export default React.memo(FantasyPanelShell);
