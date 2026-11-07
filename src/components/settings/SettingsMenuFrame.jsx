import React from "react";
import { createPortal } from "react-dom";
import "./settingsMenuFrame.css";

function SettingsMenuFrame({ onClose, isMobileLayout, children }) {
  const frame = (
    <div
      className="settings-menu-frame"
      data-layout={typeof isMobileLayout === "boolean" ? (isMobileLayout ? "mobile" : "desktop") : undefined}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/58 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Fermer les paramètres"
      />
      <div className="settings-menu-layout">{children}</div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(frame, document.body) : frame;
}

export default React.memo(SettingsMenuFrame);
