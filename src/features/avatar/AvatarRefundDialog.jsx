import React from "react";
import AvatarCloseButton from "./AvatarCloseButton.jsx";

export default function AvatarRefundDialog({ onQuote, onConfirm, onClose, busy }) {
  const ref = React.useRef(null), pending = React.useRef(false), mounted = React.useRef(false);
  const titleId = React.useId();
  const [quote, setQuote] = React.useState(null);
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const quoteRequest = React.useRef(onQuote);
  React.useEffect(() => {
    mounted.current = true;
    const dialog = ref.current;
    dialog.showModal();
    return () => { mounted.current = false; dialog.close(); };
  }, []);
  React.useEffect(() => {
    const controller = new AbortController();
    setQuote(null); setError("");
    quoteRequest.current({ signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) setQuote(value);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [attempt]);
  const confirm = async () => {
    if (pending.current || !quote?.token || busy) return;
    pending.current = true; setError("");
    try { await onConfirm(quote.token); }
    catch (reason) {
      if (mounted.current) {
        setError(reason.message);
        if (reason.quote) setQuote(reason.quote);
      }
    } finally { pending.current = false; }
  };
  return <dialog ref={ref} className="avatar-asset-dialog" aria-labelledby={titleId} aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><span className="profile-eyebrow">Tes achats d’avatar</span><AvatarCloseButton disabled={busy} onClick={onClose} /></header>
    <h2 id={titleId}>Tout rembourser</h2>
    {!quote && !error ? <p role="status">Calcul du montant de tes achats…</p> : null}
    {quote?.amount > 0 ? <>
      <p>{quote.itemCount === 1 ? "L’élément acheté sera reverrouillé." : `Les ${quote.itemCount} éléments achetés seront reverrouillés.`} Tu récupéreras exactement les gobblars dépensés pour ces achats.</p>
      <div className="avatar-asset-dialog-wallet"><strong>Montant remboursé</strong><strong>{quote.amount.toLocaleString("fr-FR")} gobblars</strong></div>
      <p>Ton avatar porté sera retiré et ton essai actuel sera effacé. Tu pourras ensuite créer un nouvel avatar et racheter les pièces de ton choix.</p>
      <p>Les récompenses gagnées et les éléments offerts restent à toi.</p>
    </> : quote ? <p>Tu n’as aucun achat d’avatar à rembourser.</p> : null}
    {error ? <p role="alert" className="avatar-asset-dialog-error">{error}</p> : null}
    {error && !quote ? <button type="button" className="avatar-cancel" onClick={() => setAttempt(value => value + 1)}>Réessayer</button> : null}
    {quote?.amount > 0 ? <button type="button" className="avatar-save" disabled={busy} onClick={confirm}>
      {busy ? "Remboursement…" : `Confirmer le remboursement de ${quote.amount.toLocaleString("fr-FR")} gobblars`}
    </button> : null}
    <button type="button" className="avatar-cancel" disabled={busy} onClick={onClose}>Revenir à l’éditeur</button>
  </dialog>;
}
