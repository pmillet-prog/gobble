import React from "react";

export default function AvatarColorPalette({ label, colors, value, originalColor, onChange, onOriginal }) {
  return <fieldset className="avatar-palette">
    <legend>{label}</legend>
    <div>
      {colors.map((color, index) => <button key={color} type="button" style={{ background: color }} aria-label={`${label} ${index + 1}`} aria-pressed={value === color} onClick={() => onChange(color)}>{value === color ? "✓" : ""}</button>)}
      <label className="avatar-custom-color" title="Couleur personnalisée">+
        <input aria-label={`${label} personnalisée`} type="color" value={value || originalColor || colors[0]} onChange={event => onChange(event.target.value)} />
      </label>
    </div>
    {onOriginal ? <button type="button" className="avatar-original-color" onClick={onOriginal}>Couleur d’origine</button> : null}
  </fieldset>;
}
