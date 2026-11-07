import React from "react";
import StageExchangeChoice from "./StageExchangeChoice.jsx";
import { exchangeImpact } from "../../shared/infortuneExchangePlan.js";
import InfortuneExchangeAnimation from "../../src/components/infortune/InfortuneExchangeAnimation.jsx";
import "./tournamentExchange.css";

const money = value => `${value.toLocaleString("fr-FR")} €`;

export function TournamentExchangeOverlay({ state, contestants, selectedId, onSelect, onConfirm, onDecline, ready, choiceUntil, wheel }) {
  const choosing = state.choosing && ready;
  const players = [state.self, ...contestants];
  const exchange = state.activeExchange;
  if (exchange && ready) {
    return <InfortuneExchangeAnimation key={state.exchangeIndex} exchange={exchange} index={state.exchangeIndex} total={state.exchanges.length}
      players={players} selfId={state.selfId} banks={Object.fromEntries(Object.entries(state.economy.members).map(([id, member]) => [id, member.bank]))} />;
  }
  if (choosing) return <StageExchangeChoice wheel={wheel} contestants={contestants} selectedId={selectedId}
    onSelect={onSelect} onConfirm={onConfirm} onDecline={onDecline} bank={state.balance} until={choiceUntil} />;
  if (state.round === 4 && state.self.spin === "done" && !state.canAdvance && !exchange) {
    return <div className="tournament-exchange-wait" role="status">{state.choosing
      ? "Échange obtenu · le choix va s’ouvrir à la fin de l’animation."
      : "Résultat enregistré · attente des autres lancers avant les échanges…"}</div>;
  }
  return null;
}

export function TournamentExchangeSummary({ state, contestants }) {
  if (!state.exchanges.length || state.activeExchange) return null;
  const players = [state.self, ...contestants], name = id => players.find(p => p.id === id)?.nick;
  const firstSelf = state.exchanges.map(e => exchangeImpact(e, state.selfId)).find(Boolean);
  return <section className="tournament-exchange-summary" aria-label="Bilan des échanges">
    <h3>Les échanges sont terminés</h3>
    <ol>{state.exchanges.map((e, i) => <li key={i}>{name(e.from)} ⇄ {name(e.to)} : {money(e.sourceBank)} contre {money(e.targetBank)}.</li>)}</ol>
    {firstSelf && <p>Ta cagnotte : <strong>{money(firstSelf.before)} → {money(state.balance)}</strong>.
      {firstSelf.before === state.balance && " Les échanges successifs te laissent le même montant."}</p>}
  </section>;
}
