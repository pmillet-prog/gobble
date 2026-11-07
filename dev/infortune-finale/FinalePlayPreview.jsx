import React from "react";
import { selectInfortuneFinalePuzzle } from "../../shared/infortuneFinaleCatalog.js";
import { INFORTUNE_FINALE_DEFAULTS, normalizeFinaleRules } from "../../shared/infortuneFinaleRules.js";
import { createLocalFinaleSession as createInfortuneFinaleSession } from './createLocalFinaleSession.js';
import { createFinaleController } from "../../src/features/infortune/finale/createFinaleController.js";
import InfortuneFinale from "../../src/components/infortune/finale/InfortuneFinale.jsx";
import FinaleTrialTools from "./FinaleTrialTools.jsx";
import { FinaleIntroSequence } from '../../src/components/infortune/finale/FinaleIntro.jsx';

export default function FinalePlayPreview({ pool, bank = 2000, fixedBank = false, rules = INFORTUNE_FINALE_DEFAULTS, onRulesChange, onRestart, onClose, history }) {
  const [config, setConfig] = React.useState(() => ({ bank, ...INFORTUNE_FINALE_DEFAULTS, ...rules }));
  const [trial, setTrial] = React.useState(() => ({ puzzle: selectInfortuneFinalePuzzle(pool, { allowDrafts: true }), config, id: 0 }));
  const [menu, setMenu] = React.useState(false), [error, setError] = React.useState("");
  const recentIds = React.useRef([trial.puzzle.id]);
  const controller = React.useMemo(() => createFinaleController(createInfortuneFinaleSession({ puzzle: trial.puzzle,
    bank: fixedBank ? bank : trial.config.bank, rules: trial.config })), [trial, bank, fixedBank]);
  function begin(puzzle, values = trial.config) {
    try {
      const next = { ...normalizeFinaleRules(values), bank: fixedBank ? bank : Number(values.bank) };
      createInfortuneFinaleSession({ puzzle, bank: next.bank, rules: next });
      setTrial(current => ({ puzzle, config: next, id: current.id + 1 }));
      recentIds.current = [...recentIds.current, puzzle.id].slice(-pool.puzzles.length);
      onRulesChange?.(next); setError(""); setMenu(false);
    } catch { setError("Vérifie les montants : des entiers positifs et une voyelle plus chère qu’une consonne."); }
  }
  const random = () => begin(selectInfortuneFinalePuzzle(pool, { recentIds: recentIds.current, allowDrafts: true }));
  return <><FinaleIntroSequence key={trial.id}><InfortuneFinale controller={controller} onReplay={random} onClose={onClose || (() => { window.location.href = "/dev/infortune-perspective/index.html"; })}
    subtitle={fixedBank ? "Essai de tournoi · finale" : "Essai de finale"}
    actions={<button type="button" aria-label="Réglages de la finale" onClick={() => setMenu(true)}>⚙</button>} /></FinaleIntroSequence>
    {menu && <FinaleTrialTools pool={pool} puzzle={trial.puzzle} config={config} setConfig={setConfig} onClose={() => setMenu(false)}
      onApply={() => begin(trial.puzzle, config)} onRandom={random} onChoose={id => begin(pool.puzzles.find(puzzle => puzzle.id === id))}
      controller={controller} initialBank={fixedBank ? bank : trial.config.bank} fixedBank={fixedBank} onRestart={onRestart} error={error} history={history} />}</>;
}
