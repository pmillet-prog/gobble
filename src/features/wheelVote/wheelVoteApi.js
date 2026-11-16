export async function wheelVoteApi(path = '/api/infortune/vote', { signal, vote } = {}) {
  const response = await fetch(path, {
    credentials: 'include', cache: 'no-store', signal,
    ...(vote ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vote) } : {}),
  });
  const value = await response.json();
  if (!response.ok || !value.ok) throw new Error(value.error || 'vote_unavailable');
  return value;
}
