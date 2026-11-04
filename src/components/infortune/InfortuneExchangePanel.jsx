import React from "react";
import InfortuneContestants from "./InfortuneContestants.jsx";

export default function InfortuneExchangePanel({ stage, plateau, economy, onChoose }) {
  const choosing = stage === "exchange";
  if (!["exchange", "exchange-wait", "accounting", "settled"].includes(stage)) return null;
  const byId = id => plateau.members.find(player => player.id === id)?.nick;
  const chosen = economy?.members[plateau?.self.id]?.target;
  return <section className="infortune-exchange" aria-label="Échange de cagnottes" aria-live="polite">
    <strong>{choosing ? "Avec qui échanges-tu ta cagnotte ?" : stage === "settled" ? "Échanges effectués !" : stage === "exchange-wait" ? "Les candidats terminent leurs choix…" : "Enregistrement du lancer…"}</strong>
    <p>{choosing ? "Choisis un avatar sur le plateau ou ci-dessous. Les deux cagnottes seront échangées intégralement." : economy?.hidden ? "Les montants restent secrets." : "Ta cagnotte est mise à jour."}</p>
    <InfortuneContestants contestants={plateau?.opponents} economy={economy} onChoose={choosing ? onChoose : undefined} />
    {chosen && stage === "exchange-wait" && <p>Ton choix : {byId(chosen)}.</p>}
    {stage === "settled" && <p>{economy.exchangeOrder[plateau.id]?.filter(id => economy.members[id]?.target)
      .map(id => `${byId(id)} ↔ ${byId(economy.members[id].target)}`).join(" · ")}</p>}
    {economy?.exchangeEnabled && <small>Ordre des échanges : {economy.exchangeOrder[plateau.id]?.map(id => plateau.members.find(player => player.id === id)?.nick).join(" → ")}</small>}
  </section>;
}
