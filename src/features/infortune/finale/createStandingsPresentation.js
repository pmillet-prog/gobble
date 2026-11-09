import { createFeatureStore } from '../../../app/core/createFeatureStore.js';

export const STANDINGS_TIMING = Object.freeze({ cue: 550, count: 750, move: 950 });
export const standingKey = entry => String(entry.userId ? `user:${entry.userId}` : entry.playerKey || entry.nick);

// Server totals stay authoritative. This is only a short, queued presentation:
// show the bonus, count it into the old total, then move to the new rank.
export function createStandingsPresentation(initial, { timers = globalThis } = {}) {
  const store = createFeatureStore({ rows: initial, phase: 'idle', awards: {}, sequence: 0, instant: false });
  let latest = initial, target = initial, handle = null, instant = false;
  const clear = () => { if (handle !== null) timers.clearTimeout(handle); handle = null; };
  function settle() {
    clear(); store.patch({ rows: latest, awards: {}, phase: 'idle' });
  }
  function next(phase, delay, fn) {
    store.set('phase', phase);
    handle = timers.setTimeout(() => { handle = null; fn(); }, delay);
  }
  function present() {
    if (instant) { settle(); return; }
    const current = store.getState(), before = new Map(current.rows.map(row => [standingKey(row), row]));
    target = latest;
    const awards = {};
    for (const row of target) {
      const old = before.get(standingKey(row));
      if (old && row.wheelPoints > (old.wheelPoints || 0) && row.points > old.points)
        awards[standingKey(row)] = { from: old.points, to: row.points, gain: row.points - old.points };
    }
    if (!Object.keys(awards).length) { settle(); return; }
    store.patch({ awards, sequence: current.sequence + 1 });
    next('cue', STANDINGS_TIMING.cue, () => {
      next('count', STANDINGS_TIMING.count, () => {
        store.set('rows', target);
        next('move', STANDINGS_TIMING.move, () => {
          store.patch({ awards: {}, phase: 'idle' });
          present();
        });
      });
    });
  }
  return { store,
    update(rows) { latest = rows; if (store.getState().phase === 'idle' || instant) present(); },
    setInstant(value) { instant = value; store.set('instant', value); if (value) settle(); },
    dispose: clear,
  };
}
