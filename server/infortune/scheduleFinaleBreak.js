// Own the lobby timer alongside the finale, and keep reconnect/podium snapshots
// aligned whenever the server shortens the collective countdown.
export function scheduleFinaleBreak({ room, finale, afterPodiumMs, publish, enterLobby, now = Date.now, timers = globalThis }) {
  const round = room.currentRound, breakState = room.breakState;
  let timer = null, disposed = false;
  const current = () => !disposed && room.currentRound === round && room.breakState === breakState && room.infortuneFinale === finale;
  function update(value) {
    if (!current()) return;
    const changed = breakState.tournamentSummaryAt !== value.podiumAt;
    breakState.infortuneFinale = value;
    breakState.tournamentSummaryAt = value.podiumAt;
    breakState.nextStartAt = value.podiumAt + afterPodiumMs;
    const payload = room.lastRoundResults?.payload;
    if (payload) Object.assign(payload, { tournamentSummaryAt: value.podiumAt, infortuneFinale: value });
    if (changed) publish({ roomId: room.id, ...breakState });
    if (timer !== null && !changed) return;
    timers.clearTimeout(timer);
    timer = timers.setTimeout(() => { timer = null; if (current()) enterLobby(room); }, Math.max(0, breakState.nextStartAt - now()));
    timer?.unref?.();
  }
  update(finale.publicSnapshot());
  return { update, dispose() { disposed = true; timers.clearTimeout(timer); timer = null; } };
}
