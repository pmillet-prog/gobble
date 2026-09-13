import React from "react";

function Choice({ label, detail, icon, tone, onClick, disabled }) {
  return <button type="button" className="settings-choice" onClick={onClick} disabled={disabled}>
    <span className={`settings-choice-icon ${tone} material-symbols-outlined`} aria-hidden="true">{icon}</span>
    <span className="settings-choice-copy"><strong>{label}</strong><small>{detail}</small></span>
    <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
  </button>;
}

export function SettingsPreferenceChoices({ darkMode, isMobileLayout, onSound, onVisual, onKeyboard }) {
  return <nav className={`settings-choices${darkMode ? " is-dark" : ""}`} aria-label="Réglages du jeu">
    <Choice label="Son" detail="Volume, bruitages et ambiances" icon="volume_up" tone="is-sound" onClick={onSound} />
    <Choice label="Graphismes" detail="Thème, apparence et effets" icon="palette" tone="is-visual" onClick={onVisual} />
    {!isMobileLayout ? <Choice label="Clavier" detail="Saisie et raccourcis" icon="keyboard" tone="is-keyboard" onClick={onKeyboard} /> : null}
  </nav>;
}

export function SettingsHelpChoices({ darkMode, isConnecting, onQuickHelp, onTutorial }) {
  return <nav className={`settings-choices${darkMode ? " is-dark" : ""}`} aria-label="Aide">
    <Choice label="Aide rapide" detail="Consulter les règles du jeu" icon="help" tone="is-help" onClick={onQuickHelp} />
    <Choice label="Didacticiel" detail="Apprendre en jouant, étape par étape" icon="school" tone="is-tutorial" onClick={onTutorial} disabled={isConnecting} />
  </nav>;
}
