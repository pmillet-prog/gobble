import React from "react";
import { FINALE_ALPHABET, FINALE_VOWELS, finaleLetterCost } from "../../../../shared/infortuneFinaleRules.js";
import { finaleBankExhausted, finaleGobblarPrice } from '../../../../shared/infortuneFinalePurchases.js';

export default function FinaleLetterShop({ state, onBuy, mode = "buy", onType, onErase }) {
  const purchased = new Set(state.purchased);
  const gobblars = finaleBankExhausted(state), gobblarPrice = finaleGobblarPrice(state.gobblarPurchases);
  return <section className="infortune-finale-shop" aria-label={mode === "buy" ? "Acheter des lettres" : "Clavier de réponse"}>
    {mode === "buy" && <div className="infortune-finale-shop__heading"><p>
      {gobblars ? <>Cagnotte épuisée · lettre : <strong>{gobblarPrice.toLocaleString('fr-FR')} gobblars</strong>
        {state.virtualWallet && <> · solde d’essai : {state.gobblarsBalance.toLocaleString('fr-FR')}</>}</>
        : <>Consonne <strong>{state.rules.consonantCost} €</strong><span> / </span>Voyelle <strong>{state.rules.vowelCost} €</strong></>}
    </p></div>}
    <div className="infortune-finale-shop__keyboard">
      {Array.from(FINALE_ALPHABET).map(letter => {
        const used = purchased.has(letter), cost = gobblars ? gobblarPrice : finaleLetterCost(letter, state.rules);
        return <button key={letter} type="button" aria-pressed={mode === "buy" ? used : undefined}
          className={`${mode === "buy" && FINALE_VOWELS.includes(letter) ? "is-vowel" : ""}${mode === "buy" && used ? " is-purchased" : ""}`}
          aria-label={mode === "answer" ? `Écrire ${letter}` : used ? `${letter}, déjà achetée` : `Acheter ${letter} pour ${cost} ${gobblars ? 'gobblars' : 'euros'}`}
          disabled={state.busy || Boolean(state.outcome) || mode === "buy" && (used || !gobblars && state.bank < cost)}
          onClick={() => mode === "buy" ? onBuy(letter) : onType(letter)}>{letter}{mode === "buy" && <small>{used ? "✓" : gobblars ? 'G' : cost}</small>}</button>;
      })}
      {mode === "answer" && <button type="button" disabled={state.busy} onClick={onErase} aria-label="Effacer la dernière lettre">⌫</button>}
    </div>
    {mode === "buy" && <><p className="infortune-finale-shop__rule">Toutes les occurrences · même prix si absente · Y est une voyelle.</p>
    <p className="infortune-finale-shop__purchase" role="status">
      {state.lastPurchase ? <><b>{state.lastPurchase.letter}</b> · {state.lastPurchase.count
        ? `${state.lastPurchase.count} occurrence${state.lastPurchase.count > 1 ? "s" : ""}${state.busy ? " · Révélation…" : ""}`
        : "absente du tableau"} <span>−{state.lastPurchase.cost} {state.lastPurchase.currency === 'gobblars' ? 'gobblars' : '€'}</span></> : "Choisis une lettre, ou tente directement ta réponse."}
    </p></>}
  </section>;
}
