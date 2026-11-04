import React from "react";

const KINDS = { riddle: "Énigme", quiz: "Culture générale", definition: "Définition" };

export default function FinaleWorkshopControls({ bank, puzzleId, config, setConfig, onChoose, onApply, onRandom }) {
  const puzzle = bank.puzzles.find(value => value.id === puzzleId);
  const set = (key, value) => setConfig(current => ({ ...current, [key]: Number(value) }));
  return <aside className="finale-workshop-controls">
    <h2>Réglages de l’atelier</h2>
    <label htmlFor="finale-puzzle">Énigme à essayer</label>
    <select id="finale-puzzle" value={puzzleId} onChange={event => onChoose(event.target.value)}>
      {bank.puzzles.map(value => <option key={value.id} value={value.id}>{value.id} · {KINDS[value.kind]} · {value.category}</option>)}
    </select>
    <button type="button" onClick={onRandom}>Tirer une autre énigme</button>
    <form onSubmit={event => { event.preventDefault(); onApply(); }}>
      <label htmlFor="finale-bank">Cagnotte de départ <output>{config.bank}</output></label>
      <input id="finale-bank" type="range" min="0" max="10000" step="50" value={config.bank} onChange={event => set("bank", event.target.value)} />
      <div className="finale-workshop-controls__prices">
        <label>Consonne<input type="number" min="1" max="5000" required value={config.consonantCost} onChange={event => set("consonantCost", event.target.value)} /></label>
        <label>Voyelle<input type="number" min={Math.max(1, config.consonantCost + 1)} max="10000" required value={config.vowelCost} onChange={event => set("vowelCost", event.target.value)} /></label>
        <label>Points si victoire<input type="number" min="0" max="100000" required value={config.victoryPoints} onChange={event => set("victoryPoints", event.target.value)} /></label>
        <label>Cagnotte pour 1 gobblar<input type="number" min="1" max="10000" required value={config.bankPerGobblar} onChange={event => set("bankPerGobblar", event.target.value)} /></label>
      </div>
      <button type="submit">Appliquer et recommencer</button>
      <p>Barème provisoire. Les changements s’appliquent à un nouvel essai.</p>
    </form>
    <details className="finale-workshop-controls__review" key={puzzleId}>
      <summary>Relire le texte et la réponse</summary>
      <p className="finale-workshop-controls__draft">Brouillon · difficulté indicative {puzzle.difficulty}/3</p>
      <blockquote>{puzzle.clue}</blockquote><p>Réponse : <strong>{puzzle.answer}</strong></p>
      <p>{puzzle.source.note}</p>
      {puzzle.source.url && <a href={puzzle.source.url} target="_blank" rel="noreferrer">Référence du fait ↗</a>}
    </details>
  </aside>;
}
