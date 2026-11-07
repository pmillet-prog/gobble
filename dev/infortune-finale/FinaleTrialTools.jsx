import React from "react";
import { InfortuneGameDialog } from "../../src/components/infortune/InfortuneGameSurface.jsx";
import "./finaleTrialTools.css";
import FinaleTrialHistory from "./FinaleTrialHistory.jsx";

export default function FinaleTrialTools({ pool, puzzle, config, setConfig, onApply, onRandom, onChoose, onClose,
  controller, initialBank, fixedBank = false, onRestart, error, history = [] }) {
  const [tab, setTab] = React.useState("rules");
  const state = React.useSyncExternalStore(controller.store.subscribe, controller.store.getState, controller.store.getState);
  const change = (key, value) => setConfig(current => ({ ...current, [key]: value === "" ? "" : Number(value) }));
  return <InfortuneGameDialog title="Réglages de l’essai" onClose={onClose}>
    <nav className="infortune-game-dialog__tabs">{[["rules", "Barème"], ["puzzle", "Énigme"], ["balance", "Bilan"], ...(history.length ? [["history", "Lancers"]] : [])].map(([id,label]) =>
      <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === "rules" && <form onSubmit={event => { event.preventDefault(); onApply(); }}>
      {!fixedBank && <label>Cagnotte de départ<input type="number" min="0" required value={config.bank} onChange={event => change("bank", event.target.value)} /></label>}
      <div className="finale-trial-prices">{[["consonantCost","Consonne",1],["vowelCost","Voyelle",Number(config.consonantCost)+1],
        ["victoryPoints","Points gagnés",0],["bankPerGobblar","Cagnotte / gobblar",1]].map(([key,label,min]) =>
        <label key={key}>{label}<input type="number" required min={min} step="1" value={config[key]} onChange={event => change(key,event.target.value)} /></label>)}</div>
      <button type="submit">Appliquer et rejouer</button><p>Un nouvel essai repart avec {fixedBank ? initialBank : config.bank} €. Aucun gain réel ni changement du barème public.</p>
      {error && <p role="alert">{error}</p>}
    </form>}
    {tab === "puzzle" && <><label>Énigme à essayer<select value={puzzle.id} onChange={event => onChoose(event.target.value)}>
      {pool.puzzles.map(value => <option key={value.id} value={value.id}>{value.id} · {value.category}</option>)}
    </select></label><button type="button" onClick={onRandom}>Une autre énigme</button>
      <p>{puzzle.clue}</p><p>Réponse : <strong>{puzzle.answer}</strong> · difficulté {puzzle.difficulty}/3</p>
      <p><a href="/dev/infortune-finale/index.html?edition=1">Outils de relecture du pool</a></p></>}
    {tab === "balance" && <><dl className="finale-trial-balance">{[["Cagnotte initiale",initialBank],["Achats de lettres",state.spent],["Cagnotte restante",state.bank],["Lettres achetées",state.purchased.length]].map(([label,value]) =>
      <div key={label}><dt>{label}</dt><dd>{value.toLocaleString("fr-FR")}</dd></div>)}</dl>
      {onRestart && <button type="button" onClick={onRestart}>Recommencer les quatre lancers</button>}</>}
    {tab === "history" && <FinaleTrialHistory history={history} />}
  </InfortuneGameDialog>;
}
