import React from "react";
import { STAGE_CONTESTANTS } from "./stageFixtures.js";
import { PRESENTER_IDENTITIES } from "../../shared/presenterIdentities.js";

export function useStageContestants() {
  const [selection, setSelection] = React.useState(["pivot", "lepers"]);
  const contestants = React.useMemo(() => selection.map((key, i) => key === "demo" ? STAGE_CONTESTANTS[i]
    : { id: `workshop-${i}-${key}`, isBot: true, presenterKey: key, nick: PRESENTER_IDENTITIES[key].nick }), [selection]);
  return { selection, contestants, setSelection };
}

export function StageContestantControls({ value, onChange, disabled }) {
  return <section className="perspective-workshop__camera" aria-label="Candidats du plateau">
    <h2>Candidats du plateau</h2>
    {value.map((key, i) => <label key={i}>Emplacement {i + 1}
      <select className="perspective-workshop__contestant-select" disabled={disabled} value={key}
        onChange={event => onChange(previous => previous.map((current, j) => j === i ? event.target.value : current))}>
        <option value="demo">Avatar de test · {STAGE_CONTESTANTS[i].nick}</option>
        {Object.entries(PRESENTER_IDENTITIES).map(([id, presenter]) => <option key={id} value={id}>{presenter.nick}</option>)}
      </select>
    </label>)}
    <p className="perspective-workshop__camera-note">En partie, les présentateurs complètent automatiquement les groupes de trois.</p>
  </section>;
}
