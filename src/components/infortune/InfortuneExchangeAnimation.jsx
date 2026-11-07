import React from "react";
import AvatarThumbnail from "../../features/avatar/AvatarThumbnail.jsx";
import { PRESENTER_IDENTITIES } from "../../../shared/presenterIdentities.js";
import { exchangeImpact, INFORTUNE_EXCHANGE_STEP_MS } from "../../../shared/infortuneExchangePlan.js";
import "./infortuneExchangeAnimation.css";

const money = amount => Number.isFinite(amount) ? `${amount.toLocaleString("fr-FR")} €` : "—";

function Head({ player }) {
  const presenter = player.isBot && PRESENTER_IDENTITIES[player.presenterKey];
  return <span className="infortune-swap__head">{presenter
    ? <img src={presenter.buttonUrl} alt="" draggable="false" />
    : player.userId ? <AvatarThumbnail userId={player.userId} size={112} showPlaceholder />
      : <img src="/avatars/default.png" alt="" draggable="false" />}</span>;
}

// Portraits identify the three owners throughout the sequence. The money
// tokens cross between them; a fixed owner never appears to keep a moved pot.
export default function InfortuneExchangeAnimation({ exchange, index, total, players, banks, selfId }) {
  const source = players.findIndex(player => player.id === exchange.from);
  const target = players.findIndex(player => player.id === exchange.to);
  if (source < 0 || target < 0) return null;
  const impact = exchangeImpact(exchange, selfId);
  const name = id => id === selfId ? "Toi" : players.find(player => player.id === id)?.nick;
  const before = { ...banks, [exchange.from]: exchange.sourceBank, [exchange.to]: exchange.targetBank };
  return <section key={`${exchange.from}:${index}`} className="infortune-exchange-animation tournament-exchange--replay" role="status" aria-label="Échange des cagnottes"
    style={{ "--swap-duration": `${INFORTUNE_EXCHANGE_STEP_MS}ms` }}>
    <header><p>ÉCHANGE {index + 1} / {total}</p><h2>{name(exchange.from)} <span aria-hidden="true">⇄</span> {name(exchange.to)}</h2></header>
    <div className="infortune-swap">
      <div className="infortune-swap__players">{players.map(player => <div key={player.id} className="infortune-swap__player"
        data-involved={player.id === exchange.from || player.id === exchange.to}>
        <Head player={player} /><strong>{name(player.id)}</strong>
      </div>)}</div>
      <div aria-hidden="true" className="infortune-swap__amounts">{players.map((player, slot) => {
        const to = slot === source ? target : slot === target ? source : slot;
        return <div key={`${index}:${player.id}`} className="infortune-swap__money" data-moving={to !== slot}
          style={{ "--from": slot, "--to": to, "--middle": (slot + to) / 2, "--bend": slot === source ? "-22px" : "22px" }}>
          <strong>{money(before[player.id])}</strong>
        </div>;
      })}</div>
    </div>
    <p className="infortune-swap__accessible">{name(exchange.from)} reçoit {money(exchange.targetBank)} contre {money(exchange.sourceBank)} pour {name(exchange.to)}.</p>
    <footer data-gain={Math.sign(impact?.delta || 0)}>{impact ? <>
      <span>Ta cagnotte : {money(impact.before)} → <strong>{money(impact.after)}</strong></span>
      <b>{impact.delta > 0 ? `+${money(impact.delta)}` : impact.delta < 0 ? `−${money(-impact.delta)}` : "Même montant"}</b>
    </> : <span>Ta cagnotte reste à <strong>{money(before[selfId])}</strong>.</span>}</footer>
  </section>;
}
