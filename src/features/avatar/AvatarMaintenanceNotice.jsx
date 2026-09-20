import React from "react";

export default function AvatarMaintenanceNotice({ onClose, hasDraft = false }) {
  return <div className="profile-editor-loading">
    <h2 id="player-profile-title">Atelier temporairement fermé</h2>
    <p role="status">L’éditeur d’avatar est indisponible pendant la mise à jour.</p>
    {hasDraft ? <p>Ton essai est conservé tant que cette fenêtre reste ouverte. Tu pourras le reprendre à la fin de la mise à jour.</p> : null}
    <button type="button" onClick={onClose}>Revenir au profil</button>
  </div>;
}
