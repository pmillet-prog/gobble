import React from "react";
import ChalkboardIcon from "./ChalkboardIcon.jsx";
import { chalkboardFontFamily } from "./chalkboardFonts.js";
import { DEFAULT_CHALKBOARD_TEXT_COLOR } from "../../../shared/chalkboardText.js";

const fontLabel = font => font.replace(/-/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());

export default function ChalkboardTextComposer({ text, font, color = DEFAULT_CHALKBOARD_TEXT_COLOR, fonts = [], fontsReady, onChange, onStyleChange, onFinish, onCancel }) {
  const inputRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const input = inputRef.current;
    input.focus({ preventScroll: true });
  }, []);
  return <form className="chalkboard-composer" aria-label="Écrire sur le tableau" onSubmit={event => {
    event.preventDefault();
    if (text.trim() && fontsReady) { inputRef.current?.blur(); onFinish(); }
  }}>
    <label className="chalkboard-message-label" htmlFor="chalkboard-message">Ton message · aperçu en direct sur le tableau</label>
    <div className="chalkboard-text-style">
      <label className="chalkboard-text-color"><span>Couleur</span>
        <input type="color" aria-label="Couleur du texte" value={color} onChange={event => onStyleChange({ color: event.target.value })} />
      </label>
      <label className="chalkboard-text-font"><span>Police</span>
        <select aria-label="Police du texte" value={font || ""} disabled={!fontsReady} style={{ fontFamily: chalkboardFontFamily(font) }}
          onChange={event => onStyleChange({ font: event.target.value })}>
          {font && !fonts.some(item => item.id === font) && <option value={font}>Police actuelle</option>}
          {fonts.map(item => <option key={item.id} value={item.id} style={{ fontFamily: chalkboardFontFamily(item.id) }}>{fontLabel(item.id)}</option>)}
        </select>
      </label>
    </div>
    <div className="chalkboard-composer-fields">
      <textarea ref={inputRef} id="chalkboard-message" className="chalkboard-text-entry" rows={2} maxLength={280}
        lang="fr" spellCheck autoCorrect="on" autoCapitalize="sentences" enterKeyHint="enter"
        placeholder="À toi la craie…" value={text} onChange={event => onChange(event.target.value)} />
      <div className="chalkboard-composer-actions">
        <button type="button" onClick={onCancel}>Annuler</button>
        <button type="submit" className="chalkboard-place" disabled={!text.trim() || !fontsReady}><ChalkboardIcon name="check" />Terminer</button>
      </div>
    </div>
    <p className="chalkboard-composer-hint">
      <span className="chalkboard-composer-preview-hint">Déplace le texte et utilise les poignées : ↻ rotation, ↘ taille, ↔ largeur. Publie ensuite quand c’est prêt.</span>
      <span className="chalkboard-composer-focus-hint">Termine ta saisie, puis place ton texte sur le tableau avant de le publier.</span>
    </p>
  </form>;
}
