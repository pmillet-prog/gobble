import React from "react";
import { createPortal } from "react-dom";

export default function ChalkboardMaintenanceDialog({ hasDraft, onClose }) {
  const dialogRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return createPortal(
    <dialog ref={dialogRef} className="chalkboard-maintenance" aria-labelledby="chalkboard-maintenance-title" onCancel={event => event.preventDefault()} onKeyDown={event => event.stopPropagation()}>
      <span className="material-symbols-outlined" aria-hidden="true">construction</span>
      <h2 id="chalkboard-maintenance-title">Mise à jour en cours</h2>
      <p>Le grand tableau est temporairement fermé. Tu pourras à nouveau écrire et dessiner après la mise à jour.</p>
      {hasDraft ? <p className="chalkboard-maintenance-draft">Ton brouillon n’est pas publié. Il reste ici tant que cette page reste ouverte.</p> : null}
      <button type="button" onClick={onClose} autoFocus>Retour à l’accueil</button>
    </dialog>,
    document.body
  );
}
