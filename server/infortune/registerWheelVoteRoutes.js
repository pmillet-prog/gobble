import { WHEEL_VOTE_ID, WHEEL_VOTE_MIN_ROUNDS, normalizeWheelVote, countWheelVotes } from '../../shared/wheelVote.js';

export function registerWheelVoteRoutes(app, { readAccount, isAllowed, readRoundCount, repository }) {
  const route = handler => async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      const account = await readAccount(request);
      if (!account) return response.status(401).json({ ok: false, error: 'auth_required' });
      return await handler(request, response, account);
    } catch { return response.status(503).json({ ok: false, error: 'vote_unavailable' }); }
  };
  app.get('/api/infortune/vote', route(async (_request, response, account) => {
    const [rounds, vote] = await Promise.all([readRoundCount(account.id), repository.read(account.id)]);
    return response.json({ ok: true, pollId: WHEEL_VOTE_ID, eligible: rounds >= WHEEL_VOTE_MIN_ROUNDS, vote });
  }));
  app.post('/api/infortune/vote', route(async (request, response, account) => {
    if (request.headers['sec-fetch-site'] === 'cross-site') return response.status(403).json({ ok: false, error: 'cross_site' });
    if (!String(request.headers['content-type'] || '').startsWith('application/json')) return response.status(415).json({ ok: false });
    let vote;
    try { vote = normalizeWheelVote(request.body); }
    catch { return response.status(400).json({ ok: false, error: 'invalid_vote' }); }
    if (await readRoundCount(account.id) < WHEEL_VOTE_MIN_ROUNDS)
      return response.status(403).json({ ok: false, error: 'not_eligible' });
    return response.json({ ok: true, vote: await repository.save(account, vote) });
  }));
  app.get('/api/dev/infortune/votes', route(async (_request, response, account) => {
    if (!isAllowed(account)) return response.status(403).json({ ok: false, error: 'dev_required' });
    const entries = await repository.list();
    return response.json({ ok: true, pollId: WHEEL_VOTE_ID, entries, totals: countWheelVotes(entries) });
  }));
}
