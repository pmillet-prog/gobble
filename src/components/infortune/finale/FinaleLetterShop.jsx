import React from "react";
import { FINALE_ALPHABET, FINALE_VOWELS, finaleLetterCost } from "../../../../shared/infortuneFinaleRules.js";

export default function FinaleLetterShop({ state, onBuy }) {
  const purchased = new Set(state.purchased);
  return <section className="infortune-finale-shop" aria-label="Acheter des lettres">
    <div className="infortune-finale-shop__heading"><h2>Éclaircis le mystère</h2><p>
      Consonne <strong>{state.rules.consonantCost}</strong><span> / </span>
      Voyelle <strong>{state.rules.vowelCost}</strong>
    </p></div>
    <div className="infortune-finale-shop__keyboard">
      {Array.from(FINALE_ALPHABET).map(letter => {
        const used = purchased.has(letter), cost = finaleLetterCost(letter, state.rules);
        return <button key={letter} type="button" aria-pressed={used}
          className={`${FINALE_VOWELS.includes(letter) ? "is-vowel" : ""}${used ? " is-purchased" : ""}`}
          aria-label={used ? `${letter}, déjà achetée` : `Acheter ${letter} pour ${cost}`}
          disabled={state.busy || Boolean(state.outcome) || used || state.bank < cost}
          onClick={() => onBuy(letter)}>{letter}<small>{used ? "✓" : cost}</small></button>;
      })}
    </div>
    <p className="infortune-finale-shop__rule">Un achat révèle toutes les occurrences, une à une. Une lettre absente coûte aussi son prix. Y est une voyelle.</p>
    <p className="infortune-finale-shop__purchase" role="status">
      {state.lastPurchase ? <><b>{state.lastPurchase.letter}</b> · {state.lastPurchase.count
        ? `${state.lastPurchase.count} occurrence${state.lastPurchase.count > 1 ? "s" : ""}${state.busy ? " · Révélation…" : ""}`
        : "absente du tableau"} <span>−{state.lastPurchase.cost}</span></> : "Choisis une lettre, ou tente directement ta réponse."}
    </p>
  </section>;
}
