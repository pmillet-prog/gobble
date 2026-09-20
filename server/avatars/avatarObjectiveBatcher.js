// One short timer while there is work, one persistence job at a time. No polling.
export function createAvatarObjectiveBatcher({ persist, onRewards, onError = console.warn, setTimer = setTimeout, clearTimer = clearTimeout, delayMs = 350 }) {
  const pending = new Map();
  let timer = null, inFlight = null, failures = 0, stopped = false;
  const keyOf = event => `${event.userId}:${event.objective}:${event.eventKey}`;
  const schedule = () => {
    if (stopped || timer || inFlight || !pending.size) return;
    timer = setTimer(() => { timer = null; void flush(); }, failures ? Math.min(15000, 1000 * 2 ** (failures - 1)) : delayMs);
    timer?.unref?.();
  };
  function flush() {
    if (inFlight) return inFlight;
    if (timer) { clearTimer(timer); timer = null; }
    const batch = [...pending.values()].slice(0, 128);
    if (!batch.length) return Promise.resolve();
    batch.forEach(event => pending.delete(keyOf(event)));
    inFlight = Promise.resolve().then(() => persist(batch)).then(result => {
      failures = 0;
      if (result?.rewards?.length) onRewards(result.rewards);
    }).catch(error => {
      failures++;
      batch.forEach(event => pending.set(keyOf(event), event));
      onError("Avatar objective persistence failed", error);
    }).finally(() => { inFlight = null; schedule(); });
    return inFlight;
  }
  return {
    record(event) { if (stopped) return; pending.set(keyOf(event), event); schedule(); },
    flush,
    stop() { stopped = true; if (timer) clearTimer(timer); timer = null; },
  };
}
