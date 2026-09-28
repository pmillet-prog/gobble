import React, { useState } from "react";
import PasswordRecoveryForm from "./PasswordRecoveryForm.jsx";
import { useRecoveryRequest } from "./useRecoveryRequest.js";
import "./accountRecovery.css";

export default function PasswordResetPage({ token }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);
  const [requestAnother, setRequestAnother] = useState(!token);
  const { submit, loading, error, setError } = useRecoveryRequest();
  async function save(event) {
    event.preventDefault();
    if (password !== confirmPassword) { setError("Les deux mots de passe ne correspondent pas."); return; }
    if (await submit("reset-password", { token, newPassword: password })) {
      setPassword(""); setConfirmPassword(""); setDone(true);
    }
  }
  return (
    <main className="account-recovery-page">
      <section className="account-recovery-card account-recovery" aria-labelledby="reset-title">
        <a href="/" className="account-recovery__brand">Gobble</a>
        <h1 id="reset-title">{done ? "Mot de passe modifié" : requestAnother ? "Récupérer mon compte" : "Choisis ton nouveau mot de passe"}</h1>
        {done ? <p role="status">Tu peux maintenant te connecter avec ton nouveau mot de passe. Tes anciennes sessions ont été déconnectées.</p>
          : requestAnother ? <>
            {!token ? <p>Ouvre le lien reçu par email, ou demande un nouveau lien ci-dessous.</p> : null}
            <PasswordRecoveryForm />
          </> : <>
            <p>Le lien reçu par email est valable 30 minutes et ne peut être utilisé qu’une fois.</p>
            <form onSubmit={save} className="account-recovery__form">
              <label>Nouveau mot de passe
                <input type="password" autoComplete="new-password" autoFocus required minLength={3} maxLength={200}
                  value={password} disabled={loading} onChange={event => setPassword(event.target.value)} />
              </label>
              <label>Confirmer le mot de passe
                <input type="password" autoComplete="new-password" required minLength={3} maxLength={200}
                  value={confirmPassword} disabled={loading} onChange={event => setConfirmPassword(event.target.value)} />
              </label>
              {error ? <p role="alert" className="account-recovery__error">{error}</p> : null}
              <button className="account-recovery__primary" type="submit" disabled={loading}>{loading ? "Modification en cours…" : "Enregistrer mon mot de passe"}</button>
            </form>
            <button className="account-recovery__link" type="button" disabled={loading} onClick={() => setRequestAnother(true)}>Lien expiré ou besoin d’aide ?</button>
          </>}
        <a className="account-recovery__secondary" href="/">{done ? "Retourner au jeu pour me connecter" : "Retourner au jeu"}</a>
      </section>
    </main>
  );
}
