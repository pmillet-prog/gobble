import React from "react";
import InfortuneContestants from "../../src/components/infortune/InfortuneContestants.jsx";

export function useExchangeWorkshop(contestants) {
  const [enabled, setEnabled] = React.useState(false), [choosing, setChoosing] = React.useState(false);
  const [balance, setBalance] = React.useState(1200), [notice, setNotice] = React.useState("");
  const [opponentBanks, setOpponentBanks] = React.useState([800, 2400]);
  const economy = React.useMemo(() => ({ hidden: enabled,
    members: Object.fromEntries(contestants.map((player, index) => [player.id, { bank: opponentBanks[index] }])) }), [enabled, contestants, opponentBanks]);
  function choose(id) {
    const index = contestants.findIndex(player => player.id === id);
    if (index < 0 || !choosing) return;
    setBalance(opponentBanks[index]); setOpponentBanks(values => values.map((value, i) => i === index ? balance : value));
    setNotice(`Échange effectué avec ${contestants[index].nick}. Les montants restent masqués.`); setChoosing(false);
  }
  return { enabled, setEnabled, choosing, economy, balance, notice, choose,
    simulate() { setChoosing(true); setNotice(""); },
    result(result) { if (enabled && result.kind === "exchange") setChoosing(true); },
    reset() { setChoosing(false); setNotice(""); },
  };
}

export function ExchangeWorkshopControls({ preview, disabled, onChange }) {
  return <section className="perspective-workshop__panel">
    <h2>Échange de cagnottes</h2>
    <label><input type="checkbox" checked={preview.enabled} disabled={disabled} onChange={event => onChange(event.target.checked)} /> Tester la manche 4</label>
    <p>{preview.enabled ? "Les trois tuiles arrivent à la fin de l’intro. Les cagnottes sont masquées." : `Ta cagnotte d’essai : ${preview.balance.toLocaleString("fr-FR")} €`}</p>
    <button type="button" disabled={!preview.enabled || disabled} onClick={preview.simulate}>Tester le choix d’un échange</button>
    <p>Essai local : aucun compte ni cagnotte du jeu n’est modifié.</p>
  </section>;
}

export function ExchangeWorkshopChoice({ preview, contestants }) {
  if (!preview.choosing && !preview.notice) return null;
  return <section className="infortune-exchange">
    <strong>{preview.notice || "Choisis l’avatar avec lequel échanger"}</strong>
    {preview.choosing && <InfortuneContestants contestants={contestants} economy={preview.economy} onChoose={preview.choose} />}
  </section>;
}
