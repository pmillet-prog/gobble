// Presentation only: the server has already accounted for the spin. The land
// callback releases the displayed balance, the finish callback acknowledges it.
export const WHEEL_PAYOUT_TIMING = Object.freeze({ land: 1200, finish: 2300 });

export function createWheelPayoutPresentation({ change, land, finish, timers = globalThis, now = Date.now }) {
  let started = null, landed = false, finished = false, timer = null, timing;
  function advance(skip = false) {
    if (started === null || finished) return;
    timers.clearTimeout(timer);
    const elapsed = skip ? Infinity : now() - started;
    if (!landed && elapsed >= timing.land) { landed = true; change('landed'); land(); }
    if (elapsed >= timing.finish) { finished = true; change('done'); finish(); }
    else timer = timers.setTimeout(advance, Math.max(0, (landed ? timing.finish : timing.land) - elapsed));
  }
  return {
    start({ reduced = false, hidden = false } = {}) {
      if (started !== null) return;
      timing = reduced ? { land: 150, finish: 450 } : WHEEL_PAYOUT_TIMING;
      started = now(); change('flying'); advance(hidden);
    },
    advance,
    dispose() { timers.clearTimeout(timer); finished = true; },
  };
}
