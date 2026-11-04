import React from "react";
import { createRoot } from "react-dom/client";
import InfortuneWheel from "../../src/components/infortune/InfortuneWheel.jsx";
import { DEFAULT_PHYSICS } from "../../src/features/infortune/wheelConfig.js";
import "./preview.css";

function Workshop() {
  const [physics, setPhysics] = React.useState(DEFAULT_PHYSICS);
  const [phase, setPhase] = React.useState("ready");
  const [history, setHistory] = React.useState([]);
  const busy = !["ready", "finished"].includes(phase);
  return <main className="wheel-workshop">
    <nav className="wheel-workshop__masthead" aria-label="Atelier"><span className="wheel-workshop__brand">gobble<span>✳</span></span><span>L’ATELIER DES JEUX</span><span className="wheel-workshop__badge">PROTOTYPE JOUABLE</span></nav>
    <header className="wheel-workshop__heading"><p>FAITES TOURNER LE DESTIN</p><h1>La roue <em>de l’infortune</em><span>✦</span></h1><div>Un tour de main. Et tout peut basculer.</div></header>
    <InfortuneWheel physics={physics} onPhaseChange={setPhase} onResult={result => setHistory(previous => [result, ...previous].slice(0, 6))}>
      <details className="wheel-workshop__settings"><summary>Réglages du toucher<span aria-hidden="true">＋</span></summary>
        <fieldset disabled={busy}>
          <label>Frottement de l’axe <output>{physics.friction.toFixed(2)}</output><input type="range" min="0.6" max="1.5" step="0.05" value={physics.friction} onChange={event => setPhysics(current => ({ ...current, friction: Number(event.target.value) }))} /></label>
          <label>Résistance de la languette <output>{Math.round(physics.pegBarrier * 1000)}</output><input type="range" min="0.01" max="0.06" step="0.002" value={physics.pegBarrier} onChange={event => setPhysics(current => ({ ...current, pegBarrier: Number(event.target.value) }))} /></label>
          <button type="button" onClick={() => setPhysics(DEFAULT_PHYSICS)}>Réglages d’origine</button>
        </fieldset>
      </details>
    </InfortuneWheel>
    <section className="wheel-workshop__history" aria-label="Derniers lancers"><h2>Les derniers tours</h2><div>{history.length ? history.map((result, index) => <span key={history.length - index} data-kind={result.kind}>{result.label}</span>) : <p>Votre premier lancer ouvre le bal.</p>}</div></section>
    <footer className="wheel-workshop__footer"><span>ATELIER LOCAL · SANS MISE NI GAIN</span><p>Montants d’essai en euros. Les effets de Bonus et Banqueroute seront définis avant l’intégration aux manches.</p></footer>
  </main>;
}

createRoot(document.getElementById("root")).render(<React.StrictMode><Workshop /></React.StrictMode>);
