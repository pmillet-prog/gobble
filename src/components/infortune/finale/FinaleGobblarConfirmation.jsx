import React from 'react';
import { InfortuneGameDialog } from '../InfortuneGameSurface.jsx';
import { finaleGobblarPrice } from '../../../../shared/infortuneFinalePurchases.js';

export default function FinaleGobblarConfirmation({ purchase, state, onCancel, onConfirm }) {
  const insufficient = Number.isFinite(state.gobblarsBalance) && state.gobblarsBalance < purchase.cost;
  const changed = finaleGobblarPrice(state.gobblarPurchases) !== purchase.cost || state.purchased.includes(purchase.letter);
  const confirm = React.useRef(null);
  React.useEffect(() => { confirm.current?.focus(); }, []);
  return <InfortuneGameDialog title="Acheter avec des gobblars ?" onClose={onCancel}>
    <div className="infortune-finale-purchase-confirm" aria-live="polite">
      <p>{state.bank === 0 ? 'Votre cagnotte est vide.' : 'Votre cagnotte ne permet plus d’acheter de lettres.'}</p>
      <p>Acheter la lettre <strong>{purchase.letter}</strong> pour <strong>{purchase.cost.toLocaleString('fr-FR')} gobblars</strong> ?</p>
      <p>Le prochain achat coûtera {(purchase.cost * 2).toLocaleString('fr-FR')} gobblars. Même prix si la lettre est absente.</p>
      {Number.isFinite(state.gobblarsBalance) && <p>Solde{state.virtualWallet ? ' d’essai' : ''} : {state.gobblarsBalance.toLocaleString('fr-FR')} gobblars.</p>}
      {insufficient && <p role="alert">Solde insuffisant pour cet achat.</p>}
      {changed && <p role="alert">Le tarif ou la lettre a changé. Ferme cette fenêtre pour refaire ton choix.</p>}
      {state.error && <p role="alert">{state.error}</p>}
      <div className="infortune-finale-purchase-confirm__actions">
        <button ref={confirm} type="button" className="infortune-finale-primary" disabled={state.busy || insufficient || changed}
          onClick={onConfirm}>{state.busy ? 'Achat en cours…' : `Acheter · ${purchase.cost.toLocaleString('fr-FR')} gobblars`}</button>
        <button type="button" className="infortune-finale-secondary" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  </InfortuneGameDialog>;
}
