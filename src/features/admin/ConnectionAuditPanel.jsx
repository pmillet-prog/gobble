import React from 'react';
import { accountAdminRequest } from './accountAdminApi.js';
import { CONNECTION_AUDIT_LABELS } from '../../../shared/connectionAudit.js';
import './connectionAudit.css';

const date = value => new Date(value).toLocaleString('fr-FR');

export default function ConnectionAuditPanel({ userId }) {
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const request = React.useRef(null);
  const load = React.useCallback(async (before = null) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError('');
    try {
      const page = await accountAdminRequest(`accounts/${userId}/connections${before ? `?before=${before}` : ''}`, undefined, { signal: controller.signal });
      if (!controller.signal.aborted) setResult(previous => ({ ...page,
        entries: before ? [...(previous?.entries || []), ...page.entries] : page.entries,
      }));
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [userId]);
  React.useEffect(() => {
    setResult(null); void load();
    return () => request.current?.abort();
  }, [load]);
  return <section className="connection-audit" aria-label="Historique des connexions">
    <div className="connection-audit-heading"><strong>Historique des connexions · compte #{userId}</strong>
      <button type="button" disabled={loading} onClick={() => load()}>Actualiser</button></div>
    <p>Observations lors des connexions et des ouvertures du jeu. Ce journal ne mesure pas la dernière activité en partie. Les anciennes connexions ne sont pas reconstituées.</p>
    <p>Une IP peut être partagée ou changer ; un installID est transmis par le navigateur. Ces rapprochements ne prouvent pas l’identité d’une personne.</p>
    {result ? <p>Conservation : {result.retentionDays} jours. Horaires dans le fuseau de votre navigateur.</p> : null}
    {error ? <p role="alert" className="profile-admin-error">{error}</p> : null}
    {result?.entries.length ? <div className="connection-audit-scroll" tabIndex={0} aria-label="Tableau des connexions">
      <table><thead><tr><th>Date</th><th>Événement</th><th>InstallID du navigateur</th><th>Adresse réseau</th></tr></thead>
        <tbody>{result.entries.map(entry => <tr key={entry.id}>
          <td><time dateTime={new Date(entry.observedAt).toISOString()}>{date(entry.observedAt)}</time></td>
          <td>{CONNECTION_AUDIT_LABELS[entry.kind] || entry.kind}<small>{entry.nick} · #{entry.userId}</small></td>
          <td><code>{entry.installId || 'Non transmis'}</code></td>
          <td><code>{entry.ip || 'Indisponible'}</code><small>{entry.ipSource === 'forwarded' ? 'Transmise par un proxy autorisé' : 'Adresse du pair réseau (proxy possible)'}</small></td>
        </tr>)}</tbody>
      </table>
    </div> : result && !loading ? <p>Aucune connexion enregistrée pour ce compte dans ce journal.</p> : null}
    {loading ? <p role="status">Chargement des connexions…</p> : null}
    {result?.nextBefore ? <button type="button" disabled={loading} onClick={() => load(result.nextBefore)}>Connexions plus anciennes</button> : null}
  </section>;
}
