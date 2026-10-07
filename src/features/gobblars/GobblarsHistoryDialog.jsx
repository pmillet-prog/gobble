import React from "react";
import { createPortal } from "react-dom";
import useMobileBackTarget from "../mobile/useMobileBackTarget.js";
import useGobblarsHistory from "./useGobblarsHistory.js";
import { presentGobblarsMovement } from "./gobblarsHistoryModel.js";
import "./gobblarsHistory.css";

export default function GobblarsHistoryDialog({ accountId, onClose }) {
  const ref = React.useRef(null);
  const titleId = React.useId();
  const history = useGobblarsHistory(accountId);
  useMobileBackTarget(onClose);
  React.useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} className="gobblars-history" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header>
      <h2 id={titleId}>Historique des gobblars</h2>
      <button type="button" onClick={onClose} aria-label="Fermer l’historique" autoFocus>×</button>
    </header>
    <p>Gains, achats et remboursements. Les gains d’un même mini-tournoi sont regroupés. Horaires de Paris.</p>
    <div className="gobblars-history-content" aria-busy={history.busy}>
      {history.busy ? <p role="status">Chargement…</p> : history.error ? <p role="alert">{history.error}</p>
        : !history.entries.length ? <p>Aucune opération enregistrée.</p> : <ol>
          {history.entries.map(entry => {
            const item = presentGobblarsMovement(entry);
            return <li key={entry.id}>
              <div><strong>{item.title}</strong><span>{item.date}</span>{item.detail ? <small>{item.detail}</small> : null}
                {item.items.map((detail, index) => <small key={index}>{detail}</small>)}
              </div>
              <b className={item.isDebit ? "gobblars-history-debit" : undefined} aria-label={item.amountLabel}>{item.signedAmount}</b>
            </li>;
          })}
        </ol>}
    </div>
    {history.entries.some(entry => entry.kind === "legacy_live") ? <p className="gobblars-history-note">Les anciens gains live, sans référence de mini-tournoi, sont regroupés par jour UTC.</p> : null}
    <footer>
      <button type="button" onClick={history.refresh} disabled={history.busy}>Actualiser</button>
      {history.error ? <button type="button" onClick={history.retry}>Réessayer</button> : null}
      <span>Page {history.page}</span>
      {history.nextBefore != null ? <button type="button" onClick={history.next} disabled={history.busy}>Opérations précédentes</button> : null}
    </footer>
  </dialog>, document.body);
}
