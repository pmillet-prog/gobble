import React from "react";
import { FacebookLogo } from "../FacebookGroupInviteModal.jsx";
import { openFacebookGroup } from "../../utils/facebookGroup.js";
import "./settingsShortcuts.css";

function Shortcut({ label, action = label, icon, children, onClick, disabled, tone = "", active = false, pressed, status }) {
  return <div className="settings-shortcut-item">
    <span className="settings-shortcut-label" aria-hidden="true">{label}</span>
    <button type="button" className={`settings-shortcut ${tone}`} onClick={onClick}
    disabled={disabled} aria-label={action} aria-pressed={pressed} title={action}>
    {children || <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>}
    {active ? <span className="settings-shortcut-status" aria-hidden="true" /> : null}
    {status ? <small className="settings-shortcut-value" aria-hidden="true">{status}</small> : null}
  </button></div>;
}

export default function SettingsShortcutMenu({ darkMode, gameDarkMode = darkMode, allSoundOn, onToggleSound, onToggleDarkMode, devMenuUnlocked, devControlsEnabled, moderationAvailable,
  playtimeLimitActive, onGeneral, onHelp,
  onAbout, onHome, onDev, onModeration }) {
  return <nav className={`settings-shortcuts${darkMode ? " is-dark" : ""}`} aria-label="Réglages et aide">
    <div className="settings-shortcuts-quick" role="group" aria-label="Raccourcis rapides">
      <Shortcut label="Son" action={allSoundOn ? "Couper le son" : "Activer le son"} icon={allSoundOn ? "volume_up" : "volume_off"}
        onClick={onToggleSound} pressed={allSoundOn} status={allSoundOn ? "Activé" : "Coupé"} tone="is-sound" />
      <Shortcut label="Affichage" action={gameDarkMode ? "Passer en mode clair" : "Passer en mode sombre"} icon={gameDarkMode ? "dark_mode" : "light_mode"}
        onClick={onToggleDarkMode} pressed={gameDarkMode} status={gameDarkMode ? "Sombre" : "Clair"} tone="is-visual" />
    </div>
    <div className="settings-shortcuts-main">
      <Shortcut label="Réglages" icon="tune" onClick={onGeneral} active={playtimeLimitActive} tone="is-general" />
      <Shortcut label="Aide" action="Aide rapide et didacticiel" icon="help" onClick={onHelp} tone="is-help" />
      <Shortcut label="À propos" icon="info" onClick={onAbout} tone="is-about" />
      <Shortcut label="Facebook" action="Groupe Facebook" onClick={openFacebookGroup} tone="is-facebook">
        <FacebookLogo className="settings-facebook-icon" />
      </Shortcut>
    </div>
    <div className="settings-shortcuts-footer">
    {devMenuUnlocked || moderationAvailable ? <div className="settings-shortcuts-admin" role="group" aria-label="Outils autorisés">
      {devMenuUnlocked ? <Shortcut label="Outils de test" icon="code" onClick={onDev} active={devControlsEnabled} tone="is-dev" /> : null}
      {moderationAvailable ? <Shortcut label="Modération" icon="shield" onClick={onModeration} tone="is-moderation" /> : null}
    </div> : null}
    <div className="settings-shortcuts-home">
      <Shortcut label="Accueil" action="Retour au lobby" icon="home" onClick={onHome} tone="is-home" />
    </div>
    </div>
  </nav>;
}
