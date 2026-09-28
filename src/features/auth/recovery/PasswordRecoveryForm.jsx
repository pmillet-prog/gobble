import React, { useState } from "react";
import { useRecoveryRequest } from "./useRecoveryRequest.js";
import "./accountRecovery.css";

export default function PasswordRecoveryForm({ initialUsername = "", darkMode = false, onBack }) {
  const [username, setUsername] = useState(initialUsername);
  const [support, setSupport] = useState(false);
  const [message, setMessage] = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [supportSent, setSupportSent] = useState(false);
  const { submit, loading, error, setError } = useRecoveryRequest();
  async function send(event) {
    event.preventDefault();
    setNotice("");
    const ok = await submit(support ? "account-recovery-support" : "request-password-reset", support
      ? { username, message, replyEmail } : { username });
    if (ok) {
      setSupportSent(support);
      setNotice(support
        ? "Ta demande a été envoyée à l’administrateur. La récupération sera traitée manuellement."
        : "Si ce compte possède une adresse email, tu recevras un lien valable 30 minutes. Vérifie aussi tes courriers indésirables. Si tu ne reçois rien, utilise « Demander de l’aide »." );
    }
  }
  function switchMode() {
    setSupport(!support);
    setError("");
    setNotice("");
  }
  return (
    <div className={`account-recovery${darkMode ? " account-recovery--dark" : ""}`}>
      <form onSubmit={send} className="account-recovery__form">
        <label>Pseudo du compte
          <input autoFocus autoComplete="username" required maxLength={100} value={username}
            disabled={loading || (support && supportSent)} onChange={event => setUsername(event.target.value)} />
        </label>
        {support ? <>
          <p>Pas d’adresse enregistrée, plus accès à ta boîte mail ou aucun lien reçu ? Décris ton problème pour demander de l’aide.</p>
          <label>Ton message
            <textarea required minLength={10} maxLength={3000} rows={4} value={message}
              disabled={loading || supportSent} onChange={event => setMessage(event.target.value)} />
          </label>
          <label>Email de contact (facultatif)
            <input type="email" autoComplete="email" maxLength={254} value={replyEmail}
              disabled={loading || supportSent} onChange={event => setReplyEmail(event.target.value)} />
          </label>
          <p className="account-recovery__hint">Indique où te répondre, ici ou dans ton message. Ne communique jamais ton mot de passe.</p>
        </> : <p>Le lien sera envoyé à l’adresse renseignée lors de ton inscription.</p>}
        {error ? <p role="alert" className="account-recovery__error">{error}</p> : null}
        {notice ? <p role="status" className="account-recovery__notice">{notice}</p> : null}
        <button type="submit" className="account-recovery__primary" disabled={loading || (support && supportSent)}>
          {loading ? "Envoi en cours…" : support ? "Envoyer ma demande d’aide" : "Recevoir un lien par email"}
        </button>
      </form>
      <button type="button" className="account-recovery__link" onClick={switchMode} disabled={loading}>
        {support ? "Revenir à l’envoi d’un lien" : "Pas d’email ou besoin d’aide ? Demander de l’aide"}
      </button>
      <p className="account-recovery__hint">Tu peux aussi écrire à <a href="mailto:support@gobble.fr">support@gobble.fr</a>.</p>
      {onBack ? <button type="button" className="account-recovery__secondary" disabled={loading} onClick={onBack}>Retour à la connexion</button> : null}
    </div>
  );
}
