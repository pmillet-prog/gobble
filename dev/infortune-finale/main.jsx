import React from "react";
import { createRoot } from "react-dom/client";
import { selectInfortuneFinalePuzzle } from "../../shared/infortuneFinaleCatalog.js";
import { INFORTUNE_FINALE_DEFAULTS } from "../../shared/infortuneFinaleRules.js";
import { createInfortuneFinaleSession } from "../../shared/createInfortuneFinaleSession.js";
import { createFinaleController } from "../../src/features/infortune/finale/createFinaleController.js";
import InfortuneFinale from "../../src/components/infortune/finale/InfortuneFinale.jsx";
import FinaleWorkshopControls from "./FinaleWorkshopControls.jsx";
import FinalePoolReview, { INITIAL_REVIEW_FILTERS } from "./FinalePoolReview.jsx";
import { loadFinalePool } from "./loadFinalePool.js";
import "./workshop.css";

const INITIAL_CONFIG = { bank: 2000, ...INFORTUNE_FINALE_DEFAULTS };

function FinaleWorkshop({ bank }) {
  const [section, setSection] = React.useState("play");
  const [reviewFilters, setReviewFilters] = React.useState(INITIAL_REVIEW_FILTERS);
  const [config, setConfig] = React.useState(INITIAL_CONFIG);
  const [trial, setTrial] = React.useState({ puzzle: bank.puzzles[0], config: INITIAL_CONFIG, id: 0 });
  const recentIds = React.useRef([bank.puzzles[0].id]);
  const [error, setError] = React.useState("");
  const controller = React.useMemo(() => createFinaleController(createInfortuneFinaleSession({
    puzzle: trial.puzzle, bank: trial.config.bank, rules: trial.config,
  })), [trial]);

  function begin(puzzle, values = trial.config) {
    try {
      // Validate trial values before discarding a running session.
      createInfortuneFinaleSession({ puzzle, bank: values.bank, rules: values });
      setTrial(current => ({ puzzle, config: { ...values }, id: current.id + 1 }));
      if (recentIds.current.at(-1) !== puzzle.id) recentIds.current.push(puzzle.id);
      recentIds.current = recentIds.current.slice(-bank.puzzles.length);
      setError("");
    } catch { setError("Vérifie le barème : des entiers positifs et une voyelle plus chère qu’une consonne."); }
  }
  function randomPuzzle() {
    const puzzle = selectInfortuneFinalePuzzle(bank, { recentIds: recentIds.current, allowDrafts: true });
    if (puzzle) begin(puzzle);
  }

  return <main className="finale-workshop">
    <nav className="finale-workshop__nav"><a className="finale-workshop__brand" href="/">gobble<span>✳</span></a>
      <span>ATELIER FINALE</span><div><a href="/dev/infortune-perspective/">← La roue</a><a href="/">Accueil du jeu</a></div></nav>
    <p className="finale-workshop__notice">Simulation · {bank.puzzles.length} textes de travail · aucun gain réel</p>
    <nav className="finale-workshop__sections" aria-label="Rubriques de l’atelier">
      <button type="button" aria-pressed={section === "play"} onClick={() => setSection("play")}>Essayer la finale</button>
      <button type="button" aria-pressed={section === "review"} onClick={() => setSection("review")}>Relire le pool · {bank.puzzles.length}</button>
    </nav>
    {section === "review" ? <FinalePoolReview bank={bank} filters={reviewFilters} onFiltersChange={setReviewFilters}
      onTry={puzzle => { begin(puzzle); setSection("play"); window.scrollTo({ top: 0 }); }} />
      : <div className="finale-workshop__layout"><InfortuneFinale key={trial.id} controller={controller} onReplay={randomPuzzle} />
      <div><FinaleWorkshopControls bank={bank} puzzleId={trial.puzzle.id} config={config} setConfig={setConfig}
        onChoose={id => begin(bank.puzzles.find(puzzle => puzzle.id === id))}
        onApply={() => begin(trial.puzzle, config)} onRandom={randomPuzzle} />
        {error && <p className="finale-workshop__error" role="alert">{error}</p>}</div>
    </div>}
    <footer className="finale-workshop__footer">{section === "review" ? "Relecture des textes de travail · niveaux de difficulté indicatifs"
      : "Achète les lettres de l’énoncé, trouve le mot, préserve ta cagnotte."}</footer>
  </main>;
}

const root = createRoot(document.getElementById("root"));
async function openWorkshop() {
  root.render(<main className="finale-workshop"><p role="status">Chargement du pool…</p></main>);
  try {
    const bank = await loadFinalePool();
    root.render(<React.StrictMode><FinaleWorkshop bank={bank} /></React.StrictMode>);
  } catch {
    root.render(<main className="finale-workshop"><p role="alert">Impossible de charger le pool à jour.</p>
      <button type="button" onClick={() => window.location.reload()}>Réessayer</button></main>);
  }
}
openWorkshop();
