import React from "react";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import { accountAdminRequest } from "./accountAdminApi.js";
import "./accountAdmin.css";

export default function ProfileAdminMenu({ userId, nickname, viewerUserId }) {
  const feature = useFeatureRuntime("accountAdmin");
  const allowed = useFeatureSelector(feature, state => state.allowed);
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [accounts, setAccounts] = React.useState([]);
  const [preview, setPreview] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [error, setError] = React.useState("");
  const operation = React.useRef(null);
  React.useEffect(() => {
    setAccounts([]);
    if (!open || mode !== "merge" || query.trim().length < 2) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      accountAdminRequest(`accounts?q=${encodeURIComponent(query.trim())}`, undefined, { signal: controller.signal })
        .then(result => setAccounts(result.accounts.filter(account => account.id !== userId && account.id !== viewerUserId)))
        .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, mode, query, userId, viewerUserId]);
  if (!allowed || !userId || userId === viewerUserId) return null;
  async function run(task) {
    setBusy(true); setError(""); setNotice("");
    try { await task(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function selectMode(next) {
    setMode(next); setPreview(null); setQuery(""); setNotice(""); setError("");
    operation.current = crypto.randomUUID();
  }
  return <section className="profile-admin">
    <button type="button" className="profile-admin-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)} disabled={busy}>Administration</button>
    {open ? <div className="profile-admin-menu">
      <p>Compte conservé : <strong>{nickname}</strong> · #{userId}</p>
      <div className="profile-admin-actions">
        <button type="button" disabled={busy} onClick={() => selectMode("reset")}>Réinitialiser le mot de passe</button>
        <button type="button" disabled={busy} onClick={() => selectMode("merge")}>Fusionner un compte</button>
      </div>
      {mode === "reset" ? <div className="profile-admin-confirm">
        <p>Le mot de passe de <strong>{nickname}</strong> deviendra <strong>gobble2026</strong>. Un nouveau mot de passe sera demandé à la prochaine connexion.</p>
        <button type="button" disabled={busy} onClick={() => run(async () => {
          await accountAdminRequest("accounts/reset-password", { targetId: userId, operationId: operation.current });
          setMode(""); setNotice("Mot de passe réinitialisé : gobble2026. Changement demandé à la prochaine connexion.");
        })}>Confirmer la réinitialisation</button>
      </div> : null}
      {mode === "merge" ? <div className="profile-admin-confirm">
        <label>Compte à fusionner dans {nickname}<input value={query} disabled={busy} placeholder="Pseudo du compte secondaire" onChange={event => { setQuery(event.target.value); setPreview(null); setError(""); }} /></label>
        {!preview && accounts.length ? <ul>{accounts.map(account => <li key={account.id}><button type="button" disabled={busy} onClick={() => run(async () => {
          setPreview(await accountAdminRequest("accounts/merge-preview", { targetId: userId, sourceId: account.id }));
          operation.current = crypto.randomUUID();
        })}>{account.username} · #{account.id}</button></li>)}</ul> : null}
        {preview ? <>
          <p><strong>{preview.source.username}</strong> → <strong>{preview.target.username}</strong></p>
          <p>{preview.newWords.toLocaleString("fr-FR")} mots supplémentaires, soit {preview.vocabulary.toLocaleString("fr-FR")} mots. Les compteurs sont additionnés et les meilleurs records conservés.</p>
          <p><strong>{preview.source.username} sera supprimé.</strong> Ses gobblars et ses autres achats ne seront pas transférés.</p>
          <button type="button" className="profile-admin-danger" disabled={busy} onClick={() => run(async () => {
            const result = await accountAdminRequest("accounts/merge", { token: preview.token, operationId: operation.current });
            setMode(""); setPreview(null);
            setNotice(`Fusion terminée : ${result.source.username} supprimé, ${result.vocabulary.toLocaleString("fr-FR")} mots conservés. Rouvre le profil pour actualiser les statistiques.`);
          })}>Fusionner et supprimer {preview.source.username}</button>
        </> : null}
      </div> : null}
      {busy ? <p role="status">Opération en cours…</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert" className="profile-admin-error">{error}</p> : null}
    </div> : null}
  </section>;
}
