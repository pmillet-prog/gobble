import React from "react";
import { createPortal } from "react-dom";

function SettingsMenuFrame({ onClose, children }) {
  const frame = (
    <div className="fixed inset-0 z-[20090] flex items-start justify-end p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/58 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Fermer les parametres"
      />
      {children}
    </div>
  );
  return typeof document !== "undefined" ? createPortal(frame, document.body) : frame;
}

export default React.memo(SettingsMenuFrame);
