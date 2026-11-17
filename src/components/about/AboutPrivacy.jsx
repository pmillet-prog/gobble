import React from 'react';
import { CONNECTION_AUDIT_RETENTION_DAYS } from '../../../shared/connectionAudit.js';

export default function AboutPrivacy({ darkMode }) {
  return <details className={`rounded-xl border px-3 py-2 ${darkMode
    ? 'bg-slate-800/90 border-white/15 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-900'}`}>
    <summary className="cursor-pointer text-[12px] font-semibold">Confidentialité</summary>
    <div className="mt-3 space-y-3 text-[12px] leading-relaxed">
      <p><strong>Connexions et sécurité.</strong> Paul Millet, responsable de Gobble, utilise des informations de connexion pour protéger les comptes, rechercher les causes d’un incident et prévenir les utilisations abusives du jeu.</p>
      <p>Lors de la création d’un compte, de sa connexion ou de l’ouverture d’une session existante, un journal enregistre le numéro du compte, son pseudo, l’identifiant d’installation transmis par le navigateur, la date, le type de connexion et l’adresse IP observée par le serveur.</p>
      <p>Ce traitement repose sur l’intérêt légitime de sécuriser le jeu et ses comptes. Ces informations sont enregistrées automatiquement lors des connexions ; elles ne sont pas utilisées pour la publicité ni pour suivre la navigation sur d’autres sites.</p>
      <p>Les entrées de ce journal sont conservées pendant <strong>{CONNECTION_AUDIT_RETENTION_DAYS} jours</strong>, puis supprimées automatiquement. Leur consultation est réservée aux administrateurs autorisés chargés de la sécurité du jeu. Une IP ou un identifiant d’installation commun ne suffit pas à établir que deux comptes appartiennent à la même personne.</p>
      <p>Gobble conserve un cookie de session pour maintenir la connexion et utilise le stockage du navigateur pour reconnaître l’installation et mémoriser les réglages du jeu. Le journal de connexion n’ajoute aucun cookie publicitaire.</p>
      <p>Pour demander l’accès à ces données, leur rectification, leur effacement, la limitation du traitement ou exercer votre droit d’opposition selon les conditions du RGPD, contactez <a href="mailto:support@gobble.fr" className="underline underline-offset-2">support@gobble.fr</a>. Vous pouvez également adresser une réclamation à la <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">CNIL</a>.</p>
    </div>
  </details>;
}
