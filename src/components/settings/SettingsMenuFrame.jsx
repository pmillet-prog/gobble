import React from "react";

function SettingsMenuFrame({ slideStyles = "", onClose, children }) {
  return (
    <div className="fixed inset-0 z-[20090] flex items-start justify-end p-4">
      <style>{slideStyles}</style>
      <button
        type="button"
        className="absolute inset-0 bg-black/58 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Fermer les parametres"
      />
      {children}
    </div>
  );
}

export default React.memo(SettingsMenuFrame);
