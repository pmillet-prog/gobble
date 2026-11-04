import React from "react";
import { DEFAULT_ACTOR_SHADE } from "./actorShadeSettings.js";

export function ActorShadeControls({ value, onChange }) {
  const change = key => event => onChange(current => ({ ...current, [key]: Number(event.target.value) }));
  return <section className="perspective-workshop__camera" aria-label="Réglages de l’ombre intérieure des avatars">
    <h2>Ombre intérieure des avatars</h2>
    <label>Épaisseur du bord noir <output>{value.edge}</output>
      <input type="range" min="0" max="24" step="1" value={value.edge} onChange={change("edge")} />
    </label>
    <div className="perspective-workshop__ends"><span>Fin</span><span>Épais</span></div>
    <label>Profondeur du fondu <output>{value.fade}</output>
      <input type="range" min="2" max="96" step="1" value={value.fade} onChange={change("fade")} />
    </label>
    <div className="perspective-workshop__ends"><span>Près du bord</span><span>Vers le centre</span></div>
    <label>Intensité de l’ombre <output>{value.strength}%</output>
      <input type="range" min="0" max="100" step="1" value={value.strength} onChange={change("strength")} />
    </label>
    <div className="perspective-workshop__ends"><span>Sans ombre</span><span>Noir</span></div>
    <p className="perspective-workshop__camera-note">Aperçu immédiat sur les trois personnages et leurs reflets.</p>
    <button className="perspective-workshop__text-button" type="button" onClick={() => onChange(DEFAULT_ACTOR_SHADE)}>Réinitialiser l’ombre</button>
  </section>;
}
