import React from "react";
import AvatarCloseButton from "./AvatarCloseButton.jsx";

export default function AvatarFaceChangeDialog({ busy, onConfirm, onClose }) {
  const ref = React.useRef(null);
  const titleId = React.useId();
  React.useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="avatar-asset-dialog" aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><span className="profile-eyebrow">Ton visage</span><AvatarCloseButton disabled={busy} onClick={onClose} /></header>
    <h2 id={titleId}>Remplacer ton visage ?</h2>
    <p>Ce choix gratuit sera enregistré sur ton profil. Tes pièces débloquées restent à toi.</p>
    <button type="button" className="avatar-save" disabled={busy} onClick={onConfirm}>{busy ? "Enregistrement…" : "Confirmer ce visage"}</button>
    <button type="button" className="avatar-cancel" disabled={busy} onClick={onClose}>Garder mon visage</button>
  </dialog>;
}
