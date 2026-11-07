import React from "react";
import { loadFinalePool } from "../infortune-finale/loadFinalePool.js";
import FinalePlayPreview from "../infortune-finale/FinalePlayPreview.jsx";
import InfortuneGameSurface from "../../src/components/infortune/InfortuneGameSurface.jsx";

export default function WorkshopTournamentFinale({ bank, rules, onRulesChange, onRestart, onClose, history }) {
  const [pool, setPool] = React.useState(null), [failed, setFailed] = React.useState(false), [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let active = true; setFailed(false);
    loadFinalePool().then(value => { if (active) setPool(value); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);
  if (!pool) return <InfortuneGameSurface subtitle="La finale" bank={bank} onClose={onClose}>
    {failed ? <div role="alert"><p>Impossible de charger les énigmes. Ta cagnotte est conservée.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Réessayer</button></div>
      : <p role="status">Préparation de la finale…</p>}
  </InfortuneGameSurface>;
  return <FinalePlayPreview pool={pool} bank={bank} fixedBank rules={rules} onRulesChange={onRulesChange} onRestart={onRestart} onClose={onClose} history={history} />;
}
