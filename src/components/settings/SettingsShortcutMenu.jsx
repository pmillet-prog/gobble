import React from "react";
import { FacebookLogo } from "../FacebookGroupInviteModal.jsx";
import { openFacebookGroup } from "../../utils/facebookGroup.js";
import "./settingsShortcuts.css";

function Shortcut({ label, icon, children, onClick, disabled, tone = "", active = false }) {
  return <button type="button" className={`settings-shortcut ${tone}`} onClick={onClick}
    disabled={disabled} aria-label={label} title={label}>
    {children || <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>}
    {active ? <span className="settings-shortcut-status" aria-hidden="true" /> : null}
    <span className="settings-shortcut-tooltip" aria-hidden="true">{label}</span>
  </button>;
}

export default function SettingsShortcutMenu({ darkMode, devMenuUnlocked, devControlsEnabled, moderationAvailable,
  playtimeLimitActive, onGeneral, onHelp,
  onAbout, onHome, onDev, onModeration }) {
  return <nav className={`settings-shortcuts${darkMode ? " is-dark" : ""}`} aria-label="Réglages et aide">
    <div className="settings-shortcuts-main">
      <Shortcut label="Réglages" icon="tune" onClick={onGeneral} active={playtimeLimitActive} tone="is-general" />
      <Shortcut label="Aide rapide et didacticiel" icon="help" onClick={onHelp} tone="is-help" />
      <Shortcut label="À propos" icon="info" onClick={onAbout} tone="is-about" />
      <Shortcut label="Groupe Facebook" onClick={openFacebookGroup} tone="is-facebook">
        <FacebookLogo className="settings-facebook-icon" />
      </Shortcut>
    </div>
    {devMenuUnlocked || moderationAvailable ? <div className="settings-shortcuts-admin" role="group" aria-label="Outils autorisés">
      {devMenuUnlocked ? <Shortcut label="Outils de test" icon="code" onClick={onDev} active={devControlsEnabled} tone="is-dev" /> : null}
      {moderationAvailable ? <Shortcut label="Modération" icon="shield" onClick={onModeration} tone="is-moderation" /> : null}
    </div> : null}
    <div className="settings-shortcuts-home">
      <Shortcut label="Retour au lobby" icon="home" onClick={onHome} tone="is-home" />
    </div>
  </nav>;
}
