// The shared server deadline owns this interlude, including resume/background.
export function createWheelLeaderPresentation({ timers = globalThis, now = Date.now, begin, prepare, skip = () => {} }) {
  let cue = null, timer = null, shown = false, expired = false;
  function refresh() {
    timers.clearTimeout(timer); timer = null;
    if (!cue) return;
    if (now() >= cue.endsAt) { if (!expired) { expired = true; skip(); } return; }
    if (now() >= cue.startsAt) { if (!shown) { shown = true; begin(cue); } }
    else timer = timers.setTimeout(refresh, cue.startsAt - now());
  }
  return { receive(value, offset = 0) {
    if (!value?.id || !Array.isArray(value.leaders) || !Number.isFinite(value.startsAt) || !Number.isFinite(value.endsAt)
      || value.endsAt <= value.startsAt || cue?.id === value.id) return;
    shown = expired = false;
    cue = { ...value, startsAt: value.startsAt - offset, endsAt: value.endsAt - offset };
    if (now() < cue.endsAt) prepare(cue);
    refresh();
  }, refresh, reset() { timers.clearTimeout(timer); timer = null; cue = null; shown = expired = false; } };
}
