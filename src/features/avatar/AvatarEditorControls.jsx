import React from "react";
import { getAvatarSliders } from "./avatarControls.js";
import { hasAvatarEyelids } from "../../../shared/avatarEyes.js";

export const SKIN_COLORS = ["#ffdbc0", "#f6bd91", "#d89c70", "#ba8159", "#955f40", "#75482f", "#503427"];
export const HAIR_COLORS = ["#292326", "#653a23", "#99532b", "#d4ad64", "#dfd7c9", "#963d69", "#477c96"];
export const IRIS_COLORS = ["#754a2b", "#658c6c", "#4a92c7", "#8796a6", "#6e569b"];
export const BACKGROUND_COLORS = ["#204e63", "#37674c", "#74518a", "#96514a", "#9d7633", "#364473"];
const FABRIC_COLORS = ["#355a8b", "#35745d", "#9f3b47", "#c49c58", "#ece4d4", "#34323c", "#9b6bb1"];
const LIP_COLORS = ["#c87b7b", "#ad6862", "#9a4c49", "#cf627a", "#93405f", "#714739"];

function Palette({ label, colors, value, onChange, onOriginal }) {
  return <fieldset className="avatar-palette">
    <legend>{label}</legend>
    <div>
      {colors.map((color, index) => <button key={color} type="button" style={{ background: color }} aria-label={`${label} ${index + 1}`} aria-pressed={value === color} onClick={() => onChange(color)}>{value === color ? "✓" : ""}</button>)}
      <label className="avatar-custom-color" title="Couleur personnalisée">+
        <input aria-label={`${label} personnalisée`} type="color" value={value || colors[0]} onChange={event => onChange(event.target.value)} />
      </label>
    </div>
    {onOriginal ? <button type="button" className="avatar-original-color" onClick={onOriginal}>Couleur d’origine</button> : null}
  </fieldset>;
}

export default function AvatarEditorControls({ category, draft, limits, incompatible, onChange }) {
  const sliders = getAvatarSliders(category, draft);
  let palette = null;
  if (category === "base") palette = { label: "Teinte de peau", colors: SKIN_COLORS, value: draft.tone === "native" ? "" : draft.customColor, onChange: color => onChange({ customColor: color, tone: "custom" }), onOriginal: () => onChange({ tone: "native" }) };
  if (category === "eyes" && draft.eyes !== "dots") palette = { label: "Couleur des yeux", colors: IRIS_COLORS, value: draft.irisColor, onChange: color => onChange({ irisColor: color }) };
  if (["hair", "brows"].includes(category)) palette = { label: "Couleur des cheveux et sourcils", colors: HAIR_COLORS, value: draft.hairColor, onChange: color => onChange({ hairColor: color }), onOriginal: () => onChange({ hairColor: "" }) };
  if (category === "facialhair") palette = { label: "Couleur de la barbe", colors: HAIR_COLORS, value: draft.facialhairColor, onChange: color => onChange({ facialhairColor: color }), onOriginal: () => onChange({ facialhairColor: "" }) };
  if (category === "glasses") palette = { label: "Couleur de la monture", colors: FABRIC_COLORS, value: draft.glassesColor, onChange: color => onChange({ glassesColor: color }), onOriginal: () => onChange({ glassesColor: "" }) };
  if (category === "mouths") palette = { label: "Couleur des lèvres", colors: LIP_COLORS, value: draft.mouthColor, onChange: color => onChange({ mouthColor: color }), onOriginal: () => onChange({ mouthColor: "" }) };
  if (category === "clothes" || category === "headwear") {
    const key = category === "clothes" ? "clothesColor" : "headwearColor";
    palette = { label: category === "clothes" ? "Couleur du vêtement" : "Couleur du chapeau", colors: FABRIC_COLORS, value: draft[key], onChange: color => onChange({ [key]: color }), onOriginal: () => onChange({ [key]: "" }) };
  }
  if (category === "backdrops") palette = draft.backdrops
    ? { label: "Teinte du décor", colors: BACKGROUND_COLORS, value: draft.backdropColor, onChange: color => onChange({ backdropColor: color, backdropTint: draft.backdropTint || .2 }), onOriginal: () => onChange({ backdropTint: 0 }) }
    : { label: "Couleur du fond", colors: BACKGROUND_COLORS, value: draft.backgroundColor, onChange: color => onChange({ backgroundColor: color }) };

  return <div className="avatar-controls">
    {palette ? <Palette {...palette} /> : null}
    {sliders.length > 0 && (category !== "backdrops" || draft.backdrops) ? <fieldset className="avatar-adjustments">
      <legend>Ajuster {category === "mouths" ? "la bouche" : category === "accessories" ? "la balafre" : "les proportions"}</legend>
      {sliders.map(control => {
        const { key, label, multiplier, unit, defaultValue } = control;
        const [min, max] = limits?.[key]?.every(Number.isFinite) ? limits[key] : [control.min, control.max];
        return <label className="avatar-slider" key={key}>
          <span>{key === "irisScale" && draft.eyes === "dots" ? "Taille des points" : label}</span>
          <input type="range" min={Math.round(min * multiplier)} max={Math.round(max * multiplier)} step={control.step * multiplier} value={Math.round((draft[key] ?? defaultValue) * multiplier)} disabled={!draft[category] || (key === "openness" && !hasAvatarEyelids(draft.eyes)) || (category === "mouths" && incompatible) || min === max} onChange={event => onChange({ [key]: Number(event.target.value) / multiplier })} />
          <output>{Math.round((draft[key] ?? defaultValue) * multiplier)} {unit}</output>
        </label>;
      })}
      <button type="button" className="avatar-reset-adjustments" onClick={() => onChange(Object.fromEntries(sliders.map(control => [control.key, control.defaultValue])))}>Réinitialiser les réglages</button>
    </fieldset> : null}
    {category === "headwear" && draft.headwear ? <label className="avatar-hair-visibility">Cheveux sous le chapeau
      <select value={draft.headwearHair} onChange={event => onChange({ headwearHair: event.target.value })}>
        <option value="auto">Ajustement automatique</option><option value="under">Sous le chapeau</option><option value="all">Tous les cheveux</option><option value="hide">Masquer les cheveux</option>
      </select>
    </label> : null}
    {category === "mouths" && incompatible ? <p className="avatar-editor-note" role="status">Cette bouche ne tient pas avec ces proportions. Choisis un autre modèle ou réinitialise les réglages.</p> : null}
  </div>;
}
