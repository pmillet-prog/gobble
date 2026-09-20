import React from "react";
import AvatarCloseButton from "./AvatarCloseButton.jsx";
import GobblarsBalance from "../../components/GobblarsBalance.jsx";

const amount = value => value.toLocaleString("fr-FR");

export default function AvatarCheckoutDialog({ plan, inventory, busy, onConfirm, onRemoveUnavailable, onClose }) {
  const ref = React.useRef(null), buying = React.useRef(false), mounted = React.useRef(false);
  const titleId = React.useId();
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    mounted.current = true; const dialog = ref.current; dialog.showModal();
    return () => { mounted.current = false; dialog.close(); };
  }, []);
  const confirm = async () => {
    if (buying.current) return;
    buying.current = true; setError("");
    try { await onConfirm(); }
    catch (reason) { if (mounted.current) setError(reason.message || "L’enregistrement a échoué. Réessaie."); }
    finally { buying.current = false; }
  };
  return <dialog ref={ref} className="avatar-asset-dialog avatar-checkout-dialog" aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><span className="profile-eyebrow">Ton avatar, en détail</span><AvatarCloseButton disabled={busy} onClick={onClose} /></header>
    <h2 id={titleId}>Acheter et porter</h2>
    <p>Seules les pièces sélectionnées que tu ne possèdes pas encore sont facturées. Une fois l’achat confirmé, cet avatar sera enregistré sur ton profil.</p>
    <div className="avatar-asset-dialog-wallet"><span>Ton trésor</span><GobblarsBalance balance={inventory.balance} /></div>
    {plan.purchasable.length ? <><h3>Pièces achetables</h3><ul className="avatar-checkout-items">
      {plan.purchasable.map(item => <li key={`${item.family}:${item.id}`}><span>{item.label}</span><strong>{amount(item.price)} gobblars</strong></li>)}
    </ul></> : <p>Toutes les pièces achetables sélectionnées sont déjà à toi.</p>}
    {plan.unavailable.length ? <div className="avatar-checkout-unavailable">
      <h3>Ces éléments ne s’achètent pas avec des gobblars</h3>
      <ul>{plan.unavailable.map(item => <li key={`${item.family}:${item.id}`}><strong>{item.label}</strong><span>{item.description || "Une condition de déblocage reste à remplir."}</span></li>)}</ul>
      <p>Retire-les de l’essai pour enregistrer le reste de cet avatar.</p>
      <button type="button" className="avatar-cancel" disabled={busy} onClick={onRemoveUnavailable}>Retirer ces éléments de l’essai</button>
    </div> : null}
    <div className="avatar-asset-dialog-wallet"><strong>Total à payer</strong><strong>{amount(plan.total)} gobblars</strong></div>
    {plan.missing > 0 ? <p className="avatar-asset-dialog-shortfall" role="status">Il te manque <strong>{amount(plan.missing)} gobblars</strong> pour acheter l’ensemble. Tu peux revenir à l’essai et choisir moins de pièces.</p>
      : <p>Solde après achat : {amount(inventory.balance - plan.total)} gobblars.</p>}
    {error ? <p className="avatar-asset-dialog-error" role="alert">{error}</p> : null}
    <button type="button" className="avatar-save" disabled={busy || plan.missing > 0 || plan.unavailable.length > 0} onClick={confirm}>
      {busy ? "Achat et enregistrement…" : plan.total ? `Acheter pour ${amount(plan.total)} gobblars et porter` : "Porter cet avatar"}
    </button>
    <button type="button" className="avatar-cancel" disabled={busy} onClick={onClose}>Revenir à l’essai</button>
  </dialog>;
}
