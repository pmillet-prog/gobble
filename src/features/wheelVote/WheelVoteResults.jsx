import React from 'react';
import { countWheelVotes } from '../../../shared/wheelVote.js';
import { wheelVoteApi } from './wheelVoteApi.js';
import { VoteDialogFrame } from './WheelVoteDialog.jsx';

export default function WheelVoteResults({ onClose }) {
  const [entries, setEntries] = React.useState(null), [error, setError] = React.useState('');
  const [selectedId, setSelectedId] = React.useState(null), [refresh, setRefresh] = React.useState(0);
  const body = React.useRef(null);
  React.useLayoutEffect(() => { if (body.current) body.current.scrollTop = 0; }, [selectedId]);
  React.useEffect(() => {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15_000);
    let active = true;
    setError('');
    wheelVoteApi('/api/dev/infortune/votes', { signal: abort.signal }).then(value => {
      if (active) setEntries(value.entries);
    }).catch(() => { if (active) setError('Résultats indisponibles. Un compte dev autorisé est nécessaire.'); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; abort.abort(); clearTimeout(timeout); };
  }, [refresh]);
  const selected = entries?.find(entry => entry.userId === selectedId);
  const totals = React.useMemo(() => countWheelVotes(selected ? [selected] : entries || []), [entries, selected]);
  const skipped = entries?.filter(entry => entry.status === 'skipped').length || 0;
  return <VoteDialogFrame title="Résultats du vote sur la roue" onClose={onClose}>
    <div ref={body} className="wheel-vote__body">
      <div className="wheel-vote__toolbar"><button aria-pressed={!selected} onClick={() => setSelectedId(null)}>Tous les votes</button>
        <button onClick={() => setRefresh(value => value + 1)}>Actualiser</button></div>
      {error && <p role="alert" className="wheel-vote__error">{error}</p>}
      {!entries ? <p role="status">{error ? 'Réessaie avec Actualiser.' : 'Chargement…'}</p> : <>
        <p>{entries.length - skipped} votant(s) · {skipped} joueur(s) ont passé. Plusieurs choix possibles par joueur.</p>
        <table className="wheel-vote__table"><caption>{selected ? `${selected.nick} · ${selected.status === 'skipped' ? 'A passé' : 'A voté'}` : 'Tous les votes'}</caption>
          <thead><tr><th scope="col">Proposition</th><th scope="col">{selected ? 'Choix' : 'Votes'}</th></tr></thead>
          <tbody>{totals.map(option => <tr key={option.id}><th scope="row">{option.id}. {option.label}</th><td>{selected ? option.count ? '✓' : '—' : option.count}</td></tr>)}</tbody>
        </table>
        {selected?.suggestion && <section className="wheel-vote__notice"><h2>Suggestion de {selected.nick}</h2><p className="wheel-vote__suggestion">{selected.suggestion}</p></section>}
        <h2>Joueurs</h2><p>Sélectionne un joueur pour consulter ses choix et sa suggestion.</p>
        <div className="wheel-vote__voters">{entries.map(entry => <button key={entry.userId} aria-pressed={entry.userId === selectedId} onClick={() => setSelectedId(entry.userId)}>
          <span>{entry.nick}</span><small>{entry.status === 'skipped' ? 'A passé' : `A voté${entry.suggestion ? ' · suggestion' : ''}`}</small>
        </button>)}</div>
        {!entries.length && <p>Aucun vote enregistré pour le moment.</p>}
      </>}
    </div>
  </VoteDialogFrame>;
}
