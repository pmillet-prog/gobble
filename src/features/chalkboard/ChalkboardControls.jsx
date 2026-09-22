import React from "react";
import { CHALKBOARD_PALETTE } from "./chalkboardModel.js";
import ChalkboardIcon from "./ChalkboardIcon.jsx";
import { CHALKBOARD_ERASER } from "../../../shared/chalkboardErasure.js";
import { CHALKBOARD_LIMITS, getChalkboardDraftUsage } from "../../../shared/chalkboardLimits.js";

const COLOR_NAMES = ["blanche", "jaune", "rose", "bleue", "verte", "violette"];

export default function ChalkboardControls({ editor, editing, busy, canPublish, onTool, onCancel, onPublish, onEditText }) {
  const tool = editing ? editor.tool : "pan";
  const hasErasures = editor.elements.some(element => element.type === "erase");
  const usage = getChalkboardDraftUsage(editor.elements);
  const nearLimit = usage.elements >= CHALKBOARD_LIMITS.maxElements * .8 || usage.points >= CHALKBOARD_LIMITS.maxPoints * .8;
  return (
    <footer className="chalkboard-tray" aria-label="Écrire ou dessiner sur le tableau">
      <div className="chalkboard-actions">
        <div className="chalkboard-tools" aria-label="Action sur le tableau">
          <button type="button" className="chalkboard-write" aria-pressed={tool === "text"} onClick={() => onTool("text")} disabled={!canPublish || busy || !editor.fontsReady}>
            <ChalkboardIcon name="write" />Écrire
          </button>
          <button type="button" className="chalkboard-draw" aria-pressed={tool === "chalk"} onClick={() => onTool("chalk")} disabled={!canPublish || busy}>
            <ChalkboardIcon name="draw" />Dessiner
          </button>
          <button type="button" className="chalkboard-sponge" aria-pressed={tool === "erase"} onClick={() => onTool("erase")} disabled={!canPublish || busy} title="Gommer uniquement mes interventions">
            <ChalkboardIcon name="sponge" />Éponge
          </button>
        </div>
        {editing && <div className="chalkboard-draft-actions">
          <button type="button" onClick={editor.undo} disabled={!editor.historyCount || busy} aria-label="Annuler la dernière action" title="Annuler la dernière action"><ChalkboardIcon name="undo" /></button>
          {editor.selectedTextId && <button type="button" onClick={onEditText} disabled={busy} aria-label="Modifier le texte sélectionné" title="Modifier le texte sélectionné"><ChalkboardIcon name="write" /></button>}
          {editor.selectedTextId && <button type="button" onClick={editor.removeSelected} disabled={busy} aria-label="Supprimer le texte sélectionné" title="Supprimer le texte sélectionné"><ChalkboardIcon name="erase" /></button>}
          <button type="button" className="chalkboard-cancel" onClick={onCancel} disabled={busy}>Abandonner</button>
          <button type="button" className="chalkboard-publish" onClick={() => onPublish()} disabled={!editor.hasDraft || busy || !canPublish}><ChalkboardIcon name="check" />{busy ? "Enregistrement…" : hasErasures ? "Valider" : "Publier"}</button>
        </div>}
      </div>
      {tool === "chalk" ? <div className="chalkboard-chalks">
        <div className="chalkboard-colors" role="group" aria-label="Couleur de la craie">
          {CHALKBOARD_PALETTE.map((color, index) => <button key={color} type="button" aria-label={`Craie ${COLOR_NAMES[index]}`} aria-pressed={editor.color === color} style={{ "--chalk-color": color }} onClick={() => editor.setColor(color)} disabled={busy} />)}
          <label className="chalkboard-custom-color" title="Autre couleur"><input aria-label="Autre couleur de craie" type="color" value={editor.color} onChange={event => editor.setColor(event.target.value)} disabled={busy} /></label>
        </div>
        <label className="chalkboard-size">Trait<input type="range" min="4" max="30" value={editor.size} onChange={event => editor.setSize(Number(event.target.value))} disabled={busy} /></label>
      </div> : null}
      {tool === "erase" && <div className="chalkboard-chalks">
        <label className="chalkboard-size">Diamètre de l’éponge<input type="range" min={CHALKBOARD_ERASER.min} max={CHALKBOARD_ERASER.max} value={editor.eraserSize} onChange={event => editor.setEraserSize(Number(event.target.value))} disabled={busy} /><output>{editor.eraserSize}</output></label>
      </div>}
      {editor.fontsError && <p className="chalkboard-font-error" role="status">Les polices n’ont pas pu être chargées. <button type="button" onClick={editor.reloadFonts}>Réessayer</button></p>}
      {editing && (editor.limitReached || nearLimit) && <p className="chalkboard-font-error" role="status">{editor.limitReached ? "Ce brouillon a atteint sa limite. Publie-le pour continuer à dessiner." : "Ton dessin est bien rempli : pense à le publier bientôt pour continuer."}</p>}
      {!canPublish && <p className="chalkboard-guidance">Le tableau est public. Connecte-toi depuis l’accueil pour écrire ou dessiner.</p>}
      <p className="chalkboard-guidance">{tool === "erase" ? "Seules tes interventions sont affichées. Frotte pour gommer, puis valide." : tool === "chalk" ? "Dessine sur le tableau, puis publie quand c’est prêt." : tool === "text" ? "Déplace ton texte. Poignées : ↻ rotation, ↘ taille, ↔ largeur et retours à la ligne." : editing ? "Déplace le tableau pour continuer ailleurs. Ton brouillon est conservé." : "Fais glisser le tableau ou utilise la molette pour découvrir la suite."}{tool !== "pan" ? " Reclique sur l’outil actif pour faire défiler." : ""}</p>
    </footer>
  );
}
