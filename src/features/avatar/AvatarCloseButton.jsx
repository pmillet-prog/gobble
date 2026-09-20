import React from "react";

export default function AvatarCloseButton({ onClick, disabled = false, label = "Fermer l’éditeur d’avatar" }) {
  return <button type="button" className="profile-close avatar-close" aria-label={label} onClick={onClick} disabled={disabled}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
  </button>;
}
