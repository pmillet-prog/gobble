import React from "react";
import ChalkboardIcon from "./ChalkboardIcon.jsx";

export default function ChalkboardModerationControls({ moderation, canUndo, busy }) {
  return <footer className="chalkboard-tray chalkboard-moderation-controls" aria-label="Modération du tableau">
    <p className="chalkboard-moderation-guidance" role="status">{moderation.selected ? "La partie en surbrillance sera effacée." : "Survole pour repérer, puis sélectionne le dessin ou le message à effacer."}</p>
    <div className="chalkboard-actions">
      {moderation.selected && <button type="button" onClick={moderation.clearSelection} disabled={busy}>Désélectionner</button>}
      <button type="button" className="chalkboard-erase-selection" onClick={moderation.erase} disabled={!moderation.selected || busy}><ChalkboardIcon name="erase" />Effacer la sélection</button>
      <button type="button" className="chalkboard-undo-deletion" onClick={moderation.undo} disabled={!canUndo || busy}><ChalkboardIcon name="undo" />Annuler le dernier effacement</button>
    </div>
  </footer>;
}
